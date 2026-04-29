import { z } from 'zod';
import { normalizeCloudSandboxRecordPayloads } from '@/lib/cloud/sandboxes';
import { requirePlatformApiKey } from '@/lib/cloud/platform-auth';
import {
  appendCloudInfraCommandEvents,
  completeCloudInfraCommand,
  createCloudInfraMetric,
  getCloudInfraCommandByIdForMachine,
  getCloudInfraMachineById,
  synchronizeCloudInfraSandboxes,
  updateCloudInfraMachine,
} from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

const readCommandSchema = z.object({
  infraId: z.string().min(1),
});

const updateCommandSchema = z.object({
  infraId: z.string().min(1),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  errorMessage: z.string().nullable().optional(),
  totalDataTransferred: z.number().int().min(0).optional(),
  totalFsOps: z.number().int().min(0).optional(),
  events: z
    .array(
      z.object({
        stream: z.string().optional(),
        message: z.string(),
        sequence: z.number().int().min(0),
      }),
    )
    .default([]),
  metrics: z
    .object({
      cpuPercent: z.number().min(0).max(100),
      memoryPercent: z.number().min(0).max(100),
      uptimeSeconds: z.number().int().min(0),
      networkRxBytes: z.number().int().min(0),
      networkTxBytes: z.number().int().min(0),
      processCount: z.number().int().min(0),
      sandboxCount: z.number().int().min(0),
    })
    .optional(),
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
    .optional(),
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
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  latencyMs: z.number().int().min(0).nullable().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ commandId: string }> }) {
  const authResult = await requirePlatformApiKey(request);
  if (authResult.status !== 200) {
    return authResult.response;
  }

  const parsed = readCommandSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return Response.json({ error: 'Invalid command status request.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const machine = await getCloudInfraMachineById(parsed.data.infraId);
  if (!machine || machine.userId !== authResult.userId) {
    return Response.json({ error: 'Infra machine not found.' }, { status: 404 });
  }

  const { commandId } = await params;
  const command = await getCloudInfraCommandByIdForMachine({
    commandId,
    infraId: machine.id,
  });

  if (!command) {
    return Response.json({ error: 'Command not found.' }, { status: 404 });
  }

  return Response.json({
    command: {
      id: command.id,
      type: command.type,
      status: command.status,
      errorMessage: command.errorMessage,
      startedAt: command.startedAt?.toISOString() ?? null,
      completedAt: command.completedAt?.toISOString() ?? null,
      updatedAt: command.updatedAt.toISOString(),
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ commandId: string }> }) {
  const authResult = await requirePlatformApiKey(request);
  if (authResult.status !== 200) {
    return authResult.response;
  }

  const parsed = updateCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid command-update payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const machine = await getCloudInfraMachineById(parsed.data.infraId);
  if (!machine || machine.userId !== authResult.userId) {
    return Response.json({ error: 'Infra machine not found.' }, { status: 404 });
  }

  const { commandId } = await params;
  const command = await getCloudInfraCommandByIdForMachine({
    commandId,
    infraId: machine.id,
  });

  if (!command) {
    return Response.json({ error: 'Command not found.' }, { status: 404 });
  }

  if (parsed.data.events.length > 0) {
    await appendCloudInfraCommandEvents({
      commandId: command.id,
      infraId: machine.id,
      events: parsed.data.events,
    });
  }

  const now = new Date();
  const latestMetrics = parsed.data.metrics
    ? {
        ...parsed.data.metrics,
        recordedAt: now.toISOString(),
      }
    : undefined;

  await updateCloudInfraMachine({
    infraId: machine.id,
    status: parsed.data.status === 'cancelled' ? 'attention' : 'online',
    lastSeenAt: now,
    lastHeartbeatAt: now,
    latencyMs: parsed.data.latencyMs ?? undefined,
    latestMetrics,
    latestProcesses: parsed.data.processes,
    metadata:
      parsed.data.metadata !== undefined
        ? {
            ...(machine.metadata ?? {}),
            ...parsed.data.metadata,
          }
        : undefined,
  });

  if (parsed.data.metrics) {
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
  }

  if (parsed.data.sandboxes) {
    await synchronizeCloudInfraSandboxes({
      infraId: machine.id,
      sandboxes: normalizeCloudSandboxRecordPayloads(parsed.data.sandboxes),
    });
  }

  if (parsed.data.status && parsed.data.status !== 'running') {
    const errorMessage =
      parsed.data.status === 'cancelled' ? parsed.data.errorMessage ?? 'Command cancelled.' : parsed.data.errorMessage;

    const completed = await completeCloudInfraCommand({
      commandId: command.id,
      infraId: machine.id,
      result: parsed.data.result,
      errorMessage,
      status: parsed.data.status,
      totalDataTransferredDelta: parsed.data.totalDataTransferred ?? 0,
      totalFsOpsDelta: parsed.data.totalFsOps ?? 0,
      countAsCommand: command.type !== 'preview:fetch',
    });

    return Response.json({
      command: completed
        ? {
            id: completed.id,
            status: completed.status,
            updatedAt: completed.updatedAt.toISOString(),
          }
        : null,
    });
  }

  return Response.json({
    ok: true,
    commandId: command.id,
    updatedAt: now.toISOString(),
  });
}
