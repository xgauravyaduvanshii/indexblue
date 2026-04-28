import 'server-only';

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { BUILDER_BOX_ROOT } from '@/lib/builder/paths';
import { ensureBuilderBox, installBunInBuilderBox, seedBuilderWorkspace, type BuilderSandbox } from '@/lib/builder/box';
import { createBuilderProjectEvent } from '@/lib/db/builder-app-queries';
import { updateBuilderProjectTheme } from '@/lib/db/builder-project-queries';
import { updateBuildSession } from '@/lib/db/queries';
import {
  getBuilderProjectRemoteWorkspaceRoot,
  isExpoAppTemplateProject,
  type BuilderProjectLiveSession,
  type BuilderProjectMetadata,
} from '@/lib/builder/project-metadata';

const execFileAsync = promisify(execFile);

const APP_TEMPLATE_PREVIEW_PORT = 3000;
const APP_PREVIEW_PORTS = [3000, 8081, 19000, 19006];
const APP_SNAPSHOT_EXCLUDES = [
  '--exclude=./node_modules',
  '--exclude=./.expo',
  '--exclude=./.metro-cache',
  '--exclude=./.git',
  '--exclude=./backend_logs.txt',
  '--exclude=./prisma_logs.txt',
  '--exclude=./bundle.txt',
  '--exclude=./cache_status.txt',
  '--exclude=./expo_logs.txt',
  '--exclude=./.DS_Store',
];

type BuilderAppProjectContext = {
  id: string;
  userId: string;
  chatId: string;
  name: string;
  sourceType: string;
  workspacePath: string | null;
  theme: string | null;
  metadata: BuilderProjectMetadata | null;
  buildRuntime?: string | null;
  boxId?: string | null;
};

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTimestamp() {
  return new Date().toISOString();
}

function mergeEnvContent(existing: string, entries: Record<string, string>) {
  const lines = existing
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .filter((line) => !/^#/.test(line))
    .filter((line) => {
      const key = line.split('=')[0]?.trim();
      return key !== 'EXPO_PUBLIC_PROJECT_ID' && key !== 'EXPO_PUBLIC_SESSION_TOKEN';
    });

  lines.push(...Object.entries(entries).map(([key, value]) => `${key}=${value}`));
  return `${lines.join('\n').trim()}\n`;
}

async function ensureExpoSessionFiles(box: BuilderSandbox, remoteRoot: string, sandboxId: string) {
  const sessionTokenPath = `${remoteRoot}/.session_token`;
  const envPath = `${remoteRoot}/.env.local`;
  const expoEnvPath = `${remoteRoot}/.expo_env`;
  let sessionToken = (await box.exec.command(`cat ${shellEscape(sessionTokenPath)} 2>/dev/null || true`)).stdout.trim();

  if (!sessionToken || sessionToken.length < 16) {
    sessionToken = randomBytes(32).toString('hex');
    await box.files.write({ path: sessionTokenPath, content: `${sessionToken}\n` });
  }

  const envEntries = {
    EXPO_PUBLIC_PROJECT_ID: sandboxId,
    EXPO_PUBLIC_SESSION_TOKEN: sessionToken,
  };

  const existingEnv = await box.files.read(envPath).catch(() => '');
  await box.files.write({
    path: envPath,
    content: mergeEnvContent(existingEnv, envEntries),
  });

  await box.files.write({
    path: expoEnvPath,
    content: [
      `export EXPO_PUBLIC_PROJECT_ID=${sandboxId}`,
      `export EXPO_PUBLIC_SESSION_TOKEN=${sessionToken}`,
      '',
    ].join('\n'),
  });

  return sessionToken;
}

async function waitForPreviewPort(box: BuilderSandbox, ports = APP_PREVIEW_PORTS, timeoutMs = 90_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    for (const port of ports) {
      const result = await box.exec
        .command(
          `code=$(curl -s -o /dev/null --max-time 2 -w '%{http_code}' http://127.0.0.1:${port} || true); if [ "$code" != "000" ] && [ -n "$code" ]; then echo "$code"; fi`,
        )
        .catch(() => null);

      if (result?.stdout.trim()) {
        return {
          port,
          url: box.getPreviewUrl(port),
        };
      }
    }

    await delay(2_500);
  }

  return null;
}

