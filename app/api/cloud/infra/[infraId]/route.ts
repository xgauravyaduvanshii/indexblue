import { z } from 'zod';
import { auth } from '@/lib/auth';
import { redactCloudInfraCommandPayloadForClient } from '@/lib/cloud/command-payloads';
import { getPreviewDomainStatus } from '@/lib/cloud/preview-domain-status';
import { getPreviewTunnelBroker } from '@/lib/cloud/preview-tunnel-broker';
import {
  buildPreviewDnsRecords,
  collectCloudPreviewLinks,
  getCloudPreviewAppOrigin,
  getPlatformPreviewDomainBase,
  resolvePreviewDnsTarget,
  sanitizePreviewDomainBase,
} from '@/lib/cloud/previews';
import {
  deleteCloudInfraMachine,
  getCloudInfraMachineByIdForUser,
  listCloudInfraCommands,
  listCloudInfraMetrics,
  listCloudInfraSandboxes,
  updateCloudInfraMachine,
} from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

const previewSettingsSchema = z.object({
  previewDomainBase: z.string().trim().max(160).nullable().optional(),
});

function getEffectiveStatus(status: string, lastSeenAt: Date | null) {
  if (status === 'online' && lastSeenAt && Date.now() - lastSeenAt.getTime() > 45_000) {
    return 'offline';
  }

  return status;
}

function buildStartRateSeries(commands: Awaited<ReturnType<typeof listCloudInfraCommands>>) {
  const buckets = new Map<string, number>();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  for (const command of commands) {
    if (command.createdAt.getTime() < cutoff) continue;
    if (command.status !== 'completed') continue;
    if (command.type !== 'sandbox:start' && command.type !== 'sandbox:restart' && command.type !== 'sandbox:create') {
      continue;
    }

    const bucketDate = new Date(command.createdAt);
    bucketDate.setMinutes(0, 0, 0);
    const key = bucketDate.toISOString();
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([timestamp, count]) => ({
      timestamp,
      count,
    }));
}

function getPreviewRequestHost(request: Request) {
  return request.headers.get('x-forwarded-host') || request.headers.get('host');
}

