import 'server-only';

import { and, desc, eq, gte } from 'drizzle-orm';
import { ChatSDKError } from '@/lib/errors';
import { maindb } from './index';
import {
  builderProjectAsset,
  builderProjectEnvVar,
  builderProjectEvent,
  builderProjectIntegration,
  builderProjectJob,
  builderProjectToolState,
} from './schema';

type JobLogEntry = {
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
  at: string;
};

function toDatabaseError(message: string, error: unknown): never {
  console.error(message, error);
  throw new ChatSDKError('bad_request:database', message);
}

export async function listBuilderProjectIntegrations({
  projectId,
  userId,
  type,
}: {
  projectId: string;
  userId: string;
  type?: string;
}) {
  try {
    return await maindb
      .select()
      .from(builderProjectIntegration)
      .where(
        type
          ? and(
              eq(builderProjectIntegration.projectId, projectId),
              eq(builderProjectIntegration.userId, userId),
              eq(builderProjectIntegration.type, type),
            )
          : and(eq(builderProjectIntegration.projectId, projectId), eq(builderProjectIntegration.userId, userId)),
      )
      .orderBy(builderProjectIntegration.type, builderProjectIntegration.provider);
  } catch (error) {
    toDatabaseError('Failed to list builder project integrations', error);
  }
}

