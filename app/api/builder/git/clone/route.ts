import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { bootstrapBuilderAppProjectSession } from '@/lib/builder/app-session';
import { createBuilderProjectFromWorkspace } from '@/lib/builder/projects';

export const runtime = 'nodejs';

const cloneSchema = z.object({
  mode: z.enum(['local', 'web', 'apps']).optional(),
  repoUrl: z.string().min(1),
  authMode: z.enum(['public', 'token', 'ssh']),
  token: z.string().optional(),
  sshKey: z.string().optional(),
});

function sanitizeFolderName(repoUrl: string) {
  const rawName = repoUrl.split('/').pop() ?? 'workspace';
  return rawName.replace(/\.git$/i, '').replace(/[^a-zA-Z0-9._-]/g, '-');
}

function buildAuthenticatedUrl(repoUrl: string, token: string) {
  const url = new URL(repoUrl);
  url.username = 'x-access-token';
  url.password = token;
  return url.toString();
}

function emit(controller: ReadableStreamDefaultController<Uint8Array>, payload: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(`${JSON.stringify(payload)}\n`));
}

function chunkToLines(buffer: string, chunk: Buffer | string) {
  const combined = buffer + chunk.toString();
  const parts = combined.split(/\r?\n/);
  return {
    lines: parts.slice(0, -1),
    remainder: parts.at(-1) ?? '',
  };
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = cloneSchema.safeParse(await request.json());

  if (!parsed.success) {
    return Response.json({ error: 'Invalid clone request', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { repoUrl, authMode, token, sshKey } = parsed.data;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sshKeyPath: string | null = null;

      try {
        emit(controller, { type: 'log', message: 'Preparing workspace...' });

        const workspaceRoot = path.join(tmpdir(), 'indexblue-builder-workspaces');
        await mkdir(workspaceRoot, { recursive: true });

        const cloneBaseName = sanitizeFolderName(repoUrl);
        const targetRoot = await mkdtemp(path.join(workspaceRoot, `${cloneBaseName}-`));
        const targetDir = path.join(targetRoot, cloneBaseName);

        let effectiveUrl = repoUrl;
        const env = { ...process.env };

        if (authMode === 'token') {
          if (!token) {
            emit(controller, { type: 'error', message: 'Access token is required for token auth.' });
            controller.close();
            return;
          }

          effectiveUrl = buildAuthenticatedUrl(repoUrl, token);
          emit(controller, { type: 'log', message: 'Using token authentication...' });
        }

        if (authMode === 'ssh') {
          if (!sshKey) {
            emit(controller, { type: 'error', message: 'SSH key is required for SSH auth.' });
            controller.close();
            return;
          }

          sshKeyPath = path.join(targetRoot, 'builder-clone-key');
          await writeFile(sshKeyPath, sshKey, { mode: 0o600 });
          env.GIT_SSH_COMMAND = `ssh -i "${sshKeyPath}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no`;
          emit(controller, { type: 'log', message: 'Using SSH key authentication...' });
        }

        emit(controller, { type: 'log', message: `Cloning ${repoUrl}...` });

        const child = spawn('git', ['clone', '--progress', effectiveUrl, targetDir], {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdoutRemainder = '';
        let stderrRemainder = '';

        child.stdout.on('data', (chunk) => {
          const next = chunkToLines(stdoutRemainder, chunk);
          stdoutRemainder = next.remainder;
          next.lines.filter(Boolean).forEach((line) => emit(controller, { type: 'log', message: line }));
        });

        child.stderr.on('data', (chunk) => {
          const next = chunkToLines(stderrRemainder, chunk);
          stderrRemainder = next.remainder;
          next.lines.filter(Boolean).forEach((line) => emit(controller, { type: 'log', message: line }));
        });

        child.on('error', (error) => {
          emit(controller, { type: 'error', message: error.message });
          controller.close();
        });

        child.on('close', async (code) => {
          if (stdoutRemainder.trim()) emit(controller, { type: 'log', message: stdoutRemainder.trim() });
          if (stderrRemainder.trim()) emit(controller, { type: 'log', message: stderrRemainder.trim() });

          if (sshKeyPath) {
            await rm(sshKeyPath, { force: true });
          }

          if (code === 0) {
            const { project, redirectTo } = await createBuilderProjectFromWorkspace({
              userId: session.user.id,
              sourceType: 'github',
              workspacePath: targetDir,
              fallbackName: cloneBaseName,
              metadata: {
                sourceLabel: 'Git Repository',
                sourceUrl: repoUrl,
                importMeta: {
                  mode: parsed.data.mode ?? 'web',
                  builderMode: parsed.data.mode ?? 'web',
                  platform: parsed.data.mode === 'apps' ? 'mobile' : 'web',
                  authMode,
                },
              },
            });

            let previewUrl: string | null = null;
            if ((parsed.data.mode ?? 'web') === 'apps') {
              emit(controller, { type: 'log', message: 'Booting mobile app session...' });
              try {
                const boot = await bootstrapBuilderAppProjectSession({
                  project: {
                    id: project.id,
                    userId: session.user.id,
                    chatId: project.chatId,
                    name: project.name,
                    sourceType: project.sourceType,
                    workspacePath: project.workspacePath,
                    theme: project.theme,
                    metadata: project.metadata,
                    buildRuntime: null,
                    boxId: null,
                  },
                  reseedWorkspace: true,
                });
                previewUrl = boot.liveSession.previewUrl;
                emit(controller, {
                  type: 'log',
                  message: previewUrl
                    ? `Mobile preview ready at ${previewUrl}`
                    : 'Mobile app session booted. Preview is still warming up.',
                });
              } catch (error) {
                emit(controller, {
                  type: 'log',
                  message: `Mobile app session bootstrap failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                });
              }
            }
            emit(controller, {
              type: 'done',
              message: 'Repository cloned successfully.',
              targetDir,
              projectId: project.id,
              redirectTo,
              previewUrl,
            });
          } else {
            emit(controller, {
              type: 'error',
              message: `git clone failed with exit code ${code ?? 'unknown'}.`,
            });
          }

          controller.close();
        });
      } catch (error) {
        if (sshKeyPath) {
          await rm(sshKeyPath, { force: true }).catch(() => undefined);
        }

        emit(controller, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Unexpected clone error.',
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
