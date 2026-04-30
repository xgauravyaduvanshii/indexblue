import test from 'node:test';
import assert from 'node:assert/strict';

const { generateRequestSchema, transformRequestSchema } = (await import(
  new URL('../../lib/paintings/schemas.ts', import.meta.url).href
)) as typeof import('../../lib/paintings/schemas');

test('generateRequestSchema rejects empty prompts', () => {
  const parsed = generateRequestSchema.safeParse({
    provider: 'openai',
    model: 'gpt-image-1',
    prompt: '',
    options: {},
  });

  assert.equal(parsed.success, false);
});

test('transformRequestSchema requires at least one input image', () => {
  const parsed = transformRequestSchema.safeParse({
    provider: 'stability',
    model: 'stable-image-ultra',
    operation: 'upscale',
    prompt: 'Upscale this',
    options: {},
    inputs: [],
  });

  assert.equal(parsed.success, false);
});

test('enhancePromptRequestSchema requires a non-empty prompt and caps suggestion count', async () => {
  const { enhancePromptRequestSchema } = (await import(
    new URL('../../lib/paintings/schemas.ts', import.meta.url).href
  )) as typeof import('../../lib/paintings/schemas');

  const emptyPrompt = enhancePromptRequestSchema.safeParse({
    prompt: '',
    suggestionCount: 4,
  });
  const tooManySuggestions = enhancePromptRequestSchema.safeParse({
    prompt: 'Improve this scene description',
    suggestionCount: 8,
  });
  const valid = enhancePromptRequestSchema.safeParse({
    prompt: 'Improve this scene description',
    suggestionCount: 4,
    provider: 'google',
    model: 'gemini-3.1-flash-image-preview',
    operation: 'edit',
  });

  assert.equal(emptyPrompt.success, false);
  assert.equal(tooManySuggestions.success, false);
  assert.equal(valid.success, true);
});