export async function upsertBuilderProjectIntegration({
  projectId,
  userId,
  type,
  provider,
  status,
  dashboardUrl,
  webhookStatus,
  metadata,
  encryptedCredentials,
  lastCheckedAt,
  lastCheckStatus,
  lastError,
}: {
  projectId: string;
  userId: string;
  type: string;
  provider: string;
  status?: string;
  dashboardUrl?: string | null;
  webhookStatus?: string | null;
  metadata?: Record<string, unknown>;
  encryptedCredentials?: string | null;
  lastCheckedAt?: Date | null;
  lastCheckStatus?: string | null;
  lastError?: string | null;
}) {
  try {
    const [record] = await maindb
      .insert(builderProjectIntegration)
      .values({
        projectId,
        userId,
        type,
        provider,
        status: status ?? 'connected',
        dashboardUrl: dashboardUrl ?? null,
        webhookStatus: webhookStatus ?? null,
        metadata: metadata ?? {},
        encryptedCredentials: encryptedCredentials ?? null,
        lastCheckedAt: lastCheckedAt ?? null,
        lastCheckStatus: lastCheckStatus ?? null,
        lastError: lastError ?? null,
      })
      .onConflictDoUpdate({
        target: [
          builderProjectIntegration.projectId,
          builderProjectIntegration.type,
          builderProjectIntegration.provider,
        ],
        set: {
          status: status ?? 'connected',
          dashboardUrl: dashboardUrl ?? null,
          webhookStatus: webhookStatus ?? null,
          metadata: metadata ?? {},
          encryptedCredentials: encryptedCredentials ?? null,
          lastCheckedAt: lastCheckedAt ?? null,
          lastCheckStatus: lastCheckStatus ?? null,
          lastError: lastError ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to save builder project integration', error);
  }
}

export async function listBuilderProjectEnvVars({ projectId, userId }: { projectId: string; userId: string }) {
  try {
    return await maindb
      .select()
      .from(builderProjectEnvVar)
      .where(and(eq(builderProjectEnvVar.projectId, projectId), eq(builderProjectEnvVar.userId, userId)))
      .orderBy(builderProjectEnvVar.key);
  } catch (error) {
    toDatabaseError('Failed to list builder project environment variables', error);
  }
}

export async function upsertBuilderProjectEnvVar({
  projectId,
  userId,
  key,
  encryptedValue,
  isSecret,
  source,
  fileName,
}: {
  projectId: string;
  userId: string;
  key: string;
  encryptedValue: string;
  isSecret?: boolean;
  source?: string;
  fileName?: string;
}) {
  try {
    const [record] = await maindb
      .insert(builderProjectEnvVar)
      .values({
        projectId,
        userId,
        key,
        encryptedValue,
        isSecret: isSecret ?? true,
        source: source ?? 'manual',
        fileName: fileName ?? '.env.local',
      })
      .onConflictDoUpdate({
        target: [builderProjectEnvVar.projectId, builderProjectEnvVar.key],
        set: {
          encryptedValue,
          isSecret: isSecret ?? true,
          source: source ?? 'manual',
          fileName: fileName ?? '.env.local',
          updatedAt: new Date(),
        },
      })
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to save builder project environment variable', error);
  }
}

export async function deleteBuilderProjectEnvVar({
  projectId,
  userId,
  key,
}: {
  projectId: string;
  userId: string;
  key: string;
}) {
  try {
    const [record] = await maindb
      .delete(builderProjectEnvVar)
      .where(
        and(
          eq(builderProjectEnvVar.projectId, projectId),
          eq(builderProjectEnvVar.userId, userId),
          eq(builderProjectEnvVar.key, key),
        ),
      )
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to delete builder project environment variable', error);
  }
}

export async function listBuilderProjectAssets({
  projectId,
  userId,
  kind,
}: {
  projectId: string;
  userId: string;
  kind?: string;
}) {
  try {
    return await maindb
      .select()
      .from(builderProjectAsset)
      .where(
        kind
          ? and(
              eq(builderProjectAsset.projectId, projectId),
              eq(builderProjectAsset.userId, userId),
              eq(builderProjectAsset.kind, kind),
            )
          : and(eq(builderProjectAsset.projectId, projectId), eq(builderProjectAsset.userId, userId)),
      )
      .orderBy(desc(builderProjectAsset.createdAt));
  } catch (error) {
    toDatabaseError('Failed to list builder project assets', error);
  }
}

export async function createBuilderProjectAsset({
  projectId,
  userId,
  kind,
  sourceType,
  status,
  name,
  prompt,
  storageUrl,
  storageKey,
  mimeType,
  metadata,
  errorMessage,
}: {
  projectId: string;
  userId: string;
  kind: string;
  sourceType: string;
  status?: string;
  name: string;
  prompt?: string | null;
  storageUrl?: string | null;
  storageKey?: string | null;
  mimeType?: string | null;
  metadata?: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  try {
    const [record] = await maindb
      .insert(builderProjectAsset)
      .values({
        projectId,
        userId,
        kind,
        sourceType,
        status: status ?? 'queued',
        name,
        prompt: prompt ?? null,
        storageUrl: storageUrl ?? null,
        storageKey: storageKey ?? null,
        mimeType: mimeType ?? null,
        metadata: metadata ?? {},
        errorMessage: errorMessage ?? null,
      })
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to create builder project asset', error);
  }
}

export async function updateBuilderProjectAsset({
  assetId,
  projectId,
  userId,
  patch,
}: {
  assetId: string;
  projectId: string;
  userId: string;
  patch: Partial<{
    status: string;
    name: string;
    prompt: string | null;
    storageUrl: string | null;
    storageKey: string | null;
    mimeType: string | null;
    metadata: Record<string, unknown>;
    errorMessage: string | null;
    completedAt: Date | null;
  }>;
}) {
  try {
    const [record] = await maindb
      .update(builderProjectAsset)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(builderProjectAsset.id, assetId),
          eq(builderProjectAsset.projectId, projectId),
          eq(builderProjectAsset.userId, userId),
        ),
      )
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to update builder project asset', error);
  }
}

export async function deleteBuilderProjectAsset({
  assetId,
  projectId,
  userId,
}: {
  assetId: string;
  projectId: string;
  userId: string;
}) {
  try {
    const [record] = await maindb
      .delete(builderProjectAsset)
      .where(
        and(
          eq(builderProjectAsset.id, assetId),
          eq(builderProjectAsset.projectId, projectId),
          eq(builderProjectAsset.userId, userId),
        ),
      )
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to delete builder project asset', error);
  }
}

export async function listBuilderProjectJobs({
  projectId,
  userId,
  kind,
  limit = 20,
}: {
  projectId: string;
  userId: string;
  kind?: string;
  limit?: number;
}) {
  try {
    return await maindb
      .select()
      .from(builderProjectJob)
      .where(
        kind
          ? and(
              eq(builderProjectJob.projectId, projectId),
              eq(builderProjectJob.userId, userId),
              eq(builderProjectJob.kind, kind),
            )
          : and(eq(builderProjectJob.projectId, projectId), eq(builderProjectJob.userId, userId)),
      )
      .orderBy(desc(builderProjectJob.createdAt))
      .limit(limit);
  } catch (error) {
    toDatabaseError('Failed to list builder project jobs', error);
  }
}

export async function getBuilderProjectJobById({
  jobId,
  projectId,
  userId,
}: {
  jobId: string;
  projectId: string;
  userId: string;
}) {
  try {
    const [record] = await maindb
      .select()
      .from(builderProjectJob)
      .where(
        and(
          eq(builderProjectJob.id, jobId),
          eq(builderProjectJob.projectId, projectId),
          eq(builderProjectJob.userId, userId),
        ),
      )
      .limit(1);

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to load builder project job', error);
  }
}

export async function getLatestBuilderProjectJobByKind({
  projectId,
  userId,
  kind,
}: {
  projectId: string;
  userId: string;
  kind: string;
}) {
  try {
    const [record] = await maindb
      .select()
      .from(builderProjectJob)
      .where(
        and(
          eq(builderProjectJob.projectId, projectId),
          eq(builderProjectJob.userId, userId),
          eq(builderProjectJob.kind, kind),
        ),
      )
      .orderBy(desc(builderProjectJob.createdAt))
      .limit(1);

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to load latest builder project job', error);
  }
}

export async function createBuilderProjectJob({
  projectId,
  userId,
  kind,
  title,
  provider,
  status,
  payload,
  result,
  logs,
  errorMessage,
}: {
  projectId: string;
  userId: string;
  kind: string;
  title: string;
  provider?: string | null;
  status?: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  logs?: JobLogEntry[];
  errorMessage?: string | null;
}) {
  try {
    const [record] = await maindb
      .insert(builderProjectJob)
      .values({
        projectId,
        userId,
        kind,
        title,
        provider: provider ?? null,
        status: status ?? 'queued',
        payload: payload ?? {},
        result: result ?? {},
        logs: logs ?? [],
        errorMessage: errorMessage ?? null,
      })
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to create builder project job', error);
  }
}

export async function updateBuilderProjectJob({
  jobId,
  projectId,
  userId,
  patch,
}: {
  jobId: string;
  projectId: string;
  userId: string;
  patch: Partial<{
    title: string;
    provider: string | null;
    status: string;
    payload: Record<string, unknown>;
    result: Record<string, unknown>;
    logs: JobLogEntry[];
    errorMessage: string | null;
    completedAt: Date | null;
  }>;
}) {
  try {
    const [record] = await maindb
      .update(builderProjectJob)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(builderProjectJob.id, jobId),
          eq(builderProjectJob.projectId, projectId),
          eq(builderProjectJob.userId, userId),
        ),
      )
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to update builder project job', error);
  }
}