function serializePreviewTunnelSession(
  session:
    | ReturnType<ReturnType<typeof getPreviewTunnelBroker>['getInfraDiagnostics']>['lastSession']
    | null
    | undefined,
) {
  if (!session) {
    return null;
  }

  return {
    sessionId: session.sessionId,
    port: session.port,
    state: session.state,
    requestedProtocol: session.requestedProtocol,
    negotiatedProtocol: session.negotiatedProtocol,
    pathname: session.pathname,
    search: session.search,
    createdAt: new Date(session.createdAt).toISOString(),
    openedAt: session.openedAt ? new Date(session.openedAt).toISOString() : null,
    lastActivityAt: new Date(session.lastActivityAt).toISOString(),
    lastBrowserMessageAt: session.lastBrowserMessageAt ? new Date(session.lastBrowserMessageAt).toISOString() : null,
    lastAgentMessageAt: session.lastAgentMessageAt ? new Date(session.lastAgentMessageAt).toISOString() : null,
    browserMessageCount: session.browserMessageCount,
    agentMessageCount: session.agentMessageCount,
    lastErrorAt: session.lastErrorAt ? new Date(session.lastErrorAt).toISOString() : null,
    lastErrorMessage: session.lastErrorMessage,
    lastCloseAt: session.lastCloseAt ? new Date(session.lastCloseAt).toISOString() : null,
    lastCloseCode: session.lastCloseCode,
    lastCloseReason: session.lastCloseReason,
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ infraId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { infraId } = await params;
  const machine = await getCloudInfraMachineByIdForUser({
    infraId,
    userId: session.user.id,
  });

  if (!machine) {
    return Response.json({ error: 'Infra machine not found.' }, { status: 404 });
  }

  const [metrics, sandboxes, commands] = await Promise.all([
    listCloudInfraMetrics({ infraId: machine.id, limit: 72 }),
    listCloudInfraSandboxes({ infraId: machine.id }),
    listCloudInfraCommands({ infraId: machine.id, userId: session.user.id, limit: 80, excludeTypes: ['preview:fetch'] }),
  ]);

  const effectiveStatus = getEffectiveStatus(machine.status, machine.lastSeenAt);
  const latestMetric = machine.latestMetrics;
  const uptimePercent = effectiveStatus === 'online' ? 100 : 0;
  const customPreviewDomainBase = sanitizePreviewDomainBase(machine.metadata?.previewDomainBase);
  const previews = collectCloudPreviewLinks({
    infraId: machine.id,
    metadata: machine.metadata ?? {},
    sandboxes,
  });
  const previewTunnelDiagnostics = getPreviewTunnelBroker().getInfraDiagnostics(machine.id);
  const platformPreviewDomainBase = getPlatformPreviewDomainBase();
  const previewProbePort = previews[0]?.port ?? 3000;
  const machinePublicIp = typeof machine.metadata?.publicIp === 'string' ? machine.metadata.publicIp : null;
  const previewDnsTarget = resolvePreviewDnsTarget({
    requestHost: getPreviewRequestHost(request),
    fallbackHost: machinePublicIp,
  });
  const previewDnsRecords = buildPreviewDnsRecords(customPreviewDomainBase, {
    targetHost: previewDnsTarget.host,
  });
  const previewDomainStatus = await getPreviewDomainStatus({
    infraId: machine.id,
    domainBase: customPreviewDomainBase,
    probePort: previewProbePort,
  });

  return Response.json({
    infra: {
      id: machine.id,
      name: machine.name,
      machineId: machine.machineId,
      hostname: machine.hostname,
      platform: machine.platform,
      arch: machine.arch,
      release: machine.release,
      cliVersion: machine.cliVersion,
      nodeVersion: machine.nodeVersion,
      status: effectiveStatus,
      latencyMs: machine.latencyMs,
      totalCommands: machine.totalCommands,
      totalFsOps: machine.totalFsOps,
      totalDataTransferred: machine.totalDataTransferred,
      latestMetrics: latestMetric,
      latestProcesses: machine.latestProcesses,
      metadata: machine.metadata,
      connectedAt: machine.connectedAt?.toISOString() ?? null,
      lastSeenAt: machine.lastSeenAt?.toISOString() ?? null,
      lastHeartbeatAt: machine.lastHeartbeatAt?.toISOString() ?? null,
      createdAt: machine.createdAt.toISOString(),
      updatedAt: machine.updatedAt.toISOString(),
    },
    metrics: metrics
      .slice()
      .reverse()
      .map((metric) => ({
        cpuPercent: metric.cpuPercent,
        memoryPercent: metric.memoryPercent,
        uptimeSeconds: metric.uptimeSeconds,
        networkRxBytes: metric.networkRxBytes,
        networkTxBytes: metric.networkTxBytes,
        processCount: metric.processCount,
        sandboxCount: metric.sandboxCount,
        createdAt: metric.createdAt.toISOString(),
      })),
    sandboxes: sandboxes.map((sandbox) => ({
      id: sandbox.id,
      slug: sandbox.slug,
      name: sandbox.name,
      rootPath: sandbox.rootPath,
      startCommand: sandbox.startCommand,
      status: sandbox.status,
      pid: sandbox.pid,
      ports: sandbox.ports,
      metadata: sandbox.metadata,
      startCount: sandbox.startCount,
      lastStartedAt: sandbox.lastStartedAt?.toISOString() ?? null,
      lastStoppedAt: sandbox.lastStoppedAt?.toISOString() ?? null,
      createdAt: sandbox.createdAt.toISOString(),
      updatedAt: sandbox.updatedAt.toISOString(),
    })),
    recentCommands: commands.map((command) => ({
      id: command.id,
      type: command.type,
      status: command.status,
      payload: redactCloudInfraCommandPayloadForClient(command.type, command.payload),
      result: command.result,
      errorMessage: command.errorMessage,
      createdAt: command.createdAt.toISOString(),
      startedAt: command.startedAt?.toISOString() ?? null,
      completedAt: command.completedAt?.toISOString() ?? null,
    })),
    usage: {
      totalCommands: machine.totalCommands,
      totalFsOps: machine.totalFsOps,
      totalDataTransferred: machine.totalDataTransferred,
      uptimePercent,
      latestLatencyMs: machine.latencyMs,
    },
    previews,
    previewTunnel: {
      activeSessionCount: previewTunnelDiagnostics.activeSessionCount,
      openingSessionCount: previewTunnelDiagnostics.openingSessionCount,
      openSessionCount: previewTunnelDiagnostics.openSessionCount,
      lastActivityAt: previewTunnelDiagnostics.lastActivityAt
        ? new Date(previewTunnelDiagnostics.lastActivityAt).toISOString()
        : null,
      lastSession: serializePreviewTunnelSession(previewTunnelDiagnostics.lastSession),
      recentSessions: previewTunnelDiagnostics.recentSessions.map((session) => serializePreviewTunnelSession(session)),
    },
    previewConfig: {
      appOrigin: getCloudPreviewAppOrigin(),
      platformPreviewDomainBase,
      customPreviewDomainBase,
      dnsTargetHost: previewDnsTarget.host,
      dnsTargetSource: previewDnsTarget.source,
      dnsRecords: previewDnsRecords,
      wildcardHostPattern: `PORT--${machine.id}.${customPreviewDomainBase || platformPreviewDomainBase || 'your-domain.example.com'}`,
      requiresCustomDns: Boolean(customPreviewDomainBase),
      domainStatus: previewDomainStatus,
    },
    startRate: buildStartRateSeries(commands),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ infraId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = previewSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid preview settings payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { infraId } = await params;
  const machine = await getCloudInfraMachineByIdForUser({
    infraId,
    userId: session.user.id,
  });

  if (!machine) {
    return Response.json({ error: 'Infra machine not found.' }, { status: 404 });
  }

  const nextMetadata = {
    ...(machine.metadata ?? {}),
    previewDomainBase: sanitizePreviewDomainBase(parsed.data.previewDomainBase) ?? null,
  };

  const updated = await updateCloudInfraMachine({
    infraId: machine.id,
    userId: session.user.id,
    metadata: nextMetadata,
  });

  if (!updated) {
    return Response.json({ error: 'Failed to update preview settings.' }, { status: 500 });
  }

  const customPreviewDomainBase = sanitizePreviewDomainBase(nextMetadata.previewDomainBase);
  const previewProbePort = 3000;
  const machinePublicIp = typeof nextMetadata.publicIp === 'string' ? nextMetadata.publicIp : null;
  const previewDnsTarget = resolvePreviewDnsTarget({
    requestHost: getPreviewRequestHost(request),
    fallbackHost: machinePublicIp,
  });
  const previewDomainStatus = await getPreviewDomainStatus({
    infraId: machine.id,
    domainBase: customPreviewDomainBase,
    probePort: previewProbePort,
  });

  return Response.json({
    ok: true,
    previewConfig: {
      appOrigin: getCloudPreviewAppOrigin(),
      platformPreviewDomainBase: getPlatformPreviewDomainBase(),
      customPreviewDomainBase,
      dnsTargetHost: previewDnsTarget.host,
      dnsTargetSource: previewDnsTarget.source,
      dnsRecords: buildPreviewDnsRecords(customPreviewDomainBase, {
        targetHost: previewDnsTarget.host,
      }),
      wildcardHostPattern: `PORT--${machine.id}.${customPreviewDomainBase || getPlatformPreviewDomainBase() || 'your-domain.example.com'}`,
      requiresCustomDns: Boolean(customPreviewDomainBase),
      domainStatus: previewDomainStatus,
    },
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ infraId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { infraId } = await params;
  const deleted = await deleteCloudInfraMachine({
    infraId,
    userId: session.user.id,
  });

  if (!deleted) {
    return Response.json({ error: 'Infra machine not found.' }, { status: 404 });
  }

  return Response.json({ ok: true, infraId });
}
