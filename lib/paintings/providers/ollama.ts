import type { PaintingProviderRequest, PaintingRawOutput } from '../types.ts';

function getOllamaBaseUrl() {
  return process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
}

export async function callOllamaProvider(
  request: PaintingProviderRequest,
  fetchImpl: typeof fetch,
): Promise<PaintingRawOutput[]> {
  const response = await fetchImpl(`${getOllamaBaseUrl()}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ollama',
    },
    body: JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      size: typeof request.options.size === 'string' ? request.options.size : '1024x1024',
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Ollama image request failed with status ${response.status}`);
  }

  const payload = await response.json();

  if (Array.isArray(payload.data)) {
    return payload.data.map((item: Record<string, unknown>) => ({
      mimeType: 'image/png',
      b64: typeof item.b64_json === 'string' ? item.b64_json : undefined,
    }));
  }

  return [
    {
      mimeType: 'image/png',
      b64: typeof payload.image === 'string' ? payload.image : undefined,
    },
  ];
}
