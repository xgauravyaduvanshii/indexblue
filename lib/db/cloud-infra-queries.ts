import 'server-only';

import { and, asc, desc, eq, inArray, lt, notInArray } from 'drizzle-orm';
import { ChatSDKError } from '@/lib/errors';
import { maindb } from './index';
import {
  cloudInfraCommand,
  cloudInfraCommandEvent,
  cloudInfraMachine,
  cloudInfraMetric,
  cloudInfraSandbox,
  platformApiKey,
  platformDeviceSession,
} from './schema';
import type {
  CloudInfraCommandPayload,
  CloudInfraMachineMetadata,
  CloudInfraMetricSnapshot,
  CloudInfraProcessSnapshot,
  CloudInfraSandboxRecordPayload,
  PlatformApiKeyStatus,
  PlatformDeviceSessionStatus,
} from '@/lib/cloud/types';

function toDatabaseError(message: string, error: unknown): never {
  console.error(message, error);
  throw new ChatSDKError('bad_request:database', message);
}

export async function createPlatformApiKeyRecord({
  userId,
  label,
  tokenId,
  keyPrefix,
  keyHash,
}: {
  userId: string;
  label: string;
  tokenId: string;
  keyPrefix: string;
  keyHash: string;
}) {
  try {
    const [record] = await maindb
      .insert(platformApiKey)
      .values({
        userId,
        label,
        tokenId,
        keyPrefix,
        keyHash,
        status: 'active',
      })
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to create platform API key', error);
  }
}

export async function listPlatformApiKeysByUserId(userId: string) {
  try {
    return await maindb
      .select()
      .from(platformApiKey)
      .where(eq(platformApiKey.userId, userId))
      .orderBy(desc(platformApiKey.createdAt));
  } catch (error) {
    toDatabaseError('Failed to list platform API keys', error);
  }
}

export async function getPlatformApiKeyByIdForUser({ keyId, userId }: { keyId: string; userId: string }) {
  try {
    const [record] = await maindb
      .select()
      .from(platformApiKey)
      .where(and(eq(platformApiKey.id, keyId), eq(platformApiKey.userId, userId)))
      .limit(1);

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to load platform API key', error);
  }
}

export async function getPlatformApiKeyByTokenId(tokenId: string) {
  try {
    const [record] = await maindb.select().from(platformApiKey).where(eq(platformApiKey.tokenId, tokenId)).limit(1);
    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to load platform API key by token', error);
  }
}

export async function updatePlatformApiKeyStatus({
  keyId,
  userId,
  status,
}: {
  keyId: string;
  userId: string;
  status: PlatformApiKeyStatus;
}) {
  try {
    const [record] = await maindb
      .update(platformApiKey)
      .set({
        status,
        revokedAt: status === 'revoked' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(platformApiKey.id, keyId), eq(platformApiKey.userId, userId)))
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to update platform API key status', error);
  }
}

