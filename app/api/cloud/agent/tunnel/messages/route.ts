import { z } from 'zod';
import { getPreviewTunnelBroker } from '@/lib/cloud/preview-tunnel-broker';
import { requirePlatformApiKey } from '@/lib/cloud/platform-auth';
import { getCloudInfraMachineById } from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

const messageSchema = z.object({
  infraId: z.string().min(1),
  sessionId: z.string().min(1),
  type: z.enum(['open', 'message', 'error', 'close']),
  protocol: z.string().optional(),
  data: z.string().optional(),
  isBinary: z.boolean().optional(),
  message: z.string().optional(),
  code: z.number().int().min(1000).max(4999).optional(),
  reason: z.string().max(240).optional(),
});

export async function POST(request: Request) {
  const authResult = await requirePlatformApiKey(request);
  if (authResult.status !== 200) {
    return authResult.response;
  }

  const parsed = messageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid preview tunnel agent payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const machine = await getCloudInfraMachineById(parsed.data.infraId);
  if (!machine || machine.userId !== authResult.userId) {
    return Response.json({ error: 'Infra machine not found.' }, { status: 404 });
  }

  const broker = getPreviewTunnelBroker();
  const session = broker.getSession(parsed.data.sessionId);
  if (!session || session.infraId !== machine.id) {
    return Response.json({ ok: true, ignored: true });
  }

  switch (parsed.data.type) {
    case 'open':
      broker.openFromAgent({
        sessionId: parsed.data.sessionId,
        protocol: parsed.data.protocol,
      });
      break;
    case 'message':
      broker.receiveAgentMessage({
        sessionId: parsed.data.sessionId,
        data: parsed.data.data ?? '',
        isBinary: Boolean(parsed.data.isBinary),
      });
      break;
    case 'error':
      broker.failFromAgent({
        sessionId: parsed.data.sessionId,
        message: parsed.data.message || 'Preview tunnel error.',
      });
      break;
    case 'close':
      broker.closeFromAgent({
        sessionId: parsed.data.sessionId,
        code: parsed.data.code,
        reason: parsed.data.reason,
      });
      break;
  }

  return Response.json({ ok: true });
}
