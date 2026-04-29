import { z } from 'zod';
import { getPreviewTunnelBroker } from '@/lib/cloud/preview-tunnel-broker';

export const runtime = 'nodejs';

const closeSchema = z.object({
  code: z.number().int().min(1000).max(4999).optional(),
  reason: z.string().max(240).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const parsed = closeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid preview tunnel close payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { sessionId } = await params;
  getPreviewTunnelBroker().closeFromBrowser({
    sessionId,
    code: parsed.data.code,
    reason: parsed.data.reason,
  });

  return Response.json({ ok: true });
}
