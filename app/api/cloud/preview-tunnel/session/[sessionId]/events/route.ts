import { getPreviewTunnelBroker } from '@/lib/cloud/preview-tunnel-broker';

export const runtime = 'nodejs';

const KEEPALIVE_INTERVAL_MS = 15_000;

function writeSse(controller: ReadableStreamDefaultController<Uint8Array>, payload: string) {
  controller.enqueue(new TextEncoder().encode(payload));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const broker = getPreviewTunnelBroker();
  const session = broker.getSession(sessionId);

  if (!session) {
    return Response.json({ error: 'Preview tunnel session not found.' }, { status: 404 });
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

      unsubscribe = broker.subscribeBrowser(
        sessionId,
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
