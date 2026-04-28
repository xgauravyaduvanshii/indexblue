import 'server-only';

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { serverEnv } from '@/env/server';
import { createE2BAgentRun, type BuilderAgentRun } from '@/lib/builder/e2b-agent';
import { withNativeFetch } from '@/lib/builder/e2b-fetch';
import { isCommandExitError, loadE2BModule } from '@/lib/builder/e2b-sdk';
import { BUILDER_BOX_ROOT, BUILDER_REMOTE_PROJECT_PATH } from '@/lib/builder/paths';

const execFileAsync = promisify(execFile);

export type BuilderRuntime = 'node' | 'python' | 'golang' | 'ruby' | 'rust';

export type BuilderExecStreamChunk = {
  type: 'output';
  data: string;
};

export type BuilderExecStream = AsyncIterable<BuilderExecStreamChunk> & {
  exitCode?: number;
  cancel: () => Promise<void>;
};

export type BuilderExecResult = {
  result?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type BuilderCodeExecResult = {
  result: string;
  exitCode: number;
};

type E2BCommandHandle = import('@e2b/code-interpreter').CommandHandle;
type E2BSandbox = import('@e2b/code-interpreter').Sandbox;

export type BuilderSandbox = {
  id: string;
  exec: {
    command: (command: string) => Promise<BuilderExecResult>;
    stream: (command: string) => Promise<BuilderExecStream>;
    code: (input: { code: string; lang: 'js' | 'ts' | 'python' }) => Promise<BuilderCodeExecResult>;
  };
  files: {
    write: (input: { path: string; content: string }) => Promise<void>;
    read: (path: string) => Promise<string>;
  };
  agent: {
    stream: (input: {
      prompt: string;
      onToolUse?: (tool: { name: string; input?: Record<string, unknown> }) => void;
    }) => Promise<BuilderAgentRun>;
  };
  getPreviewUrl: (port: number) => string;
};

export const DEFAULT_BUILDER_RUNTIME: BuilderRuntime = 'node';

const DEFAULT_SANDBOX_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function createBuilderSandboxEnv({ userId, runtime }: { userId: string; runtime: BuilderRuntime }) {
  return Object.fromEntries(
    Object.entries({
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
      GEMINI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY || '',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
      CURSOR_AGENT_API_KEY: process.env.CURSOR_AGENT_API_KEY || '',
      EXA_API_KEY: process.env.EXA_API_KEY || '',
      FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || '',
      UNSPLASH_ACCESS_KEY: process.env.UNSPLASH_ACCESS_KEY || '',
      INDEXBLUE_BUILDER_USER_ID: userId,
      INDEXBLUE_BUILDER_RUNTIME: runtime,
      INDEXBLUE_BUILDER_ROOT: BUILDER_BOX_ROOT,
      INDEXBLUE_BUILDER_PROJECT_ROOT: BUILDER_REMOTE_PROJECT_PATH,
    }).filter(([, value]) => value && value.trim().length > 0),
  );
}

function wrapSandbox(sandbox: E2BSandbox): BuilderSandbox {
  return {
    id: sandbox.sandboxId,
    exec: {
      async command(command) {
        try {
          const result = await withNativeFetch(() =>
            sandbox.commands.run(command, {
              timeoutMs: 0,
              requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
            }),
          );
          return {
            result: result.stdout,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
          };
        } catch (error) {
          if (isCommandExitError(error)) {
            return {
              result: error.stdout,
              stdout: error.stdout,
              stderr: error.stderr,
              exitCode: error.exitCode,
            };
          }
          throw error;
        }
      },
      async stream(command) {
        const queue: Array<BuilderExecStreamChunk | null> = [];
        const resolvers: Array<(value: BuilderExecStreamChunk | null) => void> = [];
        let exitCode: number | undefined;
        let terminalError: Error | null = null;
        let cancelled = false;

        const push = (value: BuilderExecStreamChunk | null) => {
          const resolver = resolvers.shift();
          if (resolver) {
            resolver(value);
            return;
          }
          queue.push(value);
        };

        const handle = (await withNativeFetch(() =>
          sandbox.commands.run(command, {
            background: true,
            timeoutMs: 0,
            requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
            onStdout(data) {
              push({
                type: 'output',
                data,
              });
            },
            onStderr(data) {
              push({
                type: 'output',
                data,
              });
            },
          }),
        )) as E2BCommandHandle;

        const waitForCompletion = async () => {
          try {
            const result = await withNativeFetch(() => handle.wait());
            exitCode = result.exitCode;
          } catch (error) {
            if (isCommandExitError(error)) {
              exitCode = error.exitCode;
            } else {
              terminalError = error instanceof Error ? error : new Error('Sandbox stream failed unexpectedly.');
            }
          } finally {
            if (cancelled && exitCode == null) {
              exitCode = 130;
            }
            push(null);
          }
        };

        void waitForCompletion();

        return {
          get exitCode() {
            return exitCode;
          },
          async cancel() {
            cancelled = true;
            await withNativeFetch(() => handle.kill()).catch(() => undefined);
          },
          [Symbol.asyncIterator]() {
            return {
              next: async () => {
                const nextChunk =
                  queue.length > 0
                    ? queue.shift()!
                    : await new Promise<BuilderExecStreamChunk | null>((resolve) => {
                        resolvers.push(resolve);
                      });

                if (terminalError) {
                  throw terminalError;
                }

                if (nextChunk == null) {
                  return {
                    done: true,
                    value: undefined,
                  };
                }

                return {
                  done: false,
                  value: nextChunk,
                };
              },
            };
          },
        };
      },
      async code({ code, lang }) {
        const tempName = `indexblue-inline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const extension = lang === 'python' ? 'py' : lang === 'ts' ? 'ts' : 'js';
        const tempPath = `/tmp/${tempName}.${extension}`;
        const command =
          lang === 'python'
            ? `python ${shellEscape(tempPath)}`
            : lang === 'ts'
              ? `bun run ${shellEscape(tempPath)}`
              : `node ${shellEscape(tempPath)}`;

        await withNativeFetch(() => sandbox.files.write(tempPath, code));

        try {
          const result = await withNativeFetch(() =>
            sandbox.commands.run(command, {
              timeoutMs: 0,
              requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
            }),
          );
          return {
            result: [result.stdout, result.stderr].filter(Boolean).join('\n'),
            exitCode: result.exitCode,
          };
        } catch (error) {
          if (isCommandExitError(error)) {
            return {
              result: [error.stdout, error.stderr, error.message].filter(Boolean).join('\n'),
              exitCode: error.exitCode,
            };
          }
          throw error;
        } finally {
          await withNativeFetch(() => sandbox.files.remove(tempPath)).catch(() => undefined);
        }
      },
    },
    files: {
      async write({ path, content }) {
        await withNativeFetch(() => sandbox.files.write(path, content));
      },
      async read(path) {
        return await withNativeFetch(() => sandbox.files.read(path));
      },
    },
    agent: {
      async stream({ prompt }) {
        const { run } = await createE2BAgentRun({
          sandbox,
          prompt,
        });
        return run;
      },
    },
    getPreviewUrl(port) {
      return `https://${sandbox.getHost(port)}`;
    },
  };
}

export async function reconnectBuilderBox(boxId: string) {
  if (!serverEnv.E2B_API_KEY) {
    throw new Error('E2B_API_KEY is required for the builder runtime.');
  }

  const { Sandbox } = await loadE2BModule();
  const sandbox = await withNativeFetch(() =>
    Sandbox.connect(boxId, {
      apiKey: serverEnv.E2B_API_KEY,
    }),
  );

  await withNativeFetch(() => sandbox.setTimeout(DEFAULT_SANDBOX_TIMEOUT_MS)).catch(() => undefined);
  return wrapSandbox(sandbox);
}

export async function createBuilderBox({
  userId,
  runtime = DEFAULT_BUILDER_RUNTIME,
}: {
  userId: string;
  runtime?: BuilderRuntime;
}) {
  if (!serverEnv.E2B_API_KEY) {
    throw new Error('E2B_API_KEY is required for the builder runtime.');
  }

  const { Sandbox } = await loadE2BModule();
  const sandbox = await withNativeFetch(() =>
    serverEnv.E2B_TEMPLATE_ID
      ? Sandbox.create(serverEnv.E2B_TEMPLATE_ID, {
          apiKey: serverEnv.E2B_API_KEY,
          envs: createBuilderSandboxEnv({ userId, runtime }),
          timeoutMs: DEFAULT_SANDBOX_TIMEOUT_MS,
          allowInternetAccess: true,
          metadata: {
            product: 'indexblue-builder',
            userId,
            runtime,
          },
        })
      : Sandbox.create({
          apiKey: serverEnv.E2B_API_KEY,
          envs: createBuilderSandboxEnv({ userId, runtime }),
          timeoutMs: DEFAULT_SANDBOX_TIMEOUT_MS,
          allowInternetAccess: true,
          metadata: {
            product: 'indexblue-builder',
            userId,
            runtime,
          },
        }),
  );

  return {
    box: wrapSandbox(sandbox),
    mcpServerNames: [] as string[],
    hasVercelMcp: false,
  };
}

export async function ensureBuilderBox({
  userId,
  existingBoxId,
  runtime = DEFAULT_BUILDER_RUNTIME,
}: {
  userId: string;
  existingBoxId?: string | null;
  runtime?: BuilderRuntime;
}) {
  if (existingBoxId) {
    try {
      const box = await reconnectBuilderBox(existingBoxId);
      return {
        box,
        isNew: false,
        mcpServerNames: [] as string[],
        hasVercelMcp: false,
      };
    } catch (error) {
      console.warn(`🔨 [Build] Failed to reconnect to Box ${existingBoxId}, creating a new one:`, error);
    }
  }

  const created = await createBuilderBox({ userId, runtime });
  return {
    ...created,
    isNew: true,
  };
}

export async function installBunInBuilderBox(box: BuilderSandbox) {
  await box.exec.command(
    'curl -fsSL https://bun.sh/install | bash && ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun 2>/dev/null || true',
  );
}

export async function seedBuilderWorkspace(
  box: BuilderSandbox,
  seedWorkspacePath?: string | null,
  options?: {
    resetRemote?: boolean;
    remoteRoot?: string;
  },
) {
  if (!seedWorkspacePath) return false;

  let tempDir: string | null = null;

  try {
    tempDir = await mkdtemp(path.join(tmpdir(), 'indexblue-builder-seed-'));
    const archivePath = path.join(tempDir, 'workspace.tgz');
    await execFileAsync('tar', ['-czf', archivePath, '-C', seedWorkspacePath, '.']);
    const archiveBuffer = await readFile(archivePath);
    const archiveBase64 = archiveBuffer.toString('base64');
    const remoteBase64Path = `${BUILDER_BOX_ROOT}/_builder_workspace.tgz.b64`;
    const remoteArchivePath = `${BUILDER_BOX_ROOT}/_builder_workspace.tgz`;
    const remoteRoot = options?.remoteRoot?.trim() || BUILDER_REMOTE_PROJECT_PATH;

    await box.files.write({ path: remoteBase64Path, content: archiveBase64 });
    await box.exec.command(
      [
        options?.resetRemote ? `rm -rf "${remoteRoot}"` : '',
        `mkdir -p "${remoteRoot}"`,
        `base64 -d "${remoteBase64Path}" > "${remoteArchivePath}"`,
        `tar -xzf "${remoteArchivePath}" -C "${remoteRoot}"`,
        `rm -f "${remoteBase64Path}" "${remoteArchivePath}"`,
      ]
        .filter(Boolean)
        .join(' && '),
    );

    return true;
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export function getDefaultBuilderRemoteCwd(hasWorkspace: boolean) {
  return hasWorkspace ? BUILDER_REMOTE_PROJECT_PATH : BUILDER_BOX_ROOT;
}
