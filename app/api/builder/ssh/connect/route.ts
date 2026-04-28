import { spawn } from 'node:child_process';
import { Socket } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createBuilderProjectFromWorkspace } from '@/lib/builder/projects';

export const runtime = 'nodejs';

const sshSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().min(1),
  authMode: z.enum(['config', 'key', 'password']),
  configContent: z.string().optional(),
  keyContent: z.string().optional(),
  passphrase: z.string().optional(),
  password: z.string().optional(),
});

function emit(controller: ReadableStreamDefaultController<Uint8Array>, payload: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(`${JSON.stringify(payload)}\n`));
}

function runTcpProbe(host: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    const socket = new Socket();

    socket.setTimeout(10000);
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timed out.'));
    });
    socket.once('error', (error) => {
      socket.destroy();
      reject(error);
    });

    socket.connect(port, host);
  });
}

function chunkToLines(buffer: string, chunk: Buffer | string) {
  const combined = buffer + chunk.toString();
  const parts = combined.split(/\r?\n/);
  return {
    lines: parts.slice(0, -1),
    remainder: parts.at(-1) ?? '',
  };
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = sshSchema.safeParse(await request.json());

  if (!parsed.success) {
    return Response.json({ error: 'Invalid SSH payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let workDir: string | null = null;

      try {
        const { host, port, username, authMode, configContent, keyContent, passphrase } = parsed.data;
        emit(controller, { type: 'log', message: `Preparing SSH session for ${username}@${host}:${port}...` });

        workDir = await mkdtemp(path.join(tmpdir(), 'indexblue-builder-ssh-'));

        if (authMode === 'password') {
          emit(controller, { type: 'log', message: 'Checking server reachability for password auth...' });
          await runTcpProbe(host, port);
          const { project, redirectTo } = await createBuilderProjectFromWorkspace({
            userId: session.user.id,
            sourceType: 'ssh',
            workspacePath: null,
            fallbackName: `${username}@${host}`,
            metadata: {
              sourceLabel: 'SSH Workspace',
              sourceUrl: `ssh://${username}@${host}:${port}`,
              importMeta: {
                host,
                port,
                username,
                authMode,
              },
            },
          });
          emit(controller, {
            type: 'done',
            message: 'Server is reachable. Password auth can be entered client-side on the next step.',
            status: 'reachable',
            projectId: project.id,
            redirectTo,
          });
          controller.close();
          return;
        }

        const env = { ...process.env };
        const sshArgs = ['-p', String(port), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12', '-o', 'StrictHostKeyChecking=no'];

        if (authMode === 'config') {
          if (!configContent?.trim()) {
            emit(controller, { type: 'error', message: 'SSH config content is required.' });
            controller.close();
            return;
          }

          const configPath = path.join(workDir, 'config');
          await writeFile(configPath, configContent, { mode: 0o600 });
          sshArgs.unshift('-F', configPath);
          emit(controller, { type: 'log', message: 'Using uploaded SSH config.' });
        }

        if (authMode === 'key') {
          if (!keyContent?.trim()) {
            emit(controller, { type: 'error', message: 'Private key content is required.' });
            controller.close();
            return;
          }

          const keyPath = path.join(workDir, 'id_builder');
          await writeFile(keyPath, keyContent, { mode: 0o600 });
          sshArgs.push('-i', keyPath, '-o', 'IdentitiesOnly=yes');
          if (passphrase?.trim()) {
            emit(controller, { type: 'log', message: 'Passphrase provided for the uploaded key.' });
          }
          emit(controller, { type: 'log', message: 'Using uploaded private key.' });
        }

        sshArgs.push(`${username}@${host}`, 'printf', 'indexblue-ssh-connected');
        emit(controller, { type: 'log', message: 'Opening SSH connection...' });

        const child = spawn('ssh', sshArgs, {
          cwd: workDir,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdoutRemainder = '';
        let stderrRemainder = '';
        let stdoutCapture = '';

        child.stdout.on('data', (chunk) => {
          stdoutCapture += chunk.toString();
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

          if (workDir) {
            await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
          }

          if (code === 0 && stdoutCapture.includes('indexblue-ssh-connected')) {
            const { project, redirectTo } = await createBuilderProjectFromWorkspace({
              userId: session.user.id,
              sourceType: 'ssh',
              workspacePath: null,
              fallbackName: `${username}@${host}`,
              metadata: {
                sourceLabel: 'SSH Workspace',
                sourceUrl: `ssh://${username}@${host}:${port}`,
                importMeta: {
                  host,
                  port,
                  username,
                  authMode,
                },
              },
            });
            emit(controller, {
              type: 'done',
              message: 'SSH connection verified successfully.',
              status: 'connected',
              projectId: project.id,
              redirectTo,
            });
          } else {
            emit(controller, {
              type: 'error',
              message: `SSH connection failed with exit code ${code ?? 'unknown'}.`,
            });
          }

          controller.close();
        });
      } catch (error) {
        if (workDir) {
          await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
        }

        emit(controller, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Unexpected SSH connection error.',
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
