import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import {
  connectCodeSandboxTerminal,
  getCodeSandboxPreviewUrl,
  syncBuilderCodeSandboxProjectMirror,
} from '@/lib/builder/codesandbox';
import { type BuilderRuntime, ensureBuilderBox, installBunInBuilderBox, seedBuilderWorkspace } from '@/lib/builder/box';
import {
  getBuilderProjectRemoteWorkspaceRoot,
  getBuilderProjectServerRuntimeProvider,
} from '@/lib/builder/project-metadata';
import { inferBuilderPreviewPort } from '@/lib/builder/preview';
import {
  createBuilderTerminalCommand,
  getBuilderTerminalStatePaths,
  normalizeBuilderTerminalCwd,
} from '@/lib/builder/terminal';
import { getBuilderProjectByIdForUser } from '@/lib/db/builder-project-queries';
import { updateBuildSession } from '@/lib/db/queries';

export const runtime = 'nodejs';

const SUPPORTED_RUNTIMES = new Set<BuilderRuntime>(['node', 'python', 'golang', 'ruby', 'rust']);

function resolveRuntime(value: string | null | undefined): BuilderRuntime {
  return value && SUPPORTED_RUNTIMES.has(value as BuilderRuntime) ? (value as BuilderRuntime) : 'node';
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function buildCodeSandboxWrappedCommand({ command, cwd, marker }: { command: string; cwd: string; marker: string }) {
  const encodedCommand = Buffer.from(command, 'utf8').toString('base64');
  return [
    `cd -- ${shellEscape(cwd)} || exit 1`,
    '__indexblue_tmp="$(mktemp /tmp/indexblue-terminal.XXXXXX.sh)"',
    `printf '%s' ${shellEscape(encodedCommand)} | base64 -d > "$__indexblue_tmp"`,
    `. "$__indexblue_tmp"`,
    '__indexblue_exit_code=$?',
    'rm -f "$__indexblue_tmp"',
    '__indexblue_cwd="$(pwd | base64 | tr -d \'\\n\')"',
    `printf '\\n${marker}\\t%s\\t%s\\n' "$__indexblue_exit_code" "$__indexblue_cwd"`,
  ].join('; ');
}

function consumeCodeSandboxWrappedCommandEcho(buffer: string, marker: string) {
  const trimmedLeading = buffer.replace(/^[\r\n]+/, '');
  if (trimmedLeading.length === 0) {
    return {
      buffer,
      pending: true,
      stripped: false,
    };
  }

  if (!trimmedLeading.startsWith('cd -- ')) {
    return {
      buffer,
      pending: false,
      stripped: false,
    };
  }

  const echoNeedles = ['__indexblue_exit_code=$?', '__indexblue_cwd=', `printf '\\n${marker}`];
  let needleIndex = -1;

  for (const needle of echoNeedles) {
    const index = buffer.indexOf(needle);
    if (index !== -1 && (needleIndex === -1 || index < needleIndex)) {
      needleIndex = index;
    }
  }

  if (needleIndex === -1) {
    return {
      buffer,
      pending: true,
      stripped: false,
    };
  }

  const newlineIndex = buffer.indexOf('\n', needleIndex);
  if (newlineIndex === -1) {
    return {
      buffer,
      pending: true,
      stripped: false,
    };
  }

  return {
    buffer: buffer.slice(newlineIndex + 1),
    pending: false,
    stripped: true,
  };
}

function sanitizeCodeSandboxTerminalChunk(chunk: string, marker: string) {
  if (!chunk) return chunk;

  const lines = chunk.match(/[^\r\n]*(?:\r?\n|$)/g) ?? [chunk];
  return lines
    .filter((line) => {
      const normalized = line.trim();
      if (!normalized) return true;

      if (!normalized.startsWith('cd -- ')) {
        return true;
      }

      return !(
        normalized.includes('__indexblue_exit_code=$?') ||
        normalized.includes('__indexblue_cwd=') ||
        normalized.includes(marker)
      );
    })
    .join('');
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    command?: string;
    cwd?: string | null;
    terminalId?: string;
    providerTerminalId?: string | null;
  } | null;
  const command = typeof body?.command === 'string' ? body.command.replace(/\r\n?/g, '\n') : '';
  const trimmedCommand = command.trim();
  const terminalId = body?.terminalId?.trim() || 'default';

  if (!trimmedCommand) {
    return Response.json({ error: 'command is required.' }, { status: 400 });
  }

  const { projectId } = await params;
  const project = await getBuilderProjectByIdForUser({
    projectId,
    userId: session.user.id,
  });

  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  const hasWorkspace = Boolean(project.workspacePath);
  const remoteWorkspaceRoot = getBuilderProjectRemoteWorkspaceRoot(project);
  const runtimeProvider = getBuilderProjectServerRuntimeProvider(project);
  const requestedCwd = normalizeBuilderTerminalCwd(body?.cwd, hasWorkspace, remoteWorkspaceRoot);
  const runtime = resolveRuntime(project.buildRuntime);

  try {
    if (runtimeProvider === 'codesandbox') {
      const sandboxId = project.boxId ?? project.metadata?.liveSession?.sandboxId ?? null;

      if (!sandboxId) {
        return Response.json({ error: 'This CodeSandbox project is missing its sandbox session.' }, { status: 400 });
      }

      const { terminal } = await connectCodeSandboxTerminal({
        sandboxId,
        userId: session.user.id,
        runtime,
        providerTerminalId: body?.providerTerminalId ?? null,
        cwd: requestedCwd,
      });

      const previewPort = inferBuilderPreviewPort(trimmedCommand);
      const previewUrl = previewPort ? getCodeSandboxPreviewUrl(sandboxId, previewPort) : null;
      const encoder = new TextEncoder();
      const marker = `__INDEXBLUE_DONE_${Date.now()}_${Math.random().toString(36).slice(2, 10)}__`;

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let closed = false;
          let resolved = false;
          let outputBuffer = '';
          let pendingWrappedCommandEcho = true;

          const close = () => {
            if (closed) return;
            closed = true;
            controller.close();
          };

          const write = (payload: Record<string, unknown>) => {
            if (closed) return;

            try {
              controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
            } catch {
              closed = true;
            }
          };

          const flushOutput = async (force = false) => {
            if (resolved) return;

            if (pendingWrappedCommandEcho) {
              const consumed = consumeCodeSandboxWrappedCommandEcho(outputBuffer, marker);
              outputBuffer = consumed.buffer;

              if (consumed.pending && !force) {
                return;
              }

              pendingWrappedCommandEcho = false;
            }

            const markerIndex = outputBuffer.indexOf(marker);
            if (markerIndex === -1) {
              const safeLength = force ? outputBuffer.length : Math.max(0, outputBuffer.length - marker.length - 96);
              if (safeLength > 0) {
                const nextChunk = sanitizeCodeSandboxTerminalChunk(outputBuffer.slice(0, safeLength), marker);
                outputBuffer = outputBuffer.slice(safeLength);

                if (!nextChunk) {
                  return;
                }

                write({
                  type: 'output',
                  chunk: nextChunk,
                });
              }
              return;
            }

            const beforeMarker = sanitizeCodeSandboxTerminalChunk(outputBuffer.slice(0, markerIndex), marker);
            if (beforeMarker) {
              write({
                type: 'output',
                chunk: beforeMarker,
              });
            }

            const afterMarker = outputBuffer.slice(markerIndex);
            const lineBreakIndex = afterMarker.search(/\r?\n/);
            if (lineBreakIndex === -1) {
              outputBuffer = outputBuffer.slice(markerIndex);
              return;
            }

            const markerLine = afterMarker.slice(0, lineBreakIndex).trim();
            const [, exitCodeRaw, cwdBase64] = markerLine.split('\t');
            const nextCwd =
              cwdBase64 && cwdBase64.length > 0 ? Buffer.from(cwdBase64, 'base64').toString('utf8') : requestedCwd;

            resolved = true;
            outputBuffer = '';

            await syncBuilderCodeSandboxProjectMirror({
              project,
              userId: session.user.id,
              resetLocal: true,
            }).catch(() => undefined);

            write({
              type: 'exit',
              exitCode: Number(exitCodeRaw || 0),
              cwd: nextCwd,
            });
            close();
          };

          const terminalSubscription = terminal.onOutput((chunk) => {
            outputBuffer += chunk;
            void flushOutput(false);
          });

          request.signal.addEventListener('abort', () => {
            terminal.write('\u0003').catch(() => undefined);
            write({
              type: 'cancelled',
              message: 'Command cancelled.',
            });
            terminalSubscription.dispose();
            close();
          });

          write({
            type: 'started',
            boxId: sandboxId,
            providerTerminalId: terminal.id,
            cwd: requestedCwd,
            command,
            isNewBox: false,
          });

          if (previewPort && previewUrl) {
            write({
              type: 'preview',
              port: previewPort,
              url: previewUrl,
            });
          }

          try {
            await terminal.open().catch(() => '');

            await terminal.run(
              buildCodeSandboxWrappedCommand({
                command,
                cwd: requestedCwd,
                marker,
              }),
            );
          } catch (error) {
            terminalSubscription.dispose();
            write({
              type: 'error',
              message: error instanceof Error ? error.message : 'Failed to execute the CodeSandbox terminal command.',
            });
            close();
            return;
          }

          const pollForCompletion = async () => {
            const startedAt = Date.now();
            while (!resolved && !closed && Date.now() - startedAt < 15 * 60 * 1000) {
              await new Promise((resolve) => setTimeout(resolve, 150));
              await flushOutput(false);
            }

            terminalSubscription.dispose();

            if (!resolved && !closed) {
              await flushOutput(true);
              write({
                type: 'error',
                message: 'CodeSandbox terminal command timed out before completion.',
              });
              close();
            }
          };

          void pollForCompletion();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
        },
      });
    }

    const { box, isNew } = await ensureBuilderBox({
      userId: session.user.id,
      existingBoxId: project.boxId ?? null,
      runtime,
      provider: runtimeProvider,
      workspacePath: project.workspacePath ?? null,
    });

    if (isNew) {
      await Promise.all([
        installBunInBuilderBox(box).catch((error) => {
          console.warn('Builder terminal Bun install failed:', error);
        }),
        seedBuilderWorkspace(box, project.workspacePath ?? null, {
          remoteRoot: remoteWorkspaceRoot,
        }).catch((error) => {
          console.warn('Builder terminal workspace seed failed:', error);
          return false;
        }),
      ]);
    }

    await updateBuildSession({
      chatId: project.chatId,
      status: 'active',
      boxId: box.id,
      runtime,
    });

    const { cwdFile, sessionFile } = getBuilderTerminalStatePaths(project.id, terminalId);
    const shellCommand = createBuilderTerminalCommand({
      command,
      cwd: requestedCwd,
      cwdFile,
      sessionFile,
    });
    const streamRun = await box.exec.stream(shellCommand);
    const previewPort = inferBuilderPreviewPort(trimmedCommand);
    const previewUrl = previewPort ? box.getPreviewUrl(previewPort) : null;

    request.signal.addEventListener('abort', () => {
      streamRun.cancel().catch(() => undefined);
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let isClosed = false;
        const close = () => {
          if (isClosed) return;
          isClosed = true;
          controller.close();
        };
        const write = (payload: Record<string, unknown>) => {
          if (isClosed) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
          } catch {
            isClosed = true;
          }
        };

        write({
          type: 'started',
          boxId: box.id,
          cwd: requestedCwd,
          command,
          isNewBox: isNew,
        });
        if (previewPort && previewUrl) {
          write({
            type: 'preview',
            port: previewPort,
            url: previewUrl,
          });
        }

        try {
          for await (const chunk of streamRun) {
            if (chunk.type === 'output') {
              write({
                type: 'output',
                chunk: chunk.data,
              });
            }
          }

          const nextCwd = normalizeBuilderTerminalCwd(
            await box.files.read(cwdFile).catch(() => requestedCwd),
            hasWorkspace,
            remoteWorkspaceRoot,
          );

          write({
            type: 'exit',
            exitCode: streamRun.exitCode ?? 0,
            cwd: nextCwd,
          });
        } catch (error) {
          write({
            type: request.signal.aborted ? 'cancelled' : 'error',
            message: error instanceof Error ? error.message : 'Failed to execute command.',
          });
        } finally {
          close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to start terminal command.',
      },
      { status: 500 },
    );
  }
}
