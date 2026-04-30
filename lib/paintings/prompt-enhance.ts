import 'server-only';

import { generateText } from 'ai';
import { scira } from '@/ai/providers';
import type { PaintingOperation, PaintingPromptSuggestion, PaintingProvider } from './types.ts';
import { normalizePaintingPromptSuggestions } from './prompt-suggestions.ts';

export async function generatePaintingPromptSuggestions(input: {
  prompt: string;
  provider?: PaintingProvider;
  model?: string;
  operation?: PaintingOperation;
  suggestionCount?: number;
}): Promise<PaintingPromptSuggestion[]> {
  const count = Math.min(Math.max(input.suggestionCount ?? 4, 3), 4);

  const { text } = await generateText({
    model: scira.languageModel('scira-enhance'),
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: 1400,
    system: `You are an elite prompt engineer for image generation and image editing models.

Create ${count} upgraded prompt variants for the user's original prompt.

Hard requirements:
- Preserve the user's intent. Do not change the core subject.
- Produce exactly one suggestion for each applicable tag in this priority order: balanced, advanced, style-forward, production.
- "balanced" should be the safest high-quality upgrade for general users.
- "advanced" should add deeper composition, lens, lighting, material, and rendering detail.
- "style-forward" should push a fresh visual direction or novel aesthetic while staying useful.
- "production" should feel concise, controlled, and ready for repeatable generation/editing workflows.
- If the operation is edit, remix, or upscale, the prompts must clearly describe what should change while respecting the source image.
- Do not mention these internal tags inside the prompt text itself.
- Return valid JSON only.
- Use this exact structure:
{
  "suggestions": [
    { "title": "Balanced", "tag": "balanced", "summary": "...", "prompt": "..." },
    { "title": "Advanced", "tag": "advanced", "summary": "...", "prompt": "..." },
    { "title": "Style Forward", "tag": "style-forward", "summary": "...", "prompt": "..." },
    { "title": "Production", "tag": "production", "summary": "...", "prompt": "..." }
  ]
}

Context:
- Provider: ${input.provider ?? 'unspecified'}
- Model: ${input.model ?? 'unspecified'}
- Operation: ${input.operation ?? 'generate'}

Each summary must quickly explain why that suggestion is useful.
Each prompt should feel meaningfully different, not lightly reworded.`,
    prompt: input.prompt,
  });

  return normalizePaintingPromptSuggestions(text, input.prompt, count);
}
