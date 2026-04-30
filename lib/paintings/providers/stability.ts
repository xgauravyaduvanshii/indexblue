import type { PaintingProviderRequest, PaintingRawOutput } from '../types.ts';

function getStabilityApiKey() {
  return process.env.STABILITY_API_KEY || '';
}

function getSizeParts(size: unknown) {
  const raw = typeof size === 'string' && size.includes('x') ? size : '1024x1024';
  const [width, height] = raw.split('x').map((value) => Number.parseInt(value, 10));
  return {
    width: Number.isFinite(width) ? width : 1024,
    height: Number.isFinite(height) ? height : 1024,
  };
}

function buildImageFile(input: NonNullable<PaintingProviderRequest['inputs']>[number]) {
  return new File([new Uint8Array(input.buffer)], 'painting-input', {
    type: input.mimeType,
  });
}

function getStabilityEndpoint(request: PaintingProviderRequest) {
  if (request.operation === 'upscale') {
    return 'https://api.stability.ai/v1/generation/stable-diffusion-x4-latent-upscaler/image-to-image/upscale';
  }

  if (request.operation === 'generate') {
    return 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image';
  }

  return 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image';
}

export async function callStabilityProvider(
  request: PaintingProviderRequest,
  fetchImpl: typeof fetch,
): Promise<PaintingRawOutput[]> {
  const endpoint = getStabilityEndpoint(request);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getStabilityApiKey()}`,
    Accept: request.operation === 'generate' ? 'application/json' : 'image/png',
  };

  let body: BodyInit;

  if (request.operation === 'generate') {
    const { width, height } = getSizeParts(request.options.size);
    body = JSON.stringify({
      width,
      height,
      text_prompts: [{ text: request.prompt }],
      samples: request.options.count ?? 1,
      style_preset: request.options.style,
    });
    headers['Content-Type'] = 'application/json';
  } else {
    const input = request.inputs?.[0];
    if (!input) {
      throw new Error('Stability image operations require an input image');
    }

    const formData = new FormData();
    formData.set('image', buildImageFile(input));

    if (request.operation !== 'upscale') {
      formData.set('text_prompts[0][text]', request.prompt);
    }

    if (typeof request.options.seed === 'number') {
      formData.set('seed', String(request.options.seed));
    }

    body = formData;
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Stability image request failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await response.json();
    return (payload.artifacts ?? []).flat().map((artifact: Record<string, unknown>) => ({
      mimeType: 'image/png',
      b64: typeof artifact.base64 === 'string' ? artifact.base64 : undefined,
    }));
  }

  return [
    {
      mimeType: contentType || 'image/png',
      b64: Buffer.from(await response.arrayBuffer()).toString('base64'),
    },
  ];
}
