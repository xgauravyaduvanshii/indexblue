import { z } from 'zod';
import { normalizeCloudSandboxRecordPayloads } from '@/lib/cloud/sandboxes';
import { requirePlatformApiKey } from '@/lib/cloud/platform-auth';
import {
  createCloudInfraMetric,
  getCloudInfraMachineById,
  synchronizeCloudInfraSandboxes,
  updateCloudInfraMachine,
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

const heartbeatSchema = z.object({
  infraId: z.string().min(1),
  latencyMs: z.number().int().min(0).optional(),
  metrics: metricSchema,
  processes: z
    .array(
      z.object({
        pid: z.number().int(),
        command: z.string(),
        cpuPercent: z.number(),
        memoryPercent: z.number(),
        startedAt: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
      }),
    )
    .default([]),
  sandboxes: z
    .array(
      z.object({
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
      }),
    )
    .default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const authResult = await requirePlatformApiKey(request);
  if (authResult.status !== 200) {
    return authResult.response;
  }

  const parsed = heartbeatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid infra heartbeat payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const machine = await getCloudInfraMachineById(parsed.data.infraId);
  if (!machine || machine.userId !== authResult.userId) {
    return Response.json({ error: 'Infra machine not found.' }, { status: 404 });
  }

  const recordedAt = new Date();
  const latestMetrics = {
    ...parsed.data.metrics,
    recordedAt: recordedAt.toISOString(),
  };

  await updateCloudInfraMachine({
    infraId: machine.id,
    status: 'online',
    lastSeenAt: recordedAt,
    lastHeartbeatAt: recordedAt,
    latencyMs: parsed.data.latencyMs ?? null,
    latestMetrics,
    latestProcesses: parsed.data.processes,
    metadata: {
      ...(machine.metadata ?? {}),
      ...(parsed.data.metadata ?? {}),
    },
  });

  await createCloudInfraMetric({
    infraId: machine.id,
    cpuPercent: parsed.data.metrics.cpuPercent,
    memoryPercent: parsed.data.metrics.memoryPercent,
    uptimeSeconds: parsed.data.metrics.uptimeSeconds,
    networkRxBytes: parsed.data.metrics.networkRxBytes,
    networkTxBytes: parsed.data.metrics.networkTxBytes,
    processCount: parsed.data.metrics.processCount,
    sandboxCount: parsed.data.metrics.sandboxCount,
  });

  await synchronizeCloudInfraSandboxes({
    infraId: machine.id,
    sandboxes: normalizeCloudSandboxRecordPayloads(parsed.data.sandboxes),
  });

  return Response.json({
    ok: true,
    infraId: machine.id,
    receivedAt: recordedAt.toISOString(),
  });
}
