import 'server-only';

import { spawn, execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { serverEnv } from '@/env/server';
import { createE2BAgentRun, type BuilderAgentRun } from '@/lib/builder/e2b-agent';
import { withNativeFetch } from '@/lib/builder/e2b-fetch';
import { isCommandExitError, loadE2BModule } from '@/lib/builder/e2b-sdk';
import { BUILDER_BOX_ROOT, BUILDER_REMOTE_PROJECT_PATH } from '@/lib/builder/paths';
import type { BuilderRuntimeProvider } from '@/lib/builder/runtime-provider';
import { collectWorkspaceFiles } from '@/lib/builder/workspace';

export type { BuilderRuntimeProvider } from '@/lib/builder/runtime-provider';

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
type CodeSandboxInstance = import('@codesandbox/sdk').CodeSandbox;
type CodeSandboxSandbox = import('@codesandbox/sdk').Sandbox;
type CodeSandboxClient = import('@codesandbox/sdk').SandboxClient;
type CodeSandboxCommand = import('@codesandbox/sdk').Command;

type ServerBuilderRuntimeProvider = Exclude<BuilderRuntimeProvider, 'webcontainers'>;

export type BuilderSandbox = {
  id: string;
  provider: ServerBuilderRuntimeProvider;
  supportsAgent: boolean;
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

function createUnsupportedAgentRun(message: string): BuilderAgentRun {
  return {
    status: 'error',
    result: message,
    async *[Symbol.asyncIterator]() {
      yield { type: 'text-delta', text: message };
      yield { type: 'finish' };
    },
  };
}

function normalizeCommandFailure(error: unknown): BuilderExecResult | null {
  if (isCommandExitError(error)) {
    return {
      result: error.stdout,
      stdout: error.stdout,
      stderr: error.stderr,
      exitCode: error.exitCode,
    };
  }

  if (
    error &&
    typeof error === 'object' &&
    'exitCode' in error &&
    typeof (error as { exitCode?: unknown }).exitCode === 'number'
  ) {
    const output =
      'output' in error && typeof (error as { output?: unknown }).output === 'string'
        ? ((error as { output?: string }).output ?? '')
        : '';

    return {
      result: output,
      stdout: output,
      stderr: error instanceof Error ? error.message : 'Command failed.',
      exitCode: (error as { exitCode: number }).exitCode,
    };
  }

  return null;
}

function createAsyncStreamController() {
  const queue: Array<BuilderExecStreamChunk | null> = [];
  const resolvers: Array<(value: BuilderExecStreamChunk | null) => void> = [];
  let terminalError: Error | null = null;

  return {
    push(value: BuilderExecStreamChunk | null) {
      const resolver = resolvers.shift();
      if (resolver) {
        resolver(value);
        return;
      }
      queue.push(value);
    },
    fail(error: Error) {
      terminalError = error;
      this.push(null);
    },
    iterator(getExitCode: () => number | undefined, cancel: () => Promise<void>) {
      return {
        get exitCode() {
          return getExitCode();
        },
        cancel,
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
      } satisfies BuilderExecStream;
    },
  };
}

function getLocalPreviewBaseUrl() {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_BUILD_SERVER_URL ||
    serverEnv.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).find(Boolean) ||
    'http://localhost:3000';

  return new URL(configuredOrigin);
}

function getLocalPreviewUrl(port: number) {
  const url = getLocalPreviewBaseUrl();
  url.port = String(port);
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function encodeLocalBoxId(rootPath: string) {
  return `local:${Buffer.from(rootPath, 'utf8').toString('base64url')}`;
}

function decodeLocalBoxId(boxId: string) {
  if (!boxId.startsWith('local:')) {
    throw new Error('Invalid local builder box id.');
  }

  return Buffer.from(boxId.slice('local:'.length), 'base64url').toString('utf8');
}

async function loadCodeSandboxModule() {
  return await import('@codesandbox/sdk');
}

function getCodeSandboxApiKey() {
  return serverEnv.CODESANDBOX_API_KEY || serverEnv.CSB_API_KEY || process.env.CODESANDBOX_API_KEY || process.env.CSB_API_KEY;
}

function resolveLocalFilePath(rootPath: string, filePath: string) {
  return path.isAbsolute(filePath) ? filePath : path.join(rootPath, filePath);
}

async function runLocalCommand(
  rootPath: string,
  command: string,
  env: Record<string, string>,
): Promise<BuilderExecResult> {
  return await new Promise<BuilderExecResult>((resolve, reject) => {
    const child = spawn('bash', ['-lc', command], {
      cwd: rootPath,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        result: stdout,
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

async function createLocalBuilderSandbox({
  userId,
  runtime,
  workspacePath,
}: {
  userId: string;
  runtime: BuilderRuntime;
  workspacePath?: string | null;
}): Promise<BuilderSandbox> {
  const rootPath = workspacePath?.trim() || (await mkdtemp(path.join(tmpdir(), 'indexblue-local-builder-')));
  const env = createBuilderSandboxEnv({ userId, runtime });

  return {
    id: encodeLocalBoxId(rootPath),
    provider: 'local',
    supportsAgent: false,
    exec: {
      async command(command) {
        return await runLocalCommand(rootPath, command, env);
      },
      async stream(command) {
        const controller = createAsyncStreamController();
        let exitCode: number | undefined;
        let cancelled = false;
        const child = spawn('bash', ['-lc', command], {
          cwd: rootPath,
          env: {
            ...process.env,
            ...env,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        child.stdout.on('data', (chunk) => {
          controller.push({ type: 'output', data: chunk.toString() });
        });
        child.stderr.on('data', (chunk) => {
          controller.push({ type: 'output', data: chunk.toString() });
        });
        child.on('error', (error) => {
          controller.fail(error instanceof Error ? error : new Error('Local command failed unexpectedly.'));
        });
        child.on('close', (code) => {
          exitCode = cancelled && code == null ? 130 : (code ?? 0);
          controller.push(null);
        });

        return controller.iterator(
          () => exitCode,
          async () => {
            cancelled = true;
            if (!child.killed) {
              child.kill('SIGTERM');
            }
          },
        );
      },
      async code({ code, lang }) {
        const tempName = `indexblue-inline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const extension = lang === 'python' ? 'py' : lang === 'ts' ? 'ts' : 'js';
        const tempPath = path.join(rootPath, '.indexblue-tmp', `${tempName}.${extension}`);
        const command =
          lang === 'python'
            ? `python ${shellEscape(tempPath)}`
            : lang === 'ts'
              ? `bun run ${shellEscape(tempPath)}`
              : `node ${shellEscape(tempPath)}`;

        await mkdir(path.dirname(tempPath), { recursive: true });
        await writeFile(tempPath, code, 'utf8');

        try {
          const result = await runLocalCommand(rootPath, command, env);
          return {
            result: [result.stdout, result.stderr].filter(Boolean).join('\n'),
            exitCode: result.exitCode,
          };
        } finally {
          await rm(tempPath, { force: true }).catch(() => undefined);
        }
      },
    },
    files: {
      async write({ path: filePath, content }) {
        const absolutePath = resolveLocalFilePath(rootPath, filePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, content, 'utf8');
      },
      async read(filePath) {
        return await readFile(resolveLocalFilePath(rootPath, filePath), 'utf8');
      },
    },
    agent: {
      async stream() {
        return createUnsupportedAgentRun(
          'box_agent is only available with the E2B runtime. Use box_exec and box_write_file for local builder runs.',
        );
      },
    },
    getPreviewUrl(port) {
      return getLocalPreviewUrl(port);
    },
  };
}

async function connectCodeSandbox(boxId: string) {
  const apiKey = getCodeSandboxApiKey();
  if (!apiKey) {
    throw new Error('CODESANDBOX_API_KEY or CSB_API_KEY is required for the CodeSandbox builder runtime.');
  }

  const { CodeSandbox } = await loadCodeSandboxModule();
  const sdk: CodeSandboxInstance = new CodeSandbox(apiKey);
  const sandbox: CodeSandboxSandbox = await sdk.sandboxes.resume(boxId);
  const client: CodeSandboxClient = await sandbox.connect({
    env: {
      INDEXBLUE_BUILDER_ROOT: BUILDER_BOX_ROOT,
      INDEXBLUE_BUILDER_PROJECT_ROOT: BUILDER_REMOTE_PROJECT_PATH,
    },
  });
  return { sdk, sandbox, client };
}

function wrapCodeSandbox({
  sandbox,
  client,
  userId,
  runtime,
}: {
  sandbox: CodeSandboxSandbox;
  client: CodeSandboxClient;
  userId: string;
  runtime: BuilderRuntime;
}): BuilderSandbox {
  const env = createBuilderSandboxEnv({ userId, runtime });

  return {
    id: sandbox.id,
    provider: 'codesandbox',
    supportsAgent: false,
    exec: {
      async command(command) {
        try {
          const output = await client.commands.run(command, {
            cwd: BUILDER_REMOTE_PROJECT_PATH,
            env,
          });
          return {
            result: output,
            stdout: output,
            stderr: '',
            exitCode: 0,
          };
        } catch (error) {
          const normalized = normalizeCommandFailure(error);
          if (normalized) return normalized;
          throw error;
        }
      },
      async stream(command) {
        const controller = createAsyncStreamController();
        let exitCode: number | undefined;
        let cancelled = false;
        const handle: CodeSandboxCommand = await client.commands.runBackground(command, {
          cwd: BUILDER_REMOTE_PROJECT_PATH,
          env,
          name: 'Indexblue builder command',
        });
        const subscription = handle.onOutput((data) => {
          controller.push({ type: 'output', data });
        });
        const initialOutput = await handle.open().catch(() => '');
        if (initialOutput) {
          controller.push({ type: 'output', data: initialOutput });
        }

        void handle
          .waitUntilComplete()
          .then((output) => {
            if (output) {
              controller.push({ type: 'output', data: output });
            }
            exitCode = 0;
          })
          .catch((error) => {
            const normalized = normalizeCommandFailure(error);
            if (normalized) {
              if (normalized.stdout) controller.push({ type: 'output', data: normalized.stdout });
              if (normalized.stderr) controller.push({ type: 'output', data: normalized.stderr });
              exitCode = normalized.exitCode;
              return;
            }

            controller.fail(error instanceof Error ? error : new Error('CodeSandbox command failed unexpectedly.'));
          })
          .finally(() => {
            subscription.dispose();
            if (cancelled && exitCode == null) {
              exitCode = 130;
            }
            controller.push(null);
          });

        return controller.iterator(
          () => exitCode,
          async () => {
            cancelled = true;
            await handle.kill().catch(() => undefined);
          },
        );
      },
      async code({ code, lang }) {
        const tempName = `indexblue-inline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const extension = lang === 'python' ? 'py' : lang === 'ts' ? 'ts' : 'js';
        const tempPath = `${BUILDER_BOX_ROOT}/.indexblue-tmp/${tempName}.${extension}`;
        const command =
          lang === 'python'
            ? `python ${shellEscape(tempPath)}`
            : lang === 'ts'
              ? `bun run ${shellEscape(tempPath)}`
              : `node ${shellEscape(tempPath)}`;

        await client.fs.writeTextFile(tempPath, code, { create: true, overwrite: true });

        try {
          const result = await client.commands.run(command, {
            cwd: BUILDER_REMOTE_PROJECT_PATH,
            env,
          });
          return {
            result,
            exitCode: 0,
          };
        } catch (error) {
          const normalized = normalizeCommandFailure(error);
          if (normalized) {
            return {
              result: [normalized.stdout, normalized.stderr].filter(Boolean).join('\n'),
              exitCode: normalized.exitCode,
            };
          }

          throw error;
        } finally {
          await client.fs.remove(tempPath).catch(() => undefined);
        }
      },
    },
    files: {
      async write({ path: filePath, content }) {
        await client.fs.writeTextFile(filePath, content, { create: true, overwrite: true });
      },
      async read(filePath) {
        return await client.fs.readTextFile(filePath);
      },
    },
    agent: {
      async stream() {
        return createUnsupportedAgentRun(
          'box_agent is only available with the E2B runtime. Use box_exec and box_write_file for CodeSandbox builder runs.',
        );
      },
    },
    getPreviewUrl(port) {
      return client.hosts.getUrl(port, 'https');
    },
  };
}

function wrapSandbox(sandbox: E2BSandbox): BuilderSandbox {
  return {
    id: sandbox.sandboxId,
    provider: 'e2b',
    supportsAgent: true,
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
          const normalized = normalizeCommandFailure(error);
          if (normalized) return normalized;
          throw error;
        }
      },
      async stream(command) {
        const controller = createAsyncStreamController();
        let exitCode: number | undefined;
        let cancelled = false;

        const handle = (await withNativeFetch(() =>
          sandbox.commands.run(command, {
            background: true,
            timeoutMs: 0,
            requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
            onStdout(data) {
              controller.push({
                type: 'output',
                data,
              });
            },
            onStderr(data) {
              controller.push({
                type: 'output',
                data,
              });
            },
          }),
        )) as E2BCommandHandle;

        void (async () => {
          try {
            const result = await withNativeFetch(() => handle.wait());
            exitCode = result.exitCode;
          } catch (error) {
            const normalized = normalizeCommandFailure(error);
            if (normalized) {
              exitCode = normalized.exitCode;
            } else {
              controller.fail(error instanceof Error ? error : new Error('Sandbox stream failed unexpectedly.'));
            }
          } finally {
            if (cancelled && exitCode == null) {
              exitCode = 130;
            }
            controller.push(null);
          }
        })();

        return controller.iterator(
          () => exitCode,
          async () => {
            cancelled = true;
            await withNativeFetch(() => handle.kill()).catch(() => undefined);
          },
        );
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
          const normalized = normalizeCommandFailure(error);
          if (normalized) {
            return {
              result: [normalized.stdout, normalized.stderr].filter(Boolean).join('\n'),
              exitCode: normalized.exitCode,
            };
          }
          throw error;
        } finally {
          await withNativeFetch(() => sandbox.files.remove(tempPath)).catch(() => undefined);
        }
      },
    },
    files: {
      async write({ path: filePath, content }) {
        await withNativeFetch(() => sandbox.files.write(filePath, content));
      },
      async read(filePath) {
        return await withNativeFetch(() => sandbox.files.read(filePath));
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

export async function reconnectBuilderBox({
  boxId,
  provider = 'e2b',
  userId,
  runtime = DEFAULT_BUILDER_RUNTIME,
  workspacePath,
}: {
  boxId: string;
  provider?: ServerBuilderRuntimeProvider;
  userId: string;
  runtime?: BuilderRuntime;
  workspacePath?: string | null;
}) {
  if (provider === 'local') {
    const localRoot = workspacePath?.trim() || decodeLocalBoxId(boxId);
    return await createLocalBuilderSandbox({
      userId,
      runtime,
      workspacePath: localRoot,
    });
  }

  if (provider === 'codesandbox') {
    const { sandbox, client } = await connectCodeSandbox(boxId);
    return wrapCodeSandbox({
      sandbox,
      client,
      userId,
      runtime,
    });
  }

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

export async function terminateBuilderBox({
  boxId,
  provider = 'e2b',
}: {
  boxId: string;
  provider?: ServerBuilderRuntimeProvider;
}) {
  if (provider === 'local') {
    return;
  }

  if (provider === 'codesandbox') {
    const apiKey = getCodeSandboxApiKey();
    if (!apiKey) {
      throw new Error('CODESANDBOX_API_KEY or CSB_API_KEY is required for the CodeSandbox builder runtime.');
    }

    const { CodeSandbox } = await loadCodeSandboxModule();
    const sdk: CodeSandboxInstance = new CodeSandbox(apiKey);
    await sdk.sandboxes.shutdown(boxId);
    return;
  }

  if (!serverEnv.E2B_API_KEY) {
    throw new Error('E2B_API_KEY is required for the builder runtime.');
  }

  const { Sandbox } = await loadE2BModule();
  const sandbox = await withNativeFetch(() =>
    Sandbox.connect(boxId, {
      apiKey: serverEnv.E2B_API_KEY,
    }),
  );

  await withNativeFetch(() => sandbox.kill());
}

export async function createBuilderBox({
  userId,
  runtime = DEFAULT_BUILDER_RUNTIME,
  provider = 'e2b',
  workspacePath,
}: {
  userId: string;
  runtime?: BuilderRuntime;
  provider?: ServerBuilderRuntimeProvider;
  workspacePath?: string | null;
}) {
  if (provider === 'local') {
    return {
      box: await createLocalBuilderSandbox({
        userId,
        runtime,
        workspacePath,
      }),
      mcpServerNames: [] as string[],
      hasVercelMcp: false,
    };
  }

  if (provider === 'codesandbox') {
    const apiKey = getCodeSandboxApiKey();
    if (!apiKey) {
      throw new Error('CODESANDBOX_API_KEY or CSB_API_KEY is required for the CodeSandbox builder runtime.');
    }

    const { CodeSandbox } = await loadCodeSandboxModule();
    const sdk: CodeSandboxInstance = new CodeSandbox(apiKey);
    const sandbox: CodeSandboxSandbox = await sdk.sandboxes.create({
      title: `Indexblue Builder • ${userId}`,
      privacy: 'public-hosts',
      tags: ['indexblue-builder', userId, runtime],
      automaticWakeupConfig: {
        http: true,
        websocket: true,
      },
      hibernationTimeoutSeconds: DEFAULT_SANDBOX_TIMEOUT_MS / 1000,
    });
    const client: CodeSandboxClient = await sandbox.connect({
      env: createBuilderSandboxEnv({ userId, runtime }),
    });

    return {
      box: wrapCodeSandbox({
        sandbox,
        client,
        userId,
        runtime,
      }),
      mcpServerNames: [] as string[],
      hasVercelMcp: false,
    };
  }

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
  provider = 'e2b',
  workspacePath,
}: {
  userId: string;
  existingBoxId?: string | null;
  runtime?: BuilderRuntime;
  provider?: ServerBuilderRuntimeProvider;
  workspacePath?: string | null;
}) {
  if (existingBoxId) {
    try {
      const box = await reconnectBuilderBox({
        boxId: existingBoxId,
        provider,
        userId,
        runtime,
        workspacePath,
      });
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

  const created = await createBuilderBox({
    userId,
    runtime,
    provider,
    workspacePath,
  });
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

  if (box.provider === 'local') {
    return true;
  }

  const remoteRoot = options?.remoteRoot?.trim() || BUILDER_REMOTE_PROJECT_PATH;

  if (box.provider === 'codesandbox') {
    const files = await collectWorkspaceFiles(seedWorkspacePath);
    await box.exec.command(
      [options?.resetRemote ? `rm -rf "${remoteRoot}"` : '', `mkdir -p "${remoteRoot}"`].filter(Boolean).join(' && '),
    );
    if (files.length > 0) {
      await Promise.all(
        files.map((file) =>
          box.files.write({
            path: `${remoteRoot}/${file.path}`.replace(/\/{2,}/g, '/'),
            content: Buffer.from(file.content).toString('utf8'),
          }),
        ),
      );
    }
    return true;
  }

  let tempDir: string | null = null;

  try {
    tempDir = await mkdtemp(path.join(tmpdir(), 'indexblue-builder-seed-'));
    const archivePath = path.join(tempDir, 'workspace.tgz');
    await execFileAsync('tar', ['-czf', archivePath, '-C', seedWorkspacePath, '.']);
    const archiveBuffer = await readFile(archivePath);
    const archiveBase64 = archiveBuffer.toString('base64');
    const remoteBase64Path = `${BUILDER_BOX_ROOT}/_builder_workspace.tgz.b64`;
    const remoteArchivePath = `${BUILDER_BOX_ROOT}/_builder_workspace.tgz`;

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
