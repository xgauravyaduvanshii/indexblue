import { z } from 'zod';
import { getPreviewTunnelBroker } from '@/lib/cloud/preview-tunnel-broker';
import { requirePlatformApiKey } from '@/lib/cloud/platform-auth';
import { getCloudInfraMachineById } from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

const querySchema = z.object({
  infraId: z.string().min(1),
});

const KEEPALIVE_INTERVAL_MS = 15_000;

function writeSse(controller: ReadableStreamDefaultController<Uint8Array>, payload: string) {
  controller.enqueue(new TextEncoder().encode(payload));
}

export async function GET(request: Request) {
  const authResult = await requirePlatformApiKey(request);
  if (authResult.status !== 200) {
    return authResult.response;
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return Response.json({ error: 'Invalid preview tunnel subscription.' }, { status: 400 });
  }

  const machine = await getCloudInfraMachineById(parsed.data.infraId);
  if (!machine || machine.userId !== authResult.userId) {
    return Response.json({ error: 'Infra machine not found.' }, { status: 404 });
  }

  let unsubscribe: (() => void) | null = null;
  let keepaliveTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const closeStream = () => {
        keepaliveTimer && clearInterval(keepaliveTimer);
        keepaliveTimer = null;
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // Ignore repeated closes.
        }
      };

      unsubscribe = getPreviewTunnelBroker().subscribeAgent(
        machine.id,
        (event) => {
          writeSse(controller, `data: ${JSON.stringify(event)}\n\n`);
        },
        closeStream,
      );

      keepaliveTimer = setInterval(() => {
        writeSse(controller, ': ping\n\n');
      }, KEEPALIVE_INTERVAL_MS);
      keepaliveTimer.unref?.();

      request.signal.addEventListener(
        'abort',
        () => {
          closeStream();
        },
        { once: true },
      );
    },
    cancel() {
      keepaliveTimer && clearInterval(keepaliveTimer);
      keepaliveTimer = null;
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
