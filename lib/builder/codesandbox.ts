import 'server-only';

import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serverEnv } from '@/env/server';
import { BUILDER_BOX_ROOT, BUILDER_REMOTE_PROJECT_PATH } from '@/lib/builder/paths';
import { getBuilderTemplateScaffold } from '@/lib/builder/template-scaffolds';
import type { BuilderTemplateId } from '@/lib/builder/template-options';

type BuilderRuntime = 'node' | 'python' | 'golang' | 'ruby' | 'rust';

type CodeSandboxInstance = import('@codesandbox/sdk').CodeSandbox;
type CodeSandboxSandbox = import('@codesandbox/sdk').Sandbox;
type CodeSandboxClient = import('@codesandbox/sdk').SandboxClient;
type CodeSandboxTerminal = import('@codesandbox/sdk').Terminal;

const BLANK_CODESANDBOX_TEMPLATE_ID = 'xzsy8c';
const MIRROR_ROOT_NAME = 'codesandbox-mirrors';
const IGNORED_SYNC_ENTRIES = new Set(['.git', 'node_modules', '.next', '.turbo', 'dist', 'build']);
const SHORT_CODESANDBOX_WAIT_MS = 15000;

type CodeSandboxTemplateDefinition = {
  previewPort: number;
  strategy: 'fork' | 'blank-seed';
  sandboxTemplateId?: string;
  installCommand?: string;
  startCommand?: string;
};

const CODESANDBOX_TEMPLATE_DEFINITIONS: Record<Exclude<BuilderTemplateId, 'expo-app'>, CodeSandboxTemplateDefinition> =
  {
    'next-app': {
      previewPort: 3000,
      strategy: 'fork',
      sandboxTemplateId: '8fx2xn',
      startCommand: 'npm run dev',
    },
    'react-vite': {
      previewPort: 3000,
      strategy: 'fork',
      sandboxTemplateId: 'z2swz',
      startCommand: 'npm run dev',
    },
    'angular-app': {
      previewPort: 4200,
      strategy: 'fork',
      sandboxTemplateId: 'zb94i',
      startCommand: 'npm run dev',
    },
    'static-site': {
      previewPort: 3000,
      strategy: 'blank-seed',
      installCommand: 'npm install',
      startCommand: 'npm run dev',
    },
    'docker-node': {
      previewPort: 8080,
      strategy: 'fork',
      sandboxTemplateId: 'hsd8ke',
      startCommand: 'npm run dev',
    },
    'docker-universal': {
      previewPort: 8080,
      strategy: 'fork',
      sandboxTemplateId: 'hsd8ke',
      startCommand: 'npm run dev',
    },
    'node-api': {
      previewPort: 3000,
      strategy: 'blank-seed',
      installCommand: 'npm install',
      startCommand: 'npm run dev',
    },
    'node-http': {
      previewPort: 3000,
      strategy: 'blank-seed',
      installCommand: 'npm install',
      startCommand: 'npm run dev',
    },
    'python-app': {
      previewPort: 3000,
      strategy: 'blank-seed',
      installCommand: 'python -m pip install -r requirements',
      startCommand: 'python app.py',
    },
    'tensorflow-python': {
      previewPort: 3000,
      strategy: 'blank-seed',
      installCommand: 'python -m pip install -r requirements',
      startCommand: 'python app.py',
    },
    'pytorch-python': {
      previewPort: 3000,
      strategy: 'blank-seed',
      installCommand: 'python -m pip install -r requirements',
      startCommand: 'python app.py',
    },
    'bun-app': {
      previewPort: 3000,
      strategy: 'blank-seed',
      installCommand: 'curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH"',
      startCommand: 'export PATH="$HOME/.bun/bin:$PATH" && bun run src/server.ts',
    },
    'jupyter-python': {
      previewPort: 3000,
      strategy: 'blank-seed',
      installCommand: 'python -m pip install -r requirements',
      startCommand:
        'jupyter lab --ip=0.0.0.0 --port=3000 --no-browser --ServerApp.token="" --ServerApp.allow_origin="*"',
    },
    'nuxt-app': {
      previewPort: 3000,
      strategy: 'blank-seed',
      installCommand: 'npm install',
      startCommand: 'npm run dev',
    },
  };

