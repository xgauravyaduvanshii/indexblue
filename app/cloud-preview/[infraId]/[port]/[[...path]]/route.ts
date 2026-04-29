import { buildCloudPreviewPath } from '@/lib/cloud/previews';
import { injectPreviewTunnelBootstrap } from '@/lib/cloud/preview-tunnel-browser';
import {
  createCloudInfraCommand,
  getCloudInfraCommandByIdForMachine,
  getCloudInfraMachineById,
} from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

const PREVIEW_WAIT_TIMEOUT_MS = 25_000;
const PREVIEW_POLL_INTERVAL_MS = 350;

function filterPreviewRequestHeaders(headers: Headers) {
  const allowed = new Set([
    'accept',
    'accept-language',
    'authorization',
    'cache-control',
    'content-type',
    'if-none-match',
    'if-modified-since',
    'origin',
    'pragma',
    'referer',
    'user-agent',
  ]);

  const result: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    const normalized = key.toLowerCase();
    if (!allowed.has(normalized)) continue;
    result[normalized] = value;
  }

  return result;
}

function rewritePreviewLocationHeader(value: string, request: Request, infraId: string, port: number) {
  if (!value) return value;

  try {
    const parsed = new URL(value);
    const isLocalPreviewHost =
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '0.0.0.0';

    if (!isLocalPreviewHost) {
      return value;
    }

    return `${new URL(request.url).origin}${buildCloudPreviewPath({
      infraId,
      port,
      pathname: `${parsed.pathname}${parsed.search}`,
    })}`;
  } catch {
    return value;
  }
}

function filterPreviewResponseHeaders(
  headers: Record<string, unknown>,
  request: Request,
  infraId: string,
  port: number,
) {
  const allowed = new Set([
    'cache-control',
    'content-disposition',
    'content-language',
    'content-type',
    'etag',
    'last-modified',
    'location',
    'set-cookie',
    'vary',
  ]);

  const responseHeaders = new Headers();
  for (const [key, rawValue] of Object.entries(headers)) {
    const normalized = key.toLowerCase();
    if (!allowed.has(normalized) || typeof rawValue !== 'string' || rawValue.length === 0) {
      continue;
    }

    responseHeaders.set(
      normalized,
      normalized === 'location'
        ? rewritePreviewLocationHeader(rawValue, request, infraId, port)
        : rawValue,
    );
  }

  responseHeaders.set('x-indexblue-preview', 'true');
  return responseHeaders;
}

async function waitForPreviewCommand({
  commandId,
  infraId,
}: {
  commandId: string;
  infraId: string;
}) {
  const deadline = Date.now() + PREVIEW_WAIT_TIMEOUT_MS;

  while (Date.now() <= deadline) {
    const command = await getCloudInfraCommandByIdForMachine({
      commandId,
      infraId,
    });

    if (command && command.status !== 'queued' && command.status !== 'running') {
      return command;
    }

    await new Promise((resolve) => setTimeout(resolve, PREVIEW_POLL_INTERVAL_MS));
  }

  return null;
}

async function handlePreviewRequest(
  request: Request,
  { params }: { params: Promise<{ infraId: string; port: string; path?: string[] }> },
) {
  const { infraId, port: rawPort, path = [] } = await params;
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return buildPreviewErrorResponse({ error: 'Invalid preview port.' }, 400);
  }

  const machine = await getCloudInfraMachineById(infraId);
  if (!machine) {
    return buildPreviewErrorResponse({ error: 'Preview machine not found.' }, 404);
  }

  const requestBody =
    request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS'
      ? null
      : Buffer.from(await request.arrayBuffer()).toString('base64');

  const command = await createCloudInfraCommand({
    infraId: machine.id,
    userId: machine.userId,
    type: 'preview:fetch',
    payload: {
      source: 'preview-proxy',
      actorLabel: 'Cloud Preview URL',
      preview: {
        port,
        method: request.method,
        pathname: `/${path.join('/')}`,
        search: new URL(request.url).search,
        headers: filterPreviewRequestHeaders(request.headers),
        bodyBase64: requestBody ?? undefined,
      },
    },
  });

  if (!command) {
    return buildPreviewErrorResponse({ error: 'Failed to queue preview request.' }, 500);
  }

  const completed = await waitForPreviewCommand({
    commandId: command.id,
    infraId: machine.id,
  });

  if (!completed) {
    return buildPreviewErrorResponse({ error: 'Preview request timed out waiting for the connected machine.' }, 504);
  }

  if (completed.status !== 'completed') {
    return buildPreviewErrorResponse(
      {
        error: completed.errorMessage || 'Preview request failed.',
      },
      502,
    );
  }

  const result = completed.result as Record<string, unknown>;
  const statusCode =
    typeof result.statusCode === 'number' && Number.isInteger(result.statusCode)
      ? Number(result.statusCode)
      : 502;
  const responseHeaders = filterPreviewResponseHeaders(
    typeof result.headers === 'object' && result.headers ? (result.headers as Record<string, unknown>) : {},
    request,
    infraId,
    port,
  );
  const bodyBase64 = typeof result.bodyBase64 === 'string' ? result.bodyBase64 : '';
  const bodyBuffer = bodyBase64 ? Buffer.from(bodyBase64, 'base64') : Buffer.alloc(0);
  const contentType = responseHeaders.get('content-type') || '';
  const shouldInjectTunnelBootstrap =
    request.method === 'GET' &&
    statusCode >= 200 &&
    statusCode < 400 &&
    contentType.toLowerCase().includes('text/html');

  const responseBody =
    request.method === 'HEAD'
      ? null
      : shouldInjectTunnelBootstrap
        ? injectPreviewTunnelBootstrap(bodyBuffer.toString('utf8'), { infraId, port })
        : bodyBuffer;

  if (shouldInjectTunnelBootstrap) {
    responseHeaders.set('x-indexblue-preview-tunnel', 'shim');
  }

  return new Response(responseBody, {
    status: statusCode,
    headers: responseHeaders,
  });
}

function buildPreviewErrorResponse(payload: Record<string, unknown>, status: number) {
  const response = Response.json(payload, { status });
  response.headers.set('x-indexblue-preview-proxy', 'true');
  return response;
}

export const GET = handlePreviewRequest;
export const POST = handlePreviewRequest;
export const PUT = handlePreviewRequest;
export const PATCH = handlePreviewRequest;
export const DELETE = handlePreviewRequest;
export const HEAD = handlePreviewRequest;
export const OPTIONS = handlePreviewRequest;