export async function touchPlatformApiKeyLastUsed(keyId: string) {
  try {
    const [record] = await maindb
      .update(platformApiKey)
      .set({
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(platformApiKey.id, keyId))
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to update platform API key last-used timestamp', error);
  }
}

export async function createPlatformDeviceSession({
  code,
  requestedLabel,
  expiresAt,
}: {
  code: string;
  requestedLabel?: string | null;
  expiresAt: Date;
}) {
  try {
    const [record] = await maindb
      .insert(platformDeviceSession)
      .values({
        code,
        requestedLabel: requestedLabel ?? null,
        expiresAt,
        status: 'pending',
      })
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to create platform device session', error);
  }
}

export async function getPlatformDeviceSessionById(sessionId: string) {
  try {
    const [record] = await maindb
      .select()
      .from(platformDeviceSession)
      .where(eq(platformDeviceSession.id, sessionId))
      .limit(1);

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to load platform device session', error);
  }
}

export async function getPlatformDeviceSessionByCode(code: string) {
  try {
    const [record] = await maindb
      .select()
      .from(platformDeviceSession)
      .where(eq(platformDeviceSession.code, code))
      .limit(1);

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to load platform device session by code', error);
  }
}

export async function updatePlatformDeviceSession({
  sessionId,
  status,
  userId,
  apiKeyId,
  encryptedApiKey,
  approvedAt,
  claimedAt,
}: {
  sessionId: string;
  status?: PlatformDeviceSessionStatus;
  userId?: string | null;
  apiKeyId?: string | null;
  encryptedApiKey?: string | null;
  approvedAt?: Date | null;
  claimedAt?: Date | null;
}) {
  try {
    const [record] = await maindb
      .update(platformDeviceSession)
      .set({
        ...(status ? { status } : {}),
        ...(userId !== undefined ? { userId } : {}),
        ...(apiKeyId !== undefined ? { apiKeyId } : {}),
        ...(encryptedApiKey !== undefined ? { encryptedApiKey } : {}),
        ...(approvedAt !== undefined ? { approvedAt } : {}),
        ...(claimedAt !== undefined ? { claimedAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(platformDeviceSession.id, sessionId))
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to update platform device session', error);
  }
}

export async function expireStalePlatformDeviceSessions(now = new Date()) {
  try {
    await maindb
      .update(platformDeviceSession)
      .set({
        status: 'expired',
        updatedAt: new Date(),
      })
      .where(and(eq(platformDeviceSession.status, 'pending'), lt(platformDeviceSession.expiresAt, now)));
  } catch (error) {
    toDatabaseError('Failed to expire stale platform device sessions', error);
  }
}

export async function upsertCloudInfraMachine({
  userId,
  apiKeyId,
  name,
  machineId,
  hostname,
  platform,
  arch,
  release,
  nodeVersion,
  cliVersion,
  status = 'online',
  connectedAt,
  lastSeenAt,
  lastHeartbeatAt,
  latencyMs,
  latestMetrics,
  latestProcesses,
  metadata,
}: {
  userId: string;
  apiKeyId?: string | null;
  name: string;
  machineId: string;
  hostname?: string | null;
  platform?: string | null;
  arch?: string | null;
  release?: string | null;
  nodeVersion?: string | null;
  cliVersion?: string | null;
  status?: string;
  connectedAt?: Date | null;
  lastSeenAt?: Date | null;
  lastHeartbeatAt?: Date | null;
  latencyMs?: number | null;
  latestMetrics?: CloudInfraMetricSnapshot | null;
  latestProcesses?: CloudInfraProcessSnapshot[];
  metadata?: CloudInfraMachineMetadata;
}) {
  try {
    const [record] = await maindb
      .insert(cloudInfraMachine)
      .values({
        userId,
        apiKeyId: apiKeyId ?? null,
        name,
        machineId,
        hostname: hostname ?? null,
        platform: platform ?? null,
        arch: arch ?? null,
        release: release ?? null,
        nodeVersion: nodeVersion ?? null,
        cliVersion: cliVersion ?? null,
        status,
        connectedAt: connectedAt ?? new Date(),
        lastSeenAt: lastSeenAt ?? new Date(),
        lastHeartbeatAt: lastHeartbeatAt ?? new Date(),
        latencyMs: latencyMs ?? null,
        latestMetrics: latestMetrics ?? null,
        latestProcesses: latestProcesses ?? [],
        metadata: metadata ?? {},
      })
      .onConflictDoUpdate({
        target: [cloudInfraMachine.userId, cloudInfraMachine.machineId],
        set: {
          apiKeyId: apiKeyId ?? null,
          name,
          hostname: hostname ?? null,
          platform: platform ?? null,
          arch: arch ?? null,
          release: release ?? null,
          nodeVersion: nodeVersion ?? null,
          cliVersion: cliVersion ?? null,
          status,
          connectedAt: connectedAt ?? new Date(),
          lastSeenAt: lastSeenAt ?? new Date(),
          lastHeartbeatAt: lastHeartbeatAt ?? new Date(),
          latencyMs: latencyMs ?? null,
          latestMetrics: latestMetrics ?? null,
          latestProcesses: latestProcesses ?? [],
          metadata: metadata ?? {},
          updatedAt: new Date(),
        },
      })
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to upsert cloud infra machine', error);
  }
}

export async function listCloudInfraMachinesByUserId(userId: string) {
  try {
    return await maindb
      .select()
      .from(cloudInfraMachine)
      .where(eq(cloudInfraMachine.userId, userId))
      .orderBy(desc(cloudInfraMachine.updatedAt), asc(cloudInfraMachine.name));
  } catch (error) {
    toDatabaseError('Failed to list cloud infra machines', error);
  }
}

export async function getCloudInfraMachineByIdForUser({
  infraId,
  userId,
}: {
  infraId: string;
  userId: string;
}) {
  try {
    const [record] = await maindb
      .select()
      .from(cloudInfraMachine)
      .where(and(eq(cloudInfraMachine.id, infraId), eq(cloudInfraMachine.userId, userId)))
      .limit(1);

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to load cloud infra machine', error);
  }
}

export async function getCloudInfraMachineById(infraId: string) {
  try {
    const [record] = await maindb.select().from(cloudInfraMachine).where(eq(cloudInfraMachine.id, infraId)).limit(1);
    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to load cloud infra machine by id', error);
  }
}

export async function getCloudInfraMachineByUserMachineId({
  userId,
  machineId,
}: {
  userId: string;
  machineId: string;
}) {
  try {
    const [record] = await maindb
      .select()
      .from(cloudInfraMachine)
      .where(and(eq(cloudInfraMachine.userId, userId), eq(cloudInfraMachine.machineId, machineId)))
      .limit(1);

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to load cloud infra machine by user and machine id', error);
  }
}

export async function updateCloudInfraMachine({
  infraId,
  userId,
  status,
  lastSeenAt,
  lastHeartbeatAt,
  latencyMs,
  latestMetrics,
  latestProcesses,
  metadata,
  totalCommandsDelta,
  totalFsOpsDelta,
  totalDataTransferredDelta,
}: {
  infraId: string;
  userId?: string;
  status?: string;
  lastSeenAt?: Date | null;
  lastHeartbeatAt?: Date | null;
  latencyMs?: number | null;
  latestMetrics?: CloudInfraMetricSnapshot | null;
  latestProcesses?: CloudInfraProcessSnapshot[];
  metadata?: CloudInfraMachineMetadata;
  totalCommandsDelta?: number;
  totalFsOpsDelta?: number;
  totalDataTransferredDelta?: number;
}) {
  try {
    const current = await getCloudInfraMachineById(infraId);
    if (!current || (userId && current.userId !== userId)) {
      return null;
    }

    const [record] = await maindb
      .update(cloudInfraMachine)
      .set({
        ...(status ? { status } : {}),
        ...(lastSeenAt !== undefined ? { lastSeenAt } : {}),
        ...(lastHeartbeatAt !== undefined ? { lastHeartbeatAt } : {}),
        ...(latencyMs !== undefined ? { latencyMs } : {}),
        ...(latestMetrics !== undefined ? { latestMetrics } : {}),
        ...(latestProcesses !== undefined ? { latestProcesses } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
        totalCommands: current.totalCommands + (totalCommandsDelta ?? 0),
        totalFsOps: current.totalFsOps + (totalFsOpsDelta ?? 0),
        totalDataTransferred: current.totalDataTransferred + (totalDataTransferredDelta ?? 0),
        updatedAt: new Date(),
      })
      .where(eq(cloudInfraMachine.id, infraId))
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to update cloud infra machine', error);
  }
}

export async function deleteCloudInfraMachine({ infraId, userId }: { infraId: string; userId: string }) {
  try {
    const [record] = await maindb
      .delete(cloudInfraMachine)
      .where(and(eq(cloudInfraMachine.id, infraId), eq(cloudInfraMachine.userId, userId)))
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to delete cloud infra machine', error);
  }
}

export async function createCloudInfraMetric({
  infraId,
  cpuPercent,
  memoryPercent,
  uptimeSeconds,
  networkRxBytes,
  networkTxBytes,
  processCount,
  sandboxCount,
}: {
  infraId: string;
  cpuPercent: number;
  memoryPercent: number;
  uptimeSeconds: number;
  networkRxBytes: number;
  networkTxBytes: number;
  processCount: number;
  sandboxCount: number;
}) {
  try {
    const [record] = await maindb
      .insert(cloudInfraMetric)
      .values({
        infraId,
        cpuPercent,
        memoryPercent,
        uptimeSeconds,
        networkRxBytes,
        networkTxBytes,
        processCount,
        sandboxCount,
      })
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to create cloud infra metric', error);
  }
}

export async function listCloudInfraMetrics({ infraId, limit = 48 }: { infraId: string; limit?: number }) {
  try {
    return await maindb
      .select()
      .from(cloudInfraMetric)
      .where(eq(cloudInfraMetric.infraId, infraId))
      .orderBy(desc(cloudInfraMetric.createdAt))
      .limit(limit);
  } catch (error) {
    toDatabaseError('Failed to list cloud infra metrics', error);
  }
}

export async function synchronizeCloudInfraSandboxes({
  infraId,
  sandboxes,
}: {
  infraId: string;
  sandboxes: CloudInfraSandboxRecordPayload[];
}) {
  try {
    const activeSlugs = sandboxes.map((sandbox) => sandbox.slug);

    for (const sandbox of sandboxes) {
      await maindb
        .insert(cloudInfraSandbox)
        .values({
          infraId,
          slug: sandbox.slug,
          name: sandbox.name,
          rootPath: sandbox.rootPath,
          startCommand: sandbox.startCommand,
          status: sandbox.status,
          pid: sandbox.pid,
          ports: sandbox.ports,
          metadata: sandbox.metadata ?? {},
          startCount: sandbox.startCount ?? 0,
          lastStartedAt: sandbox.lastStartedAt ? new Date(sandbox.lastStartedAt) : null,
          lastStoppedAt: sandbox.lastStoppedAt ? new Date(sandbox.lastStoppedAt) : null,
        })
        .onConflictDoUpdate({
          target: [cloudInfraSandbox.infraId, cloudInfraSandbox.slug],
          set: {
            name: sandbox.name,
            rootPath: sandbox.rootPath,
            startCommand: sandbox.startCommand,
            status: sandbox.status,
            pid: sandbox.pid,
            ports: sandbox.ports,
            metadata: sandbox.metadata ?? {},
            startCount: sandbox.startCount ?? 0,
            lastStartedAt: sandbox.lastStartedAt ? new Date(sandbox.lastStartedAt) : null,
            lastStoppedAt: sandbox.lastStoppedAt ? new Date(sandbox.lastStoppedAt) : null,
            updatedAt: new Date(),
          },
        });
    }

    const stale = await maindb
      .select()
      .from(cloudInfraSandbox)
      .where(eq(cloudInfraSandbox.infraId, infraId));

    const staleIds = stale.filter((sandbox) => !activeSlugs.includes(sandbox.slug)).map((sandbox) => sandbox.id);
    if (staleIds.length > 0) {
      await maindb
        .update(cloudInfraSandbox)
        .set({
          status: 'stopped',
          pid: null,
          updatedAt: new Date(),
        })
        .where(inArray(cloudInfraSandbox.id, staleIds));
    }

    return await listCloudInfraSandboxes({ infraId });
  } catch (error) {
    toDatabaseError('Failed to synchronize cloud infra sandboxes', error);
  }
}

export async function listCloudInfraSandboxes({ infraId }: { infraId: string }) {
  try {
    return await maindb
      .select()
      .from(cloudInfraSandbox)
      .where(eq(cloudInfraSandbox.infraId, infraId))
      .orderBy(asc(cloudInfraSandbox.name));
  } catch (error) {
    toDatabaseError('Failed to list cloud infra sandboxes', error);
  }
}

export async function createCloudInfraCommand({
  infraId,
  userId,
  type,
  payload,
}: {
  infraId: string;
  userId: string;
  type: string;
  payload: CloudInfraCommandPayload;
}) {
  try {
    const [record] = await maindb
      .insert(cloudInfraCommand)
      .values({
        infraId,
        userId,
        type,
        status: 'queued',
        payload,
      })
      .returning();

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to create cloud infra command', error);
  }
}

export async function listCloudInfraCommands({
  infraId,
  userId,
  limit = 40,
  excludeTypes = [],
}: {
  infraId: string;
  userId?: string;
  limit?: number;
  excludeTypes?: string[];
}) {
  try {
    const filters = [
      eq(cloudInfraCommand.infraId, infraId),
      ...(userId ? [eq(cloudInfraCommand.userId, userId)] : []),
      ...(excludeTypes.length > 0 ? [notInArray(cloudInfraCommand.type, excludeTypes)] : []),
    ];

    return await maindb
      .select()
      .from(cloudInfraCommand)
      .where(and(...filters))
      .orderBy(desc(cloudInfraCommand.createdAt))
      .limit(limit);
  } catch (error) {
    toDatabaseError('Failed to list cloud infra commands', error);
  }
}

export async function getCloudInfraCommandByIdForUser({
  commandId,
  infraId,
  userId,
}: {
  commandId: string;
  infraId: string;
  userId: string;
}) {
  try {
    const [record] = await maindb
      .select()
      .from(cloudInfraCommand)
      .where(
        and(
          eq(cloudInfraCommand.id, commandId),
          eq(cloudInfraCommand.infraId, infraId),
          eq(cloudInfraCommand.userId, userId),
        ),
      )
      .limit(1);

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to load cloud infra command', error);
  }
}

export async function getCloudInfraCommandByIdForMachine({
  commandId,
  infraId,
}: {
  commandId: string;
  infraId: string;
}) {
  try {
    const [record] = await maindb
      .select()
      .from(cloudInfraCommand)
      .where(and(eq(cloudInfraCommand.id, commandId), eq(cloudInfraCommand.infraId, infraId)))
      .limit(1);

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to load cloud infra command for machine', error);
  }
}

export async function claimNextCloudInfraCommand(infraId: string) {
  try {
    return await maindb.transaction(async (tx) => {
      const [queued] = await tx
        .select()
        .from(cloudInfraCommand)
        .where(and(eq(cloudInfraCommand.infraId, infraId), eq(cloudInfraCommand.status, 'queued')))
        .orderBy(asc(cloudInfraCommand.createdAt))
        .limit(1);

      if (!queued) {
        return null;
      }

      const [claimed] = await tx
        .update(cloudInfraCommand)
        .set({
          status: 'running',
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(cloudInfraCommand.id, queued.id), eq(cloudInfraCommand.status, 'queued')))
        .returning();

      return claimed ?? null;
    });
  } catch (error) {
    toDatabaseError('Failed to claim cloud infra command', error);
  }
}

export async function appendCloudInfraCommandEvents({
  commandId,
  infraId,
  events,
}: {
  commandId: string;
  infraId: string;
  events: Array<{ stream?: string; message: string; sequence: number }>;
}) {
  try {
    if (events.length === 0) return [];

    return await maindb
      .insert(cloudInfraCommandEvent)
      .values(
        events.map((event) => ({
          commandId,
          infraId,
          stream: event.stream ?? 'stdout',
          message: event.message,
          sequence: event.sequence,
        })),
      )
      .returning();
  } catch (error) {
    toDatabaseError('Failed to append cloud infra command events', error);
  }
}

export async function listCloudInfraCommandEvents({
  commandId,
  limit = 500,
}: {
  commandId: string;
  limit?: number;
}) {
  try {
    return await maindb
      .select()
      .from(cloudInfraCommandEvent)
      .where(eq(cloudInfraCommandEvent.commandId, commandId))
      .orderBy(asc(cloudInfraCommandEvent.sequence), asc(cloudInfraCommandEvent.createdAt))
      .limit(limit);
  } catch (error) {
    toDatabaseError('Failed to list cloud infra command events', error);
  }
}

export async function completeCloudInfraCommand({
  commandId,
  infraId,
  result,
  errorMessage,
  status,
  totalDataTransferredDelta = 0,
  totalFsOpsDelta = 0,
  countAsCommand = true,
}: {
  commandId: string;
  infraId: string;
  result?: Record<string, unknown>;
  errorMessage?: string | null;
  status?: 'completed' | 'failed' | 'cancelled';
  totalDataTransferredDelta?: number;
  totalFsOpsDelta?: number;
  countAsCommand?: boolean;
}) {
  try {
    const [record] = await maindb
      .update(cloudInfraCommand)
      .set({
        status: status ?? (errorMessage ? 'failed' : 'completed'),
        result: result ?? {},
        errorMessage: errorMessage ?? null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(cloudInfraCommand.id, commandId), eq(cloudInfraCommand.infraId, infraId)))
      .returning();

    if (record) {
      await updateCloudInfraMachine({
        infraId,
        totalCommandsDelta: countAsCommand ? 1 : 0,
        totalFsOpsDelta,
        totalDataTransferredDelta,
      });
    }

    return record ?? null;
  } catch (error) {
    toDatabaseError('Failed to complete cloud infra command', error);
  }
}

export async function cancelCloudInfraCommandForUser({
  commandId,
  infraId,
  userId,
  reason = 'Command cancelled by dashboard.',
}: {
  commandId: string;
  infraId: string;
  userId: string;
  reason?: string;
}) {
  try {
    return await maindb.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(cloudInfraCommand)
        .where(
          and(
            eq(cloudInfraCommand.id, commandId),
            eq(cloudInfraCommand.infraId, infraId),
            eq(cloudInfraCommand.userId, userId),
          ),
        )
        .limit(1);

      if (!existing) {
        return null;
      }

      if (existing.status !== 'queued' && existing.status !== 'running') {
        return existing;
      }

      const [updated] = await tx
        .update(cloudInfraCommand)
        .set({
          status: 'cancelled',
          errorMessage: reason,
          completedAt: existing.status === 'queued' ? new Date() : existing.completedAt,
          updatedAt: new Date(),
        })
        .where(eq(cloudInfraCommand.id, existing.id))
        .returning();

      return updated ?? existing;
    });
  } catch (error) {
    toDatabaseError('Failed to cancel cloud infra command', error);
  }
}