export type BuilderCodeSandboxLiveSession = {
  provider: 'codesandbox';
  sandboxId: string;
  remoteWorkspaceRoot: string;
  previewUrl: string | null;
  previewPort: number | null;
  source: 'template' | 'import' | 'manual';
  templateId?: string | null;
  status: 'booting' | 'ready' | 'error';
  createdAt: string;
  updatedAt: string;
  lastBootAt?: string | null;
  lastError?: string | null;
};

export type BuilderCodeSandboxTemplateWorkspace = {
  workspacePath: string;
  sandboxId: string;
  remoteWorkspaceRoot: string;
  previewUrl: string | null;
  previewPort: number;
  startCommand: string | null;
  installCommand: string | null;
  sandboxTemplateId: string | null;
  liveSession: BuilderCodeSandboxLiveSession;
};

type CodeSandboxProjectLike = {
  workspacePath?: string | null;
  boxId?: string | null;
  buildRuntime?: string | null;
  metadata?: {
    liveSession?: {
      provider?: string;
      sandboxId?: string | null;
      remoteWorkspaceRoot?: string | null;
      previewPort?: number | null;
    } | null;
    importMeta?: Record<string, unknown>;
  } | null;
};

type ConnectBuilderCodeSandboxInput = {
  sandboxId: string;
  userId: string;
  runtime?: BuilderRuntime;
};

export type ConnectedBuilderCodeSandbox = {
  sdk: CodeSandboxInstance;
  sandbox: CodeSandboxSandbox;
  client: CodeSandboxClient;
  env: Record<string, string>;
};

async function loadCodeSandboxModule() {
  return await import('@codesandbox/sdk');
}

function getCodeSandboxApiKey() {
  return serverEnv.CODESANDBOX_API_KEY || serverEnv.CSB_API_KEY || process.env.CODESANDBOX_API_KEY || process.env.CSB_API_KEY;
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

function getTemplateDefinition(templateId: BuilderTemplateId) {
  if (templateId === 'expo-app') {
    throw new Error('Expo templates do not use the CodeSandbox runtime.');
  }

  return CODESANDBOX_TEMPLATE_DEFINITIONS[templateId];
}

function getMirrorBaseDir(slug: string) {
  return path.join(tmpdir(), 'indexblue-builder-workspaces', MIRROR_ROOT_NAME, slug);
}

function toCodeSandboxPreviewUrl(sandboxId: string, port: number) {
  return `https://${sandboxId}-${port}.csb.app`;
}

function shouldIgnoreSyncEntry(name: string) {
  return IGNORED_SYNC_ENTRIES.has(name);
}

async function ensureSetupReady(client: CodeSandboxClient) {
  if (client.setup.status === 'IN_PROGRESS') {
    await Promise.race([
      client.setup.waitUntilComplete().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, SHORT_CODESANDBOX_WAIT_MS)),
    ]);
  }
}

async function waitForTaskPort(task: Awaited<ReturnType<typeof findDevTask>>, timeoutMs = SHORT_CODESANDBOX_WAIT_MS) {
  if (!task) return;

  await Promise.race([
    task.waitForPort(timeoutMs).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

async function clearRemoteWorkspace(client: CodeSandboxClient, remoteRoot: string) {
  const entries = await client.fs.readdir(remoteRoot).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => !shouldIgnoreSyncEntry(entry.name))
      .map((entry) => client.fs.remove(`${remoteRoot}/${entry.name}`.replace(/\/{2,}/g, '/'), true)),
  );
}

async function seedRemoteWorkspaceFromScaffold(
  client: CodeSandboxClient,
  remoteRoot: string,
  templateId: Exclude<BuilderTemplateId, 'expo-app'>,
) {
  const scaffold = getBuilderTemplateScaffold(templateId);
  await clearRemoteWorkspace(client, remoteRoot);
  await client.fs.batchWrite(
    Object.entries(scaffold.files).map(([relativePath, content]) => ({
      path: `${remoteRoot}/${relativePath}`.replace(/\/{2,}/g, '/'),
      content,
    })),
  );
}

async function syncRemoteDirectoryToLocal({
  client,
  remoteDir,
  remoteRoot,
  localRoot,
}: {
  client: CodeSandboxClient;
  remoteDir: string;
  remoteRoot: string;
  localRoot: string;
}) {
  const entries = await client.fs.readdir(remoteDir);

  for (const entry of entries) {
    if (shouldIgnoreSyncEntry(entry.name)) continue;

    const remotePath = `${remoteDir}/${entry.name}`.replace(/\/{2,}/g, '/');
    const relativePath = path.relative(remoteRoot, remotePath);
    const localPath = path.join(localRoot, relativePath);

    if (entry.type === 'directory') {
      await mkdir(localPath, { recursive: true });
      await syncRemoteDirectoryToLocal({
        client,
        remoteDir: remotePath,
        remoteRoot,
        localRoot,
      });
      continue;
    }

    const content = await client.fs.readFile(remotePath);
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, content);
  }
}

