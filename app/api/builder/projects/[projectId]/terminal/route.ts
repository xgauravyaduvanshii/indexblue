import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { type BuilderRuntime, ensureBuilderBox, installBunInBuilderBox, seedBuilderWorkspace } from '@/lib/builder/box';
import { getBuilderProjectRemoteWorkspaceRoot } from '@/lib/builder/project-metadata';
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    command?: string;
    cwd?: string | null;
    terminalId?: string;
  } | null;
  const command = body?.command?.trim();
  const terminalId = body?.terminalId?.trim() || 'default';

  if (!command) {
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
  const requestedCwd = normalizeBuilderTerminalCwd(body?.cwd, hasWorkspace, remoteWorkspaceRoot);
  const runtime = resolveRuntime(project.buildRuntime);

  try {
    const { box, isNew } = await ensureBuilderBox({
      userId: session.user.id,
      existingBoxId: project.boxId ?? null,
      runtime,
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
    const previewPort = inferBuilderPreviewPort(command);
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
