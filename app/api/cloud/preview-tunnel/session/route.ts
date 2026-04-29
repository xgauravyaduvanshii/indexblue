import { z } from 'zod';
import { getPreviewTunnelBroker } from '@/lib/cloud/preview-tunnel-broker';
import { getCloudInfraMachineById } from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

const createSessionSchema = z.object({
  infraId: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(['ws', 'wss']).default('ws'),
  pathname: z.string().default('/'),
  search: z.string().default(''),
  headers: z.record(z.string(), z.string()).default({}),
  protocols: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  const parsed = createSessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid preview tunnel session payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const machine = await getCloudInfraMachineById(parsed.data.infraId);
  if (!machine) {
    return Response.json({ error: 'Preview machine not found.' }, { status: 404 });
  }

  const session = getPreviewTunnelBroker().createSession({
    infraId: parsed.data.infraId,
    port: parsed.data.port,
    protocol: parsed.data.protocol,
    pathname: parsed.data.pathname.startsWith('/') ? parsed.data.pathname : `/${parsed.data.pathname}`,
    search: parsed.data.search.startsWith('?') || parsed.data.search.length === 0 ? parsed.data.search : `?${parsed.data.search}`,
    headers: parsed.data.headers,
    protocols: parsed.data.protocols,
  });

  return Response.json({
    sessionId: session.id,
    infraId: session.infraId,
    port: session.port,
  });
}