async function syncRemoteWorkspaceToLocal({
  client,
  remoteRoot,
  localRoot,
  resetLocal = true,
}: {
  client: CodeSandboxClient;
  remoteRoot: string;
  localRoot: string;
  resetLocal?: boolean;
}) {
  if (resetLocal) {
    await rm(localRoot, { recursive: true, force: true }).catch(() => undefined);
  }

  await mkdir(localRoot, { recursive: true });
  await syncRemoteDirectoryToLocal({
    client,
    remoteDir: remoteRoot,
    remoteRoot,
    localRoot,
  });
}

async function findDevTask(client: CodeSandboxClient) {
  const tasks = await client.tasks.getAll().catch(() => []);
  return (
    tasks.find((task) => task.id === 'dev') ||
    tasks.find((task) => task.name.toLowerCase().includes('dev')) ||
    tasks.find((task) => task.runAtStart) ||
    null
  );
}

async function findDevCommand(client: CodeSandboxClient, startCommand?: string | null) {
  const commands = await client.commands.getAll().catch(() => []);
  return (
    commands.find((command) => command.name === 'dev') ||
    commands.find((command) => command.name?.toLowerCase().includes('dev')) ||
    (startCommand ? commands.find((command) => command.command.trim() === startCommand.trim()) : undefined) ||
    null
  );
}

async function runInstallCommandIfNeeded(
  client: CodeSandboxClient,
  remoteWorkspaceRoot: string,
  installCommand?: string | null,
) {
  if (!installCommand) return;
  await client.commands.run(installCommand, {
    cwd: remoteWorkspaceRoot,
    name: 'setup',
  });
}

export async function connectBuilderCodeSandbox({
  sandboxId,
  userId,
  runtime = 'node',
}: ConnectBuilderCodeSandboxInput): Promise<ConnectedBuilderCodeSandbox> {
  const apiKey = getCodeSandboxApiKey();
  if (!apiKey) {
    throw new Error('CODESANDBOX_API_KEY or CSB_API_KEY is required for the CodeSandbox builder runtime.');
  }

  const { CodeSandbox } = await loadCodeSandboxModule();
  const sdk: CodeSandboxInstance = new CodeSandbox(apiKey);
  const sandbox: CodeSandboxSandbox = await sdk.sandboxes.resume(sandboxId);
  const env = createBuilderSandboxEnv({ userId, runtime });
  const client: CodeSandboxClient = await sandbox.connect({
    env,
  });

  await ensureSetupReady(client);

  return {
    sdk,
    sandbox,
    client,
    env,
  };
}