async function ensureImportedAppPreview(box: BuilderSandbox, remoteRoot: string) {
  const packageJsonResult = await box.exec
    .command(
      `if [ -f ${shellEscape(`${remoteRoot}/package.json`)} ]; then cat ${shellEscape(`${remoteRoot}/package.json`)}; fi`,
    )
    .catch(() => null);

  const packageJsonText = packageJsonResult?.stdout.trim() ?? '';
  let scripts: Record<string, string> = {};
  let dependencies: Record<string, string> = {};

  if (packageJsonText) {
    try {
      const parsed = JSON.parse(packageJsonText) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      scripts = parsed.scripts ?? {};
      dependencies = {
        ...(parsed.dependencies ?? {}),
        ...(parsed.devDependencies ?? {}),
      };
    } catch {
      // Ignore invalid package JSON and fall back to Expo defaults below.
    }
  }

  const hasExpo = 'expo' in dependencies || 'expo-router' in dependencies || 'react-native' in dependencies;
  if (!hasExpo) {
    return waitForPreviewPort(box, APP_PREVIEW_PORTS, 10_000);
  }

  await box.exec.command(
    [
      `cd ${shellEscape(remoteRoot)}`,
      '&& if [ -f bun.lock ] || [ -f bun.lockb ]; then bun install;',
      'elif [ -f pnpm-lock.yaml ]; then corepack enable >/dev/null 2>&1 || true; pnpm install;',
      'elif [ -f yarn.lock ]; then corepack enable >/dev/null 2>&1 || true; yarn install;',
      'else npm install;',
      'fi',
    ].join(' '),
  );

  const command =
    typeof scripts.dev === 'string' && scripts.dev.trim().length > 0
      ? 'bun run dev'
      : typeof scripts.start === 'string' && scripts.start.trim().length > 0
        ? 'bun run start -- --tunnel --port 3000'
        : 'npx expo start --tunnel --port 3000';

  await box.exec.command(
    `bash -lc ${shellEscape(
      `cd ${shellEscape(remoteRoot)} && if [ -f ./.expo_env ]; then . ./.expo_env; fi && nohup ${command} > .indexblue-preview.log 2>&1 &`,
    )}`,
  );

  return waitForPreviewPort(box, APP_PREVIEW_PORTS, 120_000);
}

async function snapshotRemoteAppTemplate(remoteRoot: string, box: BuilderSandbox) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'indexblue-builder-app-template-'));
  const archivePath = path.join(tempDir, 'app-template.tgz');
  const workspacePath = path.join(tempDir, 'workspace');
  await mkdir(workspacePath, { recursive: true });

  try {
    const archiveBase64 = await box.exec
      .command(
        [
          'tar',
          ...APP_SNAPSHOT_EXCLUDES,
          '-czf',
          '-',
          '-C',
          shellEscape(remoteRoot),
          '.',
          '|',
          'base64',
          '-w',
          '0',
        ].join(' '),
      )
      .then((result) => result.stdout.trim());

    if (!archiveBase64) {
      throw new Error('Failed to snapshot the E2B app template workspace.');
    }

    await writeFile(archivePath, Buffer.from(archiveBase64, 'base64'));
    await execFileAsync('tar', ['-xzf', archivePath, '-C', workspacePath]);
    return workspacePath;
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    await rm(archivePath, { force: true }).catch(() => undefined);
  }
}

async function persistLiveSession({
  projectId,
  userId,
  theme,
  metadata,
  liveSession,
}: {
  projectId: string;
  userId: string;
  theme: string | null;
  metadata: BuilderProjectMetadata | null;
  liveSession: BuilderProjectLiveSession;
}) {
  return updateBuilderProjectTheme({
    projectId,
    userId,
    theme,
    metadata: {
      ...(metadata ?? {}),
      liveSession,
    },
  });
}

