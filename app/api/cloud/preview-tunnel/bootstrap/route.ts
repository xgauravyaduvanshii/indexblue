import { z } from 'zod';
import { buildPreviewTunnelBootstrapScript } from '@/lib/cloud/preview-tunnel-browser';

export const runtime = 'nodejs';

const querySchema = z.object({
  infraId: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!parsed.success) {
    return Response.json({ error: 'Invalid preview tunnel bootstrap request.' }, { status: 400 });
  }

  return new Response(
    buildPreviewTunnelBootstrapScript({
      infraId: parsed.data.infraId,
      port: parsed.data.port,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    },
  );
}