export async function ensureCodeSandboxPreview({
  client,
  sandboxId,
  remoteWorkspaceRoot,
  previewPort,
  startCommand,
}: {
  client: CodeSandboxClient;
  sandboxId: string;
  remoteWorkspaceRoot: string;
  previewPort: number;
  startCommand?: string | null;
}) {
  const task = await findDevTask(client);

  if (task) {
    if (task.status === 'IDLE') {
      await task.run();
    } else if (task.status !== 'RUNNING') {
      await task.restart();
    }

    await waitForTaskPort(task);

    return {
      previewUrl: toCodeSandboxPreviewUrl(sandboxId, previewPort),
      previewPort,
      bootedWith: 'task' as const,
    };
  }

  const existingCommand = await findDevCommand(client, startCommand);
  if (existingCommand) {
    await existingCommand.open().catch(() => undefined);
    return {
      previewUrl: toCodeSandboxPreviewUrl(sandboxId, previewPort),
      previewPort,
      bootedWith: 'command' as const,
    };
  }

  if (!startCommand) {
    return {
      previewUrl: toCodeSandboxPreviewUrl(sandboxId, previewPort),
      previewPort,
      bootedWith: 'none' as const,
    };
  }

  const command = await client.commands.runBackground(startCommand, {
    cwd: remoteWorkspaceRoot,
    name: 'dev',
  });
  await command.open().catch(() => undefined);

  return {
    previewUrl: toCodeSandboxPreviewUrl(sandboxId, previewPort),
    previewPort,
    bootedWith: 'command' as const,
  };
}

export async function restartCodeSandboxPreview({
  sandboxId,
  userId,
  runtime = 'node',
  previewPort,
  remoteWorkspaceRoot,
  startCommand,
}: {
  sandboxId: string;
  userId: string;
  runtime?: BuilderRuntime;
  previewPort: number;
  remoteWorkspaceRoot?: string | null;
  startCommand?: string | null;
}) {
  const { client } = await connectBuilderCodeSandbox({
    sandboxId,
    userId,
    runtime,
  });
  const effectiveRemoteRoot = remoteWorkspaceRoot?.trim() || client.workspacePath || BUILDER_REMOTE_PROJECT_PATH;
  const task = await findDevTask(client);

  if (task) {
    await task.restart();
    await waitForTaskPort(task);
    return {
      previewUrl: toCodeSandboxPreviewUrl(sandboxId, previewPort),
      previewPort,
      remoteWorkspaceRoot: effectiveRemoteRoot,
      restartedWith: 'task' as const,
    };
  }

  const existingCommand = await findDevCommand(client, startCommand);
  if (existingCommand) {
    await existingCommand.restart();
    await existingCommand.open().catch(() => undefined);
    return {
      previewUrl: toCodeSandboxPreviewUrl(sandboxId, previewPort),
      previewPort,
      remoteWorkspaceRoot: effectiveRemoteRoot,
      restartedWith: 'command' as const,
    };
  }

  if (!startCommand) {
    return {
      previewUrl: toCodeSandboxPreviewUrl(sandboxId, previewPort),
      previewPort,
      remoteWorkspaceRoot: effectiveRemoteRoot,
      restartedWith: 'none' as const,
    };
  }

  const command = await client.commands.runBackground(startCommand, {
    cwd: effectiveRemoteRoot,
    name: 'dev',
  });
  await command.open().catch(() => undefined);

  return {
    previewUrl: toCodeSandboxPreviewUrl(sandboxId, previewPort),
    previewPort,
    remoteWorkspaceRoot: effectiveRemoteRoot,
    restartedWith: 'command' as const,
  };
}

export async function syncCodeSandboxWorkspaceToMirror({
  sandboxId,
  userId,
  runtime = 'node',
  remoteWorkspaceRoot,
  localWorkspacePath,
  resetLocal = true,
}: {
  sandboxId: string;
  userId: string;
  runtime?: BuilderRuntime;
  remoteWorkspaceRoot?: string | null;
  localWorkspacePath: string;
  resetLocal?: boolean;
}) {
  const { client } = await connectBuilderCodeSandbox({
    sandboxId,
    userId,
    runtime,
  });
  const remoteRoot = remoteWorkspaceRoot?.trim() || client.workspacePath || BUILDER_REMOTE_PROJECT_PATH;

  await syncRemoteWorkspaceToLocal({
    client,
    remoteRoot,
    localRoot: localWorkspacePath,
    resetLocal,
  });

  return {
    remoteWorkspaceRoot: remoteRoot,
  };
}

export function isCodeSandboxProject(project: CodeSandboxProjectLike) {
  return project.metadata?.liveSession?.provider === 'codesandbox' || project.metadata?.importMeta?.runtimeProvider === 'codesandbox';
}

export function getCodeSandboxProjectSandboxId(project: CodeSandboxProjectLike) {
  return project.boxId?.trim() || project.metadata?.liveSession?.sandboxId?.trim() || null;
}

