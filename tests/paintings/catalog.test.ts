import test from 'node:test';
import assert from 'node:assert/strict';

const { getPaintingModelById, listConfiguredPaintingModels } = (await import(
  new URL('../../lib/paintings/catalog.ts', import.meta.url).href
)) as typeof import('../../lib/paintings/catalog');

test('listConfiguredPaintingModels hides providers without credentials', () => {
  const models = listConfiguredPaintingModels({
    OPENAI_API_KEY: 'openai-key',
    GOOGLE_GENERATIVE_AI_API_KEY: '',
    STABILITY_API_KEY: '',
    FREEPIK_API_KEY: 'freepik-key',
    OLLAMA_BASE_URL: '',
  });

  assert.deepEqual(
    [...new Set(models.map((model) => model.provider))],
    ['openai', 'freepik'],
  );
});

test('ollama models are always marked experimental', () => {
  const models = listConfiguredPaintingModels({
    OPENAI_API_KEY: '',
    GOOGLE_GENERATIVE_AI_API_KEY: '',
    STABILITY_API_KEY: '',
    FREEPIK_API_KEY: '',
    OLLAMA_BASE_URL: 'http://localhost:11434',
  });

  const ollamaModel = models.find((model) => model.provider === 'ollama');
  assert.ok(ollamaModel);
  assert.equal(ollamaModel?.experimental, true);
  assert.ok(ollamaModel?.operations.includes('generate'));
});

test('getPaintingModelById returns capability metadata for a known model', () => {
  const model = getPaintingModelById('openai', 'gpt-image-1');

  assert.ok(model);
  assert.equal(model?.provider, 'openai');
  assert.ok(model?.operations.includes('edit'));
  assert.ok(model?.sizes.includes('1024x1024'));
});

test('openai catalog exposes the current documented image model family', () => {
  const expectedModelIds = ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini', 'dall-e-3', 'dall-e-2'];

  for (const modelId of expectedModelIds) {
    const model = getPaintingModelById('openai', modelId);
    assert.ok(model, `expected OpenAI model ${modelId} to exist`);
    assert.equal(model?.provider, 'openai');
  }
});

test('google catalog includes both Gemini native image models and Imagen models', () => {
  const geminiModel = getPaintingModelById('google', 'gemini-3.1-flash-image-preview');
  const imagenModel = getPaintingModelById('google', 'imagen-4.0-ultra-generate-001');

  assert.ok(geminiModel);
  assert.ok(geminiModel?.operations.includes('edit'));
  assert.ok(imagenModel);
  assert.ok(imagenModel?.operations.includes('generate'));
});

test('freepik catalog exposes the larger async model family from the current docs', () => {
  const expectedModelIds = ['mystic', 'flux-kontext-pro', 'flux-2-pro', 'seedream-v4-5', 'z-image-turbo'];

  for (const modelId of expectedModelIds) {
    const model = getPaintingModelById('freepik', modelId);
    assert.ok(model, `expected Freepik/Magnific model ${modelId} to exist`);
    assert.equal(model?.provider, 'freepik');
  }
});
