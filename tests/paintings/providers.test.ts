import test from 'node:test';
import assert from 'node:assert/strict';

const { callPaintingProvider } = (await import(
  new URL('../../lib/paintings/service.ts', import.meta.url).href
)) as typeof import('../../lib/paintings/service');

test('callPaintingProvider handles Stability binary upscale responses', async () => {
  const result = await callPaintingProvider(
    {
      provider: 'stability',
      model: 'stable-image-ultra',
      operation: 'upscale',
      prompt: 'Upscale this poster',
      options: {},
      inputs: [
        {
          mimeType: 'image/png',
          buffer: Buffer.from('input-image'),
        },
      ],
    },
    async () =>
      new Response(Buffer.from('stability-upscaled'), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].mimeType, 'image/png');
  assert.equal(Buffer.from(result[0].b64 || '', 'base64').toString(), 'stability-upscaled');
});

test('callPaintingProvider handles Freepik JSON image payloads', async () => {
  const result = await callPaintingProvider(
    {
      provider: 'freepik',
      model: 'classic-fast',
      operation: 'generate',
      prompt: 'A floating city at sunrise',
      options: {},
    },
    async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              base64: Buffer.from('freepik-image').toString('base64'),
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
  );

  assert.equal(result.length, 1);
  assert.equal(Buffer.from(result[0].b64 || '', 'base64').toString(), 'freepik-image');
});

test('callPaintingProvider handles Google Gemini image models through generateContent', async () => {
  let requestUrl = '';
  let requestBody: string | undefined;

  const result = await callPaintingProvider(
    {
      provider: 'google',
      model: 'gemini-3.1-flash-image-preview',
      operation: 'generate',
      prompt: 'An architectural model floating above a drafting table',
      options: {
        size: '2048x1152',
      },
    },
    async (input, init) => {
      requestUrl = String(input);
      requestBody = typeof init?.body === 'string' ? init.body : undefined;

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: Buffer.from('google-native-image').toString('base64'),
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    },
  );

  assert.match(requestUrl, /gemini-3\.1-flash-image-preview:generateContent/);
  assert.match(requestBody || '', /responseModalities/);
  assert.equal(Buffer.from(result[0].b64 || '', 'base64').toString(), 'google-native-image');
});

test('callPaintingProvider polls async Freepik generation models until completion', async () => {
  let requests = 0;
  const previousDelay = process.env.FREEPIK_POLL_DELAY_MS;
  process.env.FREEPIK_POLL_DELAY_MS = '25';
  const startedAt = Date.now();

  try {
    const result = await callPaintingProvider(
      {
        provider: 'freepik',
        model: 'flux-2-pro',
        operation: 'generate',
        prompt: 'A cinematic mountain village in the clouds',
        options: {},
      },
      async (input) => {
        requests += 1;
        const url = String(input);

        if (url.endsWith('/v1/ai/text-to-image/flux-2-pro')) {
          return new Response(
            JSON.stringify({
              data: {
                task_id: 'task_123',
                status: 'CREATED',
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }

        const pollNumber = requests - 1;
        const status = pollNumber >= 3 ? 'COMPLETED' : pollNumber === 2 ? 'IN_PROGRESS' : 'CREATED';

        return new Response(
          JSON.stringify({
            data: {
              task_id: 'task_123',
              status,
              generated: status === 'COMPLETED' ? ['https://cdn.magnific.test/generated-image.png'] : [],
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      },
    );

    assert.equal(requests, 4);
    assert.equal(result[0].url, 'https://cdn.magnific.test/generated-image.png');
    assert.ok(Date.now() - startedAt >= 50, 'expected polling to pause between status checks');
  } finally {
    if (previousDelay === undefined) {
      delete process.env.FREEPIK_POLL_DELAY_MS;
    } else {
      process.env.FREEPIK_POLL_DELAY_MS = previousDelay;
    }
  }
});

test('callPaintingProvider sends OpenAI edit requests as multipart form data', async () => {
  let requestBody: BodyInit | null | undefined;

  const result = await callPaintingProvider(
    {
      provider: 'openai',
      model: 'gpt-image-1',
      operation: 'edit',
      prompt: 'Turn the jacket into brushed leather',
      options: {
        size: '1024x1024',
      },
      inputs: [
        {
          mimeType: 'image/png',
          buffer: Buffer.from('openai-edit-input'),
        },
      ],
    },
    async (_input, init) => {
      requestBody = init?.body;
      return new Response(
        JSON.stringify({
          data: [
            {
              b64_json: Buffer.from('openai-edit-image').toString('base64'),
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    },
  );

  assert.ok(requestBody instanceof FormData);
  assert.equal(Buffer.from(result[0].b64 || '', 'base64').toString(), 'openai-edit-image');
});

test('callPaintingProvider handles Ollama image payloads', async () => {
  const result = await callPaintingProvider(
    {
      provider: 'ollama',
      model: 'x/z-image-turbo',
      operation: 'generate',
      prompt: 'A calm lake in winter',
      options: {},
    },
    async () =>
      new Response(
        JSON.stringify({
          image: Buffer.from('ollama-image').toString('base64'),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
  );

  assert.equal(result.length, 1);
  assert.equal(Buffer.from(result[0].b64 || '', 'base64').toString(), 'ollama-image');
});