export function getCodeSandboxProjectPreviewPort(project: CodeSandboxProjectLike) {
  const previewPort = project.metadata?.liveSession?.previewPort;
  if (typeof previewPort === 'number' && Number.isFinite(previewPort)) {
    return previewPort;
  }

  const importPreviewPort = project.metadata?.importMeta?.previewPort;
  return typeof importPreviewPort === 'number' && Number.isFinite(importPreviewPort) ? importPreviewPort : 3000;
}

export function getCodeSandboxProjectStartCommand(project: CodeSandboxProjectLike) {
  const startCommand = project.metadata?.importMeta?.startCommand;
  return typeof startCommand === 'string' && startCommand.trim().length > 0 ? startCommand : null;
}

export async function syncBuilderCodeSandboxProjectMirror({
  project,
  userId,
  resetLocal = true,
}: {
  project: CodeSandboxProjectLike;
  userId: string;
  resetLocal?: boolean;
}) {
  if (!project.workspacePath || !isCodeSandboxProject(project)) {
    return false;
  }

  const sandboxId = getCodeSandboxProjectSandboxId(project);
  if (!sandboxId) {
    return false;
  }

  await syncCodeSandboxWorkspaceToMirror({
    sandboxId,
    userId,
    runtime: (project.buildRuntime?.trim() as BuilderRuntime) || 'node',
    remoteWorkspaceRoot: project.metadata?.liveSession?.remoteWorkspaceRoot ?? null,
    localWorkspacePath: project.workspacePath,
    resetLocal,
  });

  return true;
}

export async function createCodeSandboxWorkspaceFromTemplate({
  templateId,
  userId,
  runtime = 'node',
}: {
  templateId: Exclude<BuilderTemplateId, 'expo-app'>;
  userId: string;
  runtime?: BuilderRuntime;
}): Promise<BuilderCodeSandboxTemplateWorkspace> {
  const apiKey = getCodeSandboxApiKey();
  if (!apiKey) {
    throw new Error('CODESANDBOX_API_KEY or CSB_API_KEY is required for the CodeSandbox builder runtime.');
  }

  const definition = getTemplateDefinition(templateId);
  const scaffold = getBuilderTemplateScaffold(templateId);
  const { CodeSandbox } = await loadCodeSandboxModule();
  const sdk: CodeSandboxInstance = new CodeSandbox(apiKey);
  const forkTemplateId = definition.sandboxTemplateId || BLANK_CODESANDBOX_TEMPLATE_ID;
  const sandbox: CodeSandboxSandbox = await sdk.sandboxes.create({
    id: forkTemplateId,
    title: `${scaffold.name} • Indexblue`,
    description: `Indexblue Builder ${scaffold.name} workspace`,
    privacy: 'public-hosts',
    tags: ['indexblue-builder', 'codesandbox', templateId, userId],
    path: '/Indexblue Builder',
    automaticWakeupConfig: {
      http: true,
      websocket: true,
    },
    hibernationTimeoutSeconds: 60 * 60,
  });

  const env = createBuilderSandboxEnv({ userId, runtime });
  const client: CodeSandboxClient = await sandbox.connect({ env });
  await ensureSetupReady(client);

  const remoteWorkspaceRoot = client.workspacePath || BUILDER_REMOTE_PROJECT_PATH;

  if (definition.strategy === 'blank-seed') {
    await seedRemoteWorkspaceFromScaffold(client, remoteWorkspaceRoot, templateId);
    await runInstallCommandIfNeeded(client, remoteWorkspaceRoot, definition.installCommand ?? null);
  }

  const preview = await ensureCodeSandboxPreview({
    client,
    sandboxId: sandbox.id,
    remoteWorkspaceRoot,
    previewPort: definition.previewPort,
    startCommand: definition.startCommand ?? null,
  });

  const mirrorPrefix = getMirrorBaseDir(scaffold.slug);
  await mkdir(mirrorPrefix, { recursive: true });
  const mirrorParent = await mkdtemp(path.join(mirrorPrefix, '-'));
  const workspacePath = path.join(mirrorParent, scaffold.slug);
  await mkdir(workspacePath, { recursive: true });

  await syncRemoteWorkspaceToLocal({
    client,
    remoteRoot: remoteWorkspaceRoot,
    localRoot: workspacePath,
    resetLocal: true,
  });

  const now = new Date().toISOString();
  return {
    workspacePath,
    sandboxId: sandbox.id,
    remoteWorkspaceRoot,
    previewUrl: preview.previewUrl,
    previewPort: definition.previewPort,
    startCommand: definition.startCommand ?? null,
    installCommand: definition.installCommand ?? null,
    sandboxTemplateId: definition.sandboxTemplateId ?? null,
    liveSession: {
      provider: 'codesandbox',
      sandboxId: sandbox.id,
      remoteWorkspaceRoot,
      previewUrl: preview.previewUrl,
      previewPort: definition.previewPort,
      source: 'template',
      templateId,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
      lastBootAt: now,
      lastError: null,
    },
  };
}

