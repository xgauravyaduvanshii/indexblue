import type { PaintingProviderRequest, PaintingRawOutput } from '../types.ts';

function getFreepikApiKey() {
  return process.env.FREEPIK_API_KEY || '';
}

function getFreepikBaseUrl() {
  return process.env.FREEPIK_BASE_URL || 'https://api.magnific.com';
}

function getPollDelayMs() {
  const raw = Number.parseInt(process.env.FREEPIK_POLL_DELAY_MS || '', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 2000;
}

function getMaxPollAttempts() {
  const raw = Number.parseInt(process.env.FREEPIK_POLL_MAX_ATTEMPTS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 25;
}

async function sleep(ms: number) {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

function mapSizeToAspectRatio(size: unknown) {
  if (size === '1440x768' || size === '1376x768' || size === '1344x768') return 'widescreen_16_9';
  if (size === '768x1440' || size === '768x1376' || size === '768x1344') return 'social_story_9_16';
  if (size === '1200x900') return 'classic_4_3';
  if (size === '900x1200') return 'traditional_3_4';
  if (size === '1536x1024') return 'standard_3_2';
  if (size === '1024x1536') return 'traditional_3_4';
  return 'square_1_1';
}

function getSizeParts(size: unknown) {
  const raw = typeof size === 'string' && size.includes('x') ? size : '1024x1024';
  const [width, height] = raw.split('x').map((value) => Number.parseInt(value, 10));
  return {
    width: Number.isFinite(width) ? width : 1024,
    height: Number.isFinite(height) ? height : 1024,
  };
}

function getEndpointForModel(model: string) {
  const endpointByModel: Record<string, string> = {
    mystic: '/v1/ai/mystic',
    'flux-kontext-pro': '/v1/ai/text-to-image/flux-kontext-pro',
    'flux-2-pro': '/v1/ai/text-to-image/flux-2-pro',
    'flux-2-turbo': '/v1/ai/text-to-image/flux-2-turbo',
    'flux-2-klein': '/v1/ai/text-to-image/flux-2-klein',
    'flux-pro-v1-1': '/v1/ai/text-to-image/flux-pro-v1-1',
    'flux-dev': '/v1/ai/text-to-image/flux-dev',
    hyperflux: '/v1/ai/text-to-image/hyperflux',
    'seedream-v4': '/v1/ai/text-to-image/seedream-v4',
    'seedream-v4-5': '/v1/ai/text-to-image/seedream-v4-5',
    'z-image-turbo': '/v1/ai/text-to-image/z-image-turbo',
    runway: '/v1/ai/text-to-image/runway',
    'classic-fast': '/v1/ai/text-to-image/classic-fast',
  };

  return endpointByModel[model] ?? '/v1/ai/text-to-image/flux-2-pro';
}

function getRequestHeaders() {
  const apiKey = getFreepikApiKey();
  return {
    'Content-Type': 'application/json',
    'x-magnific-api-key': apiKey,
    'x-freepik-api-key': apiKey,
  };
}

function buildRequestBody(request: PaintingProviderRequest) {
  const { width, height } = getSizeParts(request.options.size);
  const body: Record<string, unknown> = {
    prompt: request.prompt,
  };

  if (request.model === 'flux-kontext-pro') {
    body.aspect_ratio = mapSizeToAspectRatio(request.options.size);
  } else if (request.model === 'mystic') {
    body.aspect_ratio = mapSizeToAspectRatio(request.options.size);
  } else {
    body.width = width;
    body.height = height;
    body.aspect_ratio = mapSizeToAspectRatio(request.options.size);
  }

  if (typeof request.options.seed === 'number') {
    body.seed = request.options.seed;
  }

  if (request.options.promptUpsampling === true) {
    body.prompt_upsampling = true;
  }

  if (typeof request.options.guidance === 'number') {
    body.guidance = request.options.guidance;
  }

  if (request.inputs?.length) {
    for (const [index, input] of request.inputs.entries()) {
      const key = index === 0 ? 'input_image' : `input_image_${index + 1}`;
      body[key] = Buffer.from(input.buffer).toString('base64');
    }
  }

  return body;
}

function normalizeCompletedOutputs(data: unknown): PaintingRawOutput[] {
  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const generated = Array.isArray(payload.generated)
    ? payload.generated
    : Array.isArray(payload.images)
      ? payload.images
      : Array.isArray(payload.output)
        ? payload.output
        : [];

  const outputs: PaintingRawOutput[] = [];

  for (const item of generated) {
    if (typeof item === 'string') {
      outputs.push({
        mimeType: 'image/png',
        url: item,
      });
      continue;
    }

    if (item && typeof item === 'object') {
      const image = item as Record<string, unknown>;

      if (typeof image.url === 'string') {
        outputs.push({
          mimeType: 'image/png',
          url: image.url,
        });
        continue;
      }

      if (typeof image.base64 === 'string') {
        outputs.push({
          mimeType: 'image/png',
          b64: image.base64,
        });
      }
    }
  }

  return outputs;
}

async function pollFreepikTask({
  endpoint,
  taskId,
  fetchImpl,
}: {
  endpoint: string;
  taskId: string;
  fetchImpl: typeof fetch;
}) {
  const maxAttempts = getMaxPollAttempts();
  const pollDelayMs = getPollDelayMs();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(pollDelayMs);
    }

    const response = await fetchImpl(`${getFreepikBaseUrl()}${endpoint}/${taskId}`, {
      method: 'GET',
      headers: getRequestHeaders(),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(message || `Freepik image task failed with status ${response.status}`);
    }

    const payload = await response.json().catch(() => null);
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    const status = typeof data?.status === 'string' ? data.status : null;

    if (status === 'FAILED') {
      throw new Error(typeof data?.error === 'string' ? data.error : 'Freepik image task failed');
    }

    if (status === 'COMPLETED') {
      return normalizeCompletedOutputs(data);
    }
  }

  throw new Error(`Freepik image task timed out before completion after ${maxAttempts} polls`);
}

export async function callFreepikProvider(
  request: PaintingProviderRequest,
  fetchImpl: typeof fetch,
): Promise<PaintingRawOutput[]> {
  const endpoint = getEndpointForModel(request.model);
  const response = await fetchImpl(`${getFreepikBaseUrl()}${endpoint}`, {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify(buildRequestBody(request)),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Freepik image request failed with status ${response.status}`);
  }

  const payload = await response.json().catch(() => null);

  if (Array.isArray(payload?.data)) {
    return payload.data.map((item: Record<string, unknown>) => ({
      mimeType: 'image/png',
      b64: typeof item.base64 === 'string' ? item.base64 : undefined,
      url: typeof item.url === 'string' ? item.url : undefined,
    }));
  }

  const taskId =
    payload?.data && typeof payload.data === 'object' && typeof payload.data.task_id === 'string'
      ? payload.data.task_id
      : null;

  if (!taskId) {
    return normalizeCompletedOutputs(payload?.data ?? payload);
  }

  return pollFreepikTask({
    endpoint,
    taskId,
    fetchImpl,
  });
}
