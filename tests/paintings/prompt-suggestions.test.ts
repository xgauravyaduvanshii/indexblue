import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizePaintingPromptSuggestions } = (await import(
  new URL('../../lib/paintings/prompt-suggestions.ts', import.meta.url).href
)) as typeof import('../../lib/paintings/prompt-suggestions');

test('normalizePaintingPromptSuggestions parses JSON suggestion payloads into tagged options', () => {
  const suggestions = normalizePaintingPromptSuggestions(
    JSON.stringify({
      suggestions: [
        {
          title: 'Balanced',
          tag: 'balanced',
          summary: 'Clean upgrade for general use',
          prompt: 'A playful orange cat floating through a vibrant star field, clean composition, soft rim light.',
        },
        {
          title: 'Advanced',
          tag: 'advanced',
          summary: 'Adds deeper lighting and composition language',
          prompt: 'A playful orange cat floating through a vibrant star field, cinematic depth, layered nebula backdrop, dramatic rim light, crisp fur texture.',
        },
        {
          title: 'Style Forward',
          tag: 'style-forward',
          summary: 'Pushes a fresher illustration direction',
          prompt: 'A playful orange cat astronaut drifting through a surreal collage of stars, retro print texture, bold color blocking, offbeat editorial energy.',
        },
        {
          title: 'Production',
          tag: 'production',
          summary: 'Concise and repeatable',
          prompt: 'Orange cat astronaut in space, centered subject, readable facial expression, clean dark background, polished illustration finish.',
        },
      ],
    }),
    'cat in space',
    4,
  );

  assert.equal(suggestions.length, 4);
  assert.equal(suggestions[0].tag, 'balanced');
  assert.equal(suggestions[3].tag, 'production');
});

test('normalizePaintingPromptSuggestions falls back to deterministic suggestions when JSON parsing fails', () => {
  const suggestions = normalizePaintingPromptSuggestions('not valid json at all', 'cat in space', 4);

  assert.equal(suggestions.length, 4);
  assert.equal(suggestions[0].tag, 'balanced');
  assert.match(suggestions[1].prompt, /cinematic/i);
  assert.match(suggestions[2].summary, /style/i);
});
