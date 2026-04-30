import { jsonrepair } from 'jsonrepair';
import type { PaintingPromptSuggestion } from './types.ts';

const TAG_ORDER: PaintingPromptSuggestion['tag'][] = ['balanced', 'advanced', 'style-forward', 'production'];

function fallbackSuggestionForTag(prompt: string, tag: PaintingPromptSuggestion['tag']) {
  if (tag === 'balanced') {
    return {
      title: 'Balanced',
      tag,
      summary: 'Clean upgrade that keeps the original idea easy to use.',
      prompt: `${prompt.trim()}, clear subject focus, polished composition, appealing lighting, high-quality image generation.`,
    } satisfies Omit<PaintingPromptSuggestion, 'id'>;
  }

  if (tag === 'advanced') {
    return {
      title: 'Advanced',
      tag,
      summary: 'Adds deeper composition, material, and lighting direction.',
      prompt: `${prompt.trim()}, cinematic composition, layered depth, realistic textures, controlled highlights and shadows, refined material detail, premium visual finish.`,
    } satisfies Omit<PaintingPromptSuggestion, 'id'>;
  }

  if (tag === 'style-forward') {
    return {
      title: 'Style Forward',
      tag,
      summary: 'Pushes a fresher visual direction and new style energy.',
      prompt: `${prompt.trim()}, bold new visual style, surprising art direction, expressive color language, distinctive mood, memorable silhouette, trend-forward creative finish.`,
    } satisfies Omit<PaintingPromptSuggestion, 'id'>;
  }

  return {
    title: 'Production',
    tag,
    summary: 'Concise, repeatable, and ready for dependable generation runs.',
    prompt: `${prompt.trim()}, centered subject, clean separation, precise framing, controlled background, repeatable studio-quality output, production-ready prompt.`,
  } satisfies Omit<PaintingPromptSuggestion, 'id'>;
}

function normalizeTag(value: unknown): PaintingPromptSuggestion['tag'] | null {
  return value === 'balanced' || value === 'advanced' || value === 'style-forward' || value === 'production'
    ? value
    : null;
}

function asSuggestion(
  value: unknown,
  fallbackPrompt: string,
  fallbackTag: PaintingPromptSuggestion['tag'],
): Omit<PaintingPromptSuggestion, 'id'> {
  const fallback = fallbackSuggestionForTag(fallbackPrompt, fallbackTag);

  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const raw = value as Record<string, unknown>;
  const tag = normalizeTag(raw.tag) ?? fallbackTag;

  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : fallback.title,
    tag,
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : fallback.summary,
    prompt: typeof raw.prompt === 'string' && raw.prompt.trim() ? raw.prompt.trim() : fallback.prompt,
  };
}

export function normalizePaintingPromptSuggestions(rawText: string, originalPrompt: string, count = 4): PaintingPromptSuggestion[] {
  const safeCount = Math.min(Math.max(count, 3), 4);
  let parsedSuggestions: unknown[] = [];

  try {
    const repaired = jsonrepair(rawText);
    const parsed = JSON.parse(repaired) as { suggestions?: unknown[] } | unknown[];
    parsedSuggestions = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  } catch {
    parsedSuggestions = [];
  }

  return TAG_ORDER.slice(0, safeCount).map((tag, index) => {
    const suggestion = asSuggestion(parsedSuggestions[index], originalPrompt, tag);
    return {
      id: `suggestion-${index + 1}`,
      ...suggestion,
    };
  });
}
