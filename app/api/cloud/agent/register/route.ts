import { z } from 'zod';
import { normalizeCloudSandboxRecordPayloads } from '@/lib/cloud/sandboxes';
import { requirePlatformApiKey } from '@/lib/cloud/platform-auth';
import {
  createCloudInfraMetric,
  getCloudInfraMachineByUserMachineId,
  synchronizeCloudInfraSandboxes,
  upsertCloudInfraMachine,
} from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

const metricSchema = z.object({
  cpuPercent: z.number().min(0).max(100),
  memoryPercent: z.number().min(0).max(100),
  uptimeSeconds: z.number().int().min(0),
  networkRxBytes: z.number().int().min(0),
  networkTxBytes: z.number().int().min(0),
  processCount: z.number().int().min(0),
  sandboxCount: z.number().int().min(0),
});

const processSchema = z.object({
  pid: z.number().int(),
  command: z.string(),
  cpuPercent: z.number(),
  memoryPercent: z.number(),
  startedAt: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
});

const sandboxSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  startCommand: z.string().nullable().optional(),
  status: z.enum(['running', 'stopped', 'error']),
  pid: z.number().int().nullable().optional(),
  ports: z
    .array(
      z.object({
        port: z.number().int().min(1).max(65535),
        protocol: z.enum(['http', 'https', 'tcp']).optional(),
        label: z.string().nullable().optional(),
      }),
    )
    .default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  startCount: z.number().int().min(0).optional(),
  lastStartedAt: z.string().nullable().optional(),
  lastStoppedAt: z.string().nullable().optional(),
});

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  machineId: z.string().trim().min(1).max(160),
  hostname: z.string().trim().min(1).max(160).optional(),
  platform: z.string().trim().min(1).max(80).optional(),
  arch: z.string().trim().min(1).max(80).optional(),
  release: z.string().trim().min(1).max(80).optional(),
  nodeVersion: z.string().trim().min(1).max(40).optional(),
  cliVersion: z.string().trim().min(1).max(40).optional(),
  latencyMs: z.number().int().min(0).optional(),
  metrics: metricSchema.optional(),
  processes: z.array(processSchema).default([]),
  sandboxes: z.array(sandboxSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const authResult = await requirePlatformApiKey(request);
  if (authResult.status !== 200) {
    return authResult.response;
  }

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid infra registration payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date();
  const existingMachine = await getCloudInfraMachineByUserMachineId({
    userId: authResult.userId,
    machineId: parsed.data.machineId,
  });
  const metrics = parsed.data.metrics
    ? {
        ...parsed.data.metrics,
        recordedAt: now.toISOString(),
      }
    : null;

  const machine = await upsertCloudInfraMachine({
    userId: authResult.userId,
    apiKeyId: authResult.apiKey.id,
    name: parsed.data.name,
    machineId: parsed.data.machineId,
    hostname: parsed.data.hostname,
    platform: parsed.data.platform,
    arch: parsed.data.arch,
    release: parsed.data.release,
    nodeVersion: parsed.data.nodeVersion,
    cliVersion: parsed.data.cliVersion,
    status: 'online',
    connectedAt: now,
    lastSeenAt: now,
    lastHeartbeatAt: now,
    latencyMs: parsed.data.latencyMs ?? null,
    latestMetrics: metrics,
    latestProcesses: parsed.data.processes,
    metadata: {
      ...(existingMachine?.metadata ?? {}),
      ...(parsed.data.metadata ?? {}),
    },
  });

  if (!machine) {
    return Response.json({ error: 'Failed to register infra machine.' }, { status: 500 });
  }

  if (metrics) {
    await createCloudInfraMetric({
      infraId: machine.id,
      cpuPercent: metrics.cpuPercent,
      memoryPercent: metrics.memoryPercent,
      uptimeSeconds: metrics.uptimeSeconds,
      networkRxBytes: metrics.networkRxBytes,
      networkTxBytes: metrics.networkTxBytes,
      processCount: metrics.processCount,
      sandboxCount: metrics.sandboxCount,
    });
  }

  await synchronizeCloudInfraSandboxes({
    infraId: machine.id,
    sandboxes: normalizeCloudSandboxRecordPayloads(parsed.data.sandboxes),
  });

  return Response.json({
    infra: {
      id: machine.id,
      name: machine.name,
      status: machine.status,
      createdAt: machine.createdAt.toISOString(),
      updatedAt: machine.updatedAt.toISOString(),
    },
    pollIntervalMs: 2500,
  });
}