export async function createExpoAppTemplateWorkspaceFromE2B({ userId }: { userId: string }) {
  const { box } = await ensureBuilderBox({
    userId,
    runtime: 'node',
  });

  const remoteRoot = BUILDER_BOX_ROOT;
  const sessionToken = await ensureExpoSessionFiles(box, remoteRoot, box.id);
  const preview = (await waitForPreviewPort(box, [APP_TEMPLATE_PREVIEW_PORT], 120_000)) ?? {
    port: APP_TEMPLATE_PREVIEW_PORT,
    url: box.getPreviewUrl(APP_TEMPLATE_PREVIEW_PORT),
  };
  const workspacePath = await snapshotRemoteAppTemplate(remoteRoot, box);
  const now = getTimestamp();
  const liveSession: BuilderProjectLiveSession = {
    provider: 'e2b',
    sandboxId: box.id,
    remoteWorkspaceRoot: remoteRoot,
    previewUrl: preview.url,
    tunnelUrl: preview.url,
    previewPort: preview.port,
    sessionToken,
    status: 'ready',
    templateId: 'expo-app',
    source: 'template',
    createdAt: now,
    updatedAt: now,
    lastBootAt: now,
  };

  return {
    workspacePath,
    boxId: box.id,
    buildRuntime: 'node' as const,
    liveSession,
  };
}

export async function bootstrapBuilderAppProjectSession({
  project,
  reseedWorkspace = false,
}: {
  project: BuilderAppProjectContext;
  reseedWorkspace?: boolean;
}) {
  const remoteRoot = getBuilderProjectRemoteWorkspaceRoot(project);
  const { box, isNew } = await ensureBuilderBox({
    userId: project.userId,
    existingBoxId: project.boxId ?? project.metadata?.liveSession?.sandboxId ?? null,
    runtime: (project.buildRuntime?.trim() || 'node') as any,
  });

  if (isNew) {
    await installBunInBuilderBox(box).catch(() => undefined);
  }

  if ((reseedWorkspace || isNew) && project.workspacePath) {
    await seedBuilderWorkspace(box, project.workspacePath, {
      resetRemote: reseedWorkspace && remoteRoot !== BUILDER_BOX_ROOT,
      remoteRoot,
    }).catch((error) => {
      console.warn('Failed to seed mobile builder workspace:', error);
    });
  }

  const sessionToken = await ensureExpoSessionFiles(box, remoteRoot, box.id);

  let preview =
    (await waitForPreviewPort(
      box,
      remoteRoot === BUILDER_BOX_ROOT ? [APP_TEMPLATE_PREVIEW_PORT, ...APP_PREVIEW_PORTS] : APP_PREVIEW_PORTS,
      remoteRoot === BUILDER_BOX_ROOT ? 20_000 : 8_000,
    )) ?? null;

  if (!preview && remoteRoot !== BUILDER_BOX_ROOT) {
    preview = await ensureImportedAppPreview(box, remoteRoot);
  }

  const now = getTimestamp();
  const liveSession: BuilderProjectLiveSession = {
    provider: 'e2b',
    sandboxId: box.id,
    remoteWorkspaceRoot: remoteRoot,
    previewUrl: preview?.url ?? project.metadata?.liveSession?.previewUrl ?? null,
    tunnelUrl: preview?.url ?? project.metadata?.liveSession?.tunnelUrl ?? null,
    previewPort: preview?.port ?? project.metadata?.liveSession?.previewPort ?? null,
    sessionToken,
    status: preview ? 'ready' : 'booting',
    templateId: isExpoAppTemplateProject(project) ? 'expo-app' : (project.metadata?.liveSession?.templateId ?? null),
    source: project.metadata?.liveSession?.source ?? (isExpoAppTemplateProject(project) ? 'template' : 'import'),
    createdAt: project.metadata?.liveSession?.createdAt ?? now,
    updatedAt: now,
    lastBootAt: now,
    lastError: preview ? null : (project.metadata?.liveSession?.lastError ?? null),
  };

  await Promise.all([
    updateBuildSession({
      chatId: project.chatId,
      status: 'active',
      boxId: box.id,
      runtime: project.buildRuntime?.trim() || 'node',
    }),
    persistLiveSession({
      projectId: project.id,
      userId: project.userId,
      theme: project.theme,
      metadata: project.metadata,
      liveSession,
    }),
    createBuilderProjectEvent({
      projectId: project.id,
      userId: project.userId,
      channel: 'preview',
      type: preview ? 'preview.ready' : 'preview.booting',
      payload: {
        url: liveSession.previewUrl,
        port: liveSession.previewPort,
        sandboxId: box.id,
        remoteWorkspaceRoot: remoteRoot,
        at: now,
      },
    }).catch(() => undefined),
  ]);

  return {
    boxId: box.id,
    liveSession,
  };
}