export async function appendBuilderProjectJobLog({
  jobId,
  projectId,
  userId,
  entry,
}: {
  jobId: string;
  projectId: string;
  userId: string;
  entry: JobLogEntry;
}) {
  const job = await getBuilderProjectJobById({ jobId, projectId, userId });
  if (!job) return null;

  const logs = Array.isArray(job.logs) ? [...job.logs, entry] : [entry];
  return updateBuilderProjectJob({
    jobId,
    projectId,
    userId,
    patch: {
      logs,
    },
  });
}

export async function getBuilderProjectToolState({
  projectId,
  userId,
  toolId,
}: {
  projectId: string;
  userId: string;
  toolId: string;
}) {
  try {
    const [record] = await maindb
      .select()
      .from(builderProjectToolState)
      .where(
        and(
          eq(builderProjectToolState.projectId, projectId),
          eq(builderProjectToolState.userId, userId),
          eq(builderProjectToolState.toolId, toolId),
        ),
      )
      .limit(1);

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to load builder project tool state', error);
  }
}

export async function listBuilderProjectToolStates({ projectId, userId }: { projectId: string; userId: string }) {
  try {
    return await maindb
      .select()
      .from(builderProjectToolState)
      .where(and(eq(builderProjectToolState.projectId, projectId), eq(builderProjectToolState.userId, userId)))
      .orderBy(builderProjectToolState.toolId);
  } catch (error) {
    toDatabaseError('Failed to list builder project tool states', error);
  }
}

export async function upsertBuilderProjectToolState({
  projectId,
  userId,
  toolId,
  state,
}: {
  projectId: string;
  userId: string;
  toolId: string;
  state: Record<string, unknown>;
}) {
  try {
    const [record] = await maindb
      .insert(builderProjectToolState)
      .values({
        projectId,
        userId,
        toolId,
        state,
      })
      .onConflictDoUpdate({
        target: [builderProjectToolState.projectId, builderProjectToolState.toolId],
        set: {
          state,
          updatedAt: new Date(),
        },
      })
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to save builder project tool state', error);
  }
}

export async function createBuilderProjectEvent({
  projectId,
  userId,
  channel,
  type,
  payload,
}: {
  projectId: string;
  userId: string;
  channel: string;
  type: string;
  payload?: Record<string, unknown>;
}) {
  try {
    const [record] = await maindb
      .insert(builderProjectEvent)
      .values({
        projectId,
        userId,
        channel,
        type,
        payload: payload ?? {},
      })
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to create builder project event', error);
  }
}

export async function listBuilderProjectEvents({
  projectId,
  userId,
  after,
  limit = 100,
}: {
  projectId: string;
  userId: string;
  after?: Date;
  limit?: number;
}) {
  try {
    return await maindb
      .select()
      .from(builderProjectEvent)
      .where(
        after
          ? and(
              eq(builderProjectEvent.projectId, projectId),
              eq(builderProjectEvent.userId, userId),
              gte(builderProjectEvent.createdAt, after),
            )
          : and(eq(builderProjectEvent.projectId, projectId), eq(builderProjectEvent.userId, userId)),
      )
      .orderBy(desc(builderProjectEvent.createdAt))
      .limit(limit);
  } catch (error) {
    toDatabaseError('Failed to list builder project events', error);
  }
}

export async function getBuilderProjectAppState({ projectId, userId }: { projectId: string; userId: string }) {
  const [integrations, envVars, assets, jobs, toolStates] = await Promise.all([
    listBuilderProjectIntegrations({ projectId, userId }),
    listBuilderProjectEnvVars({ projectId, userId }),
    listBuilderProjectAssets({ projectId, userId }),
    listBuilderProjectJobs({ projectId, userId, limit: 25 }),
    listBuilderProjectToolStates({ projectId, userId }),
  ]);

  return {
    integrations,
    envVars,
    assets,
    jobs,
    toolStates,
  };
}
