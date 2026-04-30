import type { PaintingProviderRequest, PaintingRawOutput } from '../types.ts';

function getOpenAIBaseUrl() {
  return process.env.OPENAI_PROXY_URL || 'https://api.openai.com';
}

function getOpenAIApiKey() {
  return process.env.OPENAI_PROXY_API_KEY || process.env.OPENAI_API_KEY || '';
}

function buildInputImageFile(input: NonNullable<PaintingProviderRequest['inputs']>[number], index: number) {
  return new File([new Uint8Array(input.buffer)], `openai-input-${index + 1}`, {
    type: input.mimeType,
  });
}

export async function callOpenAIProvider(
  request: PaintingProviderRequest,
  fetchImpl: typeof fetch,
): Promise<PaintingRawOutput[]> {
  const endpoint = request.operation === 'generate' ? '/v1/images/generations' : '/v1/images/edits';
  let headers: Record<string, string> = {
    Authorization: `Bearer ${getOpenAIApiKey()}`,
  };
  let body: BodyInit;

  if (request.operation === 'generate') {
    headers = {
      ...headers,
      'Content-Type': 'application/json',
    };
    body = JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      size: request.options.size,
      n: request.options.count ?? 1,
      quality: request.options.quality,
      background: request.options.background,
    });
  } else {
    const formData = new FormData();
    formData.set('model', request.model);
    formData.set('prompt', request.prompt);

    if (typeof request.options.size === 'string') {
      formData.set('size', request.options.size);
    }

    if (typeof request.options.background === 'string') {
      formData.set('background', request.options.background);
    }

    for (const [index, input] of (request.inputs ?? []).entries()) {
      formData.append('image', buildInputImageFile(input, index));
    }

    body = formData;
  }

  const response = await fetchImpl(`${getOpenAIBaseUrl()}${endpoint}`, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || `OpenAI image request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return (payload.data ?? []).map((item: Record<string, unknown>) => ({
    mimeType: 'image/png',
    b64: typeof item.b64_json === 'string' ? item.b64_json : undefined,
    revisedPrompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : null,
  }));
}
