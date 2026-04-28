import 'server-only';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type BuilderSandbox,
  ensureBuilderBox,
  getDefaultBuilderRemoteCwd,
  installBunInBuilderBox,
  seedBuilderWorkspace,
} from '@/lib/builder/box';
import { BUILDER_BOX_ROOT } from '@/lib/builder/paths';
import { getBuilderProjectRemoteWorkspaceRoot, type BuilderProjectMetadata } from '@/lib/builder/project-metadata';
import {
  appendBuilderProjectJobLog,
  createBuilderProjectEvent,
  updateBuilderProjectJob,
} from '@/lib/db/builder-app-queries';
import { updateBuildSession } from '@/lib/db/queries';

type BuilderProjectRuntimeContext = {
  id: string;
  chatId: string;
  sourceType: string;
  workspacePath: string | null;
  metadata?: BuilderProjectMetadata | null;
  buildRuntime?: string | null;
  boxId?: string | null;
};

type JobLogLevel = 'info' | 'success' | 'warning' | 'error';

export function parseEnvFileContent(content: string) {
  const entries: Record<string, string> = {};

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!key) continue;
    entries[key] = value.replace(/^['"]|['"]$/g, '');
  }

  return entries;
}

export function serializeEnvFileContent(entries: Record<string, string>) {
  return Object.entries(entries)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export function getProjectWorkspaceEnvFilePath(
  project: Pick<BuilderProjectRuntimeContext, 'workspacePath'>,
  fileName = '.env.local',
) {
  if (!project.workspacePath) return null;
  return path.join(project.workspacePath, fileName);
}

export function getProjectRemoteRoot(
  project: Pick<BuilderProjectRuntimeContext, 'sourceType' | 'workspacePath' | 'metadata'>,
) {
  return getBuilderProjectRemoteWorkspaceRoot({
    sourceType: project.sourceType ?? 'template',
    workspacePath: project.workspacePath,
    metadata: project.metadata ?? null,
  });
}

export function getProjectRemoteEnvFilePath(
  project: Pick<BuilderProjectRuntimeContext, 'sourceType' | 'workspacePath' | 'metadata'>,
  fileName = '.env.local',
) {
  return `${getProjectRemoteRoot(project)}/${fileName}`.replace(/\/{2,}/g, '/');
}

export async function readProjectWorkspaceEnvFile(
  project: Pick<BuilderProjectRuntimeContext, 'workspacePath'>,
  fileName = '.env.local',
) {
  const envPath = getProjectWorkspaceEnvFilePath(project, fileName);
  if (!envPath) return {};

  try {
    const content = await readFile(envPath, 'utf8');
    return parseEnvFileContent(content);
  } catch {
    return {};
  }
}

export async function ensureProjectBuilderBox({
  project,
  userId,
  reseedWorkspace = false,
}: {
  project: BuilderProjectRuntimeContext;
  userId: string;
  reseedWorkspace?: boolean;
}) {
  const runtime = project.buildRuntime && project.buildRuntime.trim().length > 0 ? project.buildRuntime : 'node';
  const { box, isNew } = await ensureBuilderBox({
    userId,
    existingBoxId: project.boxId ?? null,
    runtime: runtime as any,
  });

  if (isNew) {
    await installBunInBuilderBox(box).catch(() => undefined);
  }

  if ((isNew || reseedWorkspace) && project.workspacePath) {
    const remoteRoot = getProjectRemoteRoot(project);
    await seedBuilderWorkspace(box, project.workspacePath, {
      resetRemote: reseedWorkspace && remoteRoot !== BUILDER_BOX_ROOT,
      remoteRoot,
    }).catch((error) => {
      console.warn('Failed to seed builder workspace:', error);
    });
  }

  await updateBuildSession({
    chatId: project.chatId,
    status: 'active',
    boxId: box.id,
    runtime,
  });

  return box;
}

export async function readRemoteProjectTextFile(box: BuilderSandbox, filePath: string) {
  const result = await box.exec.command(`if [ -f "${filePath}" ]; then cat "${filePath}"; fi`);
  return result.result ?? '';
}

export async function writeRemoteProjectTextFile(box: BuilderSandbox, filePath: string, content: string) {
  await box.files.write({ path: filePath, content });
}

export async function syncProjectEnvFiles({
  project,
  userId,
  envs,
  fileName = '.env.local',
  reseedWorkspace = false,
}: {
  project: BuilderProjectRuntimeContext;
  userId: string;
  envs: Record<string, string>;
  fileName?: string;
  reseedWorkspace?: boolean;
}) {
  const content = serializeEnvFileContent(envs);
  const localEnvPath = getProjectWorkspaceEnvFilePath(project, fileName);

  if (localEnvPath) {
    await mkdir(path.dirname(localEnvPath), { recursive: true });
    await writeFile(localEnvPath, content, 'utf8');
  }

  const box = await ensureProjectBuilderBox({
    project,
    userId,
    reseedWorkspace,
  }).catch(() => null);

  if (box) {
    await writeRemoteProjectTextFile(box, getProjectRemoteEnvFilePath(project, fileName), content).catch(
      () => undefined,
    );
  }
}

export async function appendProjectJobLog({
  jobId,
  projectId,
  userId,
  channel,
  type,
  level,
  message,
  payload,
}: {
  jobId: string;
  projectId: string;
  userId: string;
  channel: string;
  type: string;
  level: JobLogLevel;
  message: string;
  payload?: Record<string, unknown>;
}) {
  const at = new Date().toISOString();
  await appendBuilderProjectJobLog({
    jobId,
    projectId,
    userId,
    entry: { message, level, at },
  }).catch(() => undefined);

  await createBuilderProjectEvent({
    projectId,
    userId,
    channel,
    type,
    payload: {
      level,
      message,
      at,
      ...(payload ?? {}),
    },
  }).catch(() => undefined);
}

export async function markProjectJobFailed({
  jobId,
  projectId,
  userId,
  channel,
  type,
  error,
}: {
  jobId: string;
  projectId: string;
  userId: string;
  channel: string;
  type: string;
  error: unknown;
}) {
  const message = error instanceof Error ? error.message : 'Unknown error';

  await appendProjectJobLog({
    jobId,
    projectId,
    userId,
    channel,
    type,
    level: 'error',
    message,
  });

  await updateBuilderProjectJob({
    jobId,
    projectId,
    userId,
    patch: {
      status: 'error',
      errorMessage: message,
      completedAt: new Date(),
    },
  }).catch(() => undefined);
}

export async function markProjectJobCompleted({
  jobId,
  projectId,
  userId,
  channel,
  type,
  message,
  result,
}: {
  jobId: string;
  projectId: string;
  userId: string;
  channel: string;
  type: string;
  message: string;
  result?: Record<string, unknown>;
}) {
  await appendProjectJobLog({
    jobId,
    projectId,
    userId,
    channel,
    type,
    level: 'success',
    message,
    payload: result,
  });

  await updateBuilderProjectJob({
    jobId,
    projectId,
    userId,
    patch: {
      status: 'completed',
      result: result ?? {},
      completedAt: new Date(),
    },
  }).catch(() => undefined);
}

export async function streamCommandIntoProjectJob({
  project,
  userId,
  jobId,
  channel,
  type,
  command,
  displayCommand,
  transformOutputChunk,
  cwd,
  reseedWorkspace = false,
}: {
  project: BuilderProjectRuntimeContext;
  userId: string;
  jobId: string;
  channel: string;
  type: string;
  command: string;
  displayCommand?: string;
  transformOutputChunk?: (chunk: string) => string;
  cwd?: string;
  reseedWorkspace?: boolean;
}) {
  const box = await ensureProjectBuilderBox({
    project,
    userId,
    reseedWorkspace,
  });

  const resolvedCwd = cwd ?? getDefaultBuilderRemoteCwd(Boolean(project.workspacePath));

  await appendProjectJobLog({
    jobId,
    projectId: project.id,
    userId,
    channel,
    type,
    level: 'info',
    message: `$ ${displayCommand ?? command}`,
    payload: { cwd: resolvedCwd, boxId: box.id },
  });

  const run = await box.exec.stream(`cd "${resolvedCwd}" && ${command}`);
  let output = '';

  for await (const chunk of run) {
    if (chunk.type !== 'output' || !chunk.data) continue;
    const safeChunk = transformOutputChunk ? transformOutputChunk(chunk.data) : chunk.data;
    output += safeChunk;

    await createBuilderProjectEvent({
      projectId: project.id,
      userId,
      channel,
      type: `${type}.output`,
      payload: {
        chunk: safeChunk,
        at: new Date().toISOString(),
      },
    }).catch(() => undefined);
  }

  const exitCode = run.exitCode ?? 0;
  return {
    boxId: box.id,
    output,
    exitCode,
    cwd: resolvedCwd,
  };
}
