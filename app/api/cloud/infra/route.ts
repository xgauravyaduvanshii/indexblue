import { auth } from '@/lib/auth';
import { getPreviewDomainStatus } from '@/lib/cloud/preview-domain-status';
import { listCloudInfraMachinesByUserId } from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

function getEffectiveStatus(status: string, lastSeenAt: Date | null) {
  if (status === 'online' && lastSeenAt && Date.now() - lastSeenAt.getTime() > 45_000) {
    return 'offline';
  }

  return status;
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const machines = await listCloudInfraMachinesByUserId(session.user.id);
  const infra = await Promise.all(
    machines.map(async (machine) => {
      const previewDomainBase =
        typeof machine.metadata?.previewDomainBase === 'string' ? machine.metadata.previewDomainBase : null;
      const activePreviewPort = Array.isArray(machine.metadata?.activePreviews)
        ? Number((machine.metadata.activePreviews[0] as { port?: number } | undefined)?.port || 3000)
        : 3000;
      const previewDomainStatus = await getPreviewDomainStatus({
        infraId: machine.id,
        domainBase: previewDomainBase,
        probePort: Number.isInteger(activePreviewPort) && activePreviewPort > 0 ? activePreviewPort : 3000,
      });

      return {
        id: machine.id,
        name: machine.name,
        machineId: machine.machineId,
        hostname: machine.hostname,
        platform: machine.platform,
        arch: machine.arch,
        release: machine.release,
        cliVersion: machine.cliVersion,
        nodeVersion: machine.nodeVersion,
        status: getEffectiveStatus(machine.status, machine.lastSeenAt),
        latencyMs: machine.latencyMs,
        totalCommands: machine.totalCommands,
        totalFsOps: machine.totalFsOps,
        totalDataTransferred: machine.totalDataTransferred,
        latestMetrics: machine.latestMetrics,
        latestProcesses: machine.latestProcesses,
        metadata: machine.metadata,
        previewDomainStatus,
        connectedAt: machine.connectedAt?.toISOString() ?? null,
        lastSeenAt: machine.lastSeenAt?.toISOString() ?? null,
        lastHeartbeatAt: machine.lastHeartbeatAt?.toISOString() ?? null,
        createdAt: machine.createdAt.toISOString(),
        updatedAt: machine.updatedAt.toISOString(),
      };
    }),
  );

  return Response.json({
    infra,
  });
}
