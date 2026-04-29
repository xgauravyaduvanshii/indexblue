import { z } from 'zod';
import { getPreviewTunnelBroker } from '@/lib/cloud/preview-tunnel-broker';

export const runtime = 'nodejs';

const sendSchema = z.object({
  data: z.string(),
  isBinary: z.boolean().default(false),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const parsed = sendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid preview tunnel payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { sessionId } = await params;

  try {
    getPreviewTunnelBroker().receiveBrowserMessage({
      sessionId,
      data: parsed.data.data,
      isBinary: parsed.data.isBinary,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Preview tunnel session is unavailable.' },
      { status: 409 },
    );
  }

  return Response.json({ ok: true });
}
