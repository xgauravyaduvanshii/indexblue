import test from 'node:test';
import assert from 'node:assert/strict';

const { createDraftFromPaintingRun, filterPaintingRuns } = (await import(
  new URL('../../lib/paintings/workspace-state.ts', import.meta.url).href
)) as typeof import('../../lib/paintings/workspace-state');

test('filterPaintingRuns narrows results by status, provider, and prompt search', () => {
  const runs = [
    {
      id: 'run_1',
      provider: 'openai',
      model: 'gpt-image-1',
      operation: 'generate',
      prompt: 'Neon fox in the rain',
      status: 'completed',
      requestPayload: {},
    },
    {
      id: 'run_2',
      provider: 'freepik',
      model: 'mystic',
      operation: 'generate',
      prompt: 'Retro robot portrait',
      status: 'error',
      requestPayload: {},
    },
    {
      id: 'run_3',
      provider: 'openai',
      model: 'gpt-image-2',
      operation: 'edit',
      prompt: 'Turn the jacket into chrome',
      status: 'completed',
      requestPayload: {},
    },
  ];

  const filtered = filterPaintingRuns(runs, {
    query: 'jacket',
    provider: 'openai',
    status: 'completed',
  });

  assert.deepEqual(
    filtered.map((run) => run.id),
    ['run_3'],
  );
});

test('createDraftFromPaintingRun rehydrates saved controls for duplicate and rerun flows', () => {
  const draft = createDraftFromPaintingRun({
    id: 'run_7',
    provider: 'google',
    model: 'gemini-3.1-flash-image-preview',
    operation: 'edit',
    prompt: 'Add a reflective visor and cinematic rim light',
    requestPayload: {
      options: {
        size: '2048x1152',
        count: 2,
        quality: 'high',
        background: 'transparent',
        seed: 42,
        negativePrompt: 'blurry, noisy',
        promptUpsampling: true,
      },
    },
  });

  assert.deepEqual(draft, {
    provider: 'google',
    model: 'gemini-3.1-flash-image-preview',
    operation: 'edit',
    prompt: 'Add a reflective visor and cinematic rim light',
    size: '2048x1152',
    count: 2,
    quality: 'high',
    background: 'transparent',
    seed: 42,
    negativePrompt: 'blurry, noisy',
    promptUpsampling: true,
  });
});
