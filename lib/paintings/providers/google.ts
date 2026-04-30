import type { PaintingProviderRequest, PaintingRawOutput } from '../types.ts';

function getGoogleApiKey() {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
}

function isGeminiImageModel(model: string) {
  return model.startsWith('gemini-') && model.includes('image');
}

function getGoogleImageConfig(size: unknown) {
  const mapping: Record<string, { aspectRatio: string; imageSize?: '1K' | '2K' | '4K' }> = {
    '1024x1024': { aspectRatio: '1:1', imageSize: '1K' },
    '2048x2048': { aspectRatio: '1:1', imageSize: '2K' },
    '1248x832': { aspectRatio: '3:2' },
    '832x1248': { aspectRatio: '2:3' },
    '1264x848': { aspectRatio: '3:2', imageSize: '1K' },
    '848x1264': { aspectRatio: '2:3', imageSize: '1K' },
    '1200x896': { aspectRatio: '4:3', imageSize: '1K' },
    '896x1200': { aspectRatio: '3:4', imageSize: '1K' },
    '1344x768': { aspectRatio: '16:9' },
    '768x1344': { aspectRatio: '9:16' },
    '1376x768': { aspectRatio: '16:9', imageSize: '1K' },
    '768x1376': { aspectRatio: '9:16', imageSize: '1K' },
  };

  return mapping[typeof size === 'string' ? size : ''] ?? { aspectRatio: '1:1', imageSize: '1K' as const };
}

function buildGeminiParts(request: PaintingProviderRequest) {
  const parts: Array<Record<string, unknown>> = [];

  for (const input of request.inputs ?? []) {
    parts.push({
      inlineData: {
        mimeType: input.mimeType,
        data: Buffer.from(input.buffer).toString('base64'),
      },
    });
  }

  parts.push({ text: request.prompt });

  return parts;
}

async function callGeminiImageProvider(
  request: PaintingProviderRequest,
  fetchImpl: typeof fetch,
): Promise<PaintingRawOutput[]> {
  const imageConfig = getGoogleImageConfig(request.options.size);
  const generationConfig: Record<string, unknown> = {
    responseModalities: ['TEXT', 'IMAGE'],
    imageConfig,
  };

  if (request.model === 'gemini-2.5-flash-image') {
    generationConfig.imageConfig = {
      aspectRatio: imageConfig.aspectRatio,
    };
  }

  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': getGoogleApiKey(),
      },
      body: JSON.stringify({
        contents: [
          {
            parts: buildGeminiParts(request),
          },
        ],
        generationConfig,
      }),
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || `Google image request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const outputs: PaintingRawOutput[] = [];

  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate?.content?.parts ?? []) {
      const inlineData = part?.inlineData ?? part?.inline_data;

      if (inlineData?.data) {
        outputs.push({
          mimeType: inlineData.mimeType || 'image/png',
          b64: inlineData.data,
        });
      }
    }
  }

  return outputs;
}

async function callImagenProvider(request: PaintingProviderRequest, fetchImpl: typeof fetch): Promise<PaintingRawOutput[]> {
  const imageConfig = getGoogleImageConfig(request.options.size);
  const parameters: Record<string, unknown> = {
    sampleCount: request.options.count ?? 1,
    aspectRatio: imageConfig.aspectRatio,
  };

  if (request.model !== 'gemini-2.5-flash-image' && imageConfig.imageSize) {
    parameters.imageSize = imageConfig.imageSize;
  }

  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:predict`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': getGoogleApiKey(),
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: request.prompt,
          },
        ],
        parameters,
      }),
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || `Google image request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return (payload.predictions ?? []).map((item: Record<string, unknown>) => ({
    mimeType: 'image/png',
    b64: typeof item.bytesBase64Encoded === 'string' ? item.bytesBase64Encoded : undefined,
  }));
}

export async function callGoogleProvider(
  request: PaintingProviderRequest,
  fetchImpl: typeof fetch,
): Promise<PaintingRawOutput[]> {
  if (isGeminiImageModel(request.model)) {
    return callGeminiImageProvider(request, fetchImpl);
  }

  return callImagenProvider(request, fetchImpl);
}