export async function readPackageJsonScripts(workspacePath: string) {
  try {
    const raw = await readFile(path.join(workspacePath, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as {
      scripts?: Record<string, string>;
      packageManager?: string;
    };
    return {
      scripts: parsed.scripts ?? {},
      packageManager: parsed.packageManager ?? '',
    };
  } catch {
    return {
      scripts: {} as Record<string, string>,
      packageManager: '',
    };
  }
}

export async function inferCodeSandboxStartCommandFromWorkspace(workspacePath: string) {
  const { scripts, packageManager } = await readPackageJsonScripts(workspacePath);

  if (scripts.dev) {
    if (packageManager.startsWith('bun')) {
      return {
        installCommand: 'curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install',
        startCommand: 'export PATH="$HOME/.bun/bin:$PATH" && bun run dev',
        previewPort: 3000,
      };
    }

    return {
      installCommand: 'npm install',
      startCommand: 'npm run dev',
      previewPort: scripts.dev.includes('4200') ? 4200 : 3000,
    };
  }

  const hasRequirements = await access(path.join(workspacePath, 'requirements'))
    .then(() => true)
    .catch(() => false);
  const hasRequirementsTxt = await access(path.join(workspacePath, 'requirements.txt'))
    .then(() => true)
    .catch(() => false);
  const hasAppPy = await access(path.join(workspacePath, 'app.py'))
    .then(() => true)
    .catch(() => false);
  const hasNotebookDir = await access(path.join(workspacePath, 'notebooks'))
    .then(() => true)
    .catch(() => false);

  if (hasAppPy && (hasRequirements || hasRequirementsTxt)) {
    return {
      installCommand: hasRequirementsTxt
        ? 'python -m pip install -r requirements.txt'
        : 'python -m pip install -r requirements',
      startCommand: 'python app.py',
      previewPort: 3000,
    };
  }

  if (hasNotebookDir) {
    return {
      installCommand: hasRequirementsTxt
        ? 'python -m pip install -r requirements.txt'
        : 'python -m pip install -r requirements',
      startCommand:
        'jupyter lab --ip=0.0.0.0 --port=3000 --no-browser --ServerApp.token="" --ServerApp.allow_origin="*"',
      previewPort: 3000,
    };
  }

  return {
    installCommand: null,
    startCommand: null,
    previewPort: 3000,
  };
}

export async function connectCodeSandboxTerminal({
  sandboxId,
  userId,
  runtime = 'node',
  providerTerminalId,
  cwd,
}: {
  sandboxId: string;
  userId: string;
  runtime?: BuilderRuntime;
  providerTerminalId?: string | null;
  cwd: string;
}) {
  const { client } = await connectBuilderCodeSandbox({
    sandboxId,
    userId,
    runtime,
  });

  let terminal: CodeSandboxTerminal | undefined;
  if (providerTerminalId) {
    terminal = await client.terminals.get(providerTerminalId).catch(() => undefined);
  }

  if (!terminal) {
    terminal = await client.terminals.create('bash', {
      cwd,
      name: 'Indexblue terminal',
    });
  }

  return {
    client,
    terminal,
  };
}

export function getCodeSandboxPreviewUrl(sandboxId: string, port: number) {
  return toCodeSandboxPreviewUrl(sandboxId, port);
}
