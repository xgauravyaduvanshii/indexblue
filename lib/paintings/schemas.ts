import { z } from 'zod';

const providerSchema = z.enum(['openai', 'google', 'stability', 'freepik', 'ollama']);

export const generateRequestSchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  prompt: z.string().min(1),
  options: z.record(z.string(), z.unknown()).default({}),
});

export const transformRequestSchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  operation: z.enum(['edit', 'remix', 'upscale']),
  prompt: z.string().optional(),
  options: z.record(z.string(), z.unknown()).default({}),
  inputs: z
    .array(
      z.object({
        mimeType: z.string().min(1),
        base64: z.string().min(1),
      }),
    )
    .min(1),
});

export const enhancePromptRequestSchema = z.object({
  prompt: z.string().trim().min(1),
  provider: providerSchema.optional(),
  model: z.string().min(1).optional(),
  operation: z.enum(['generate', 'edit', 'remix', 'upscale']).optional(),
  suggestionCount: z.number().int().min(3).max(4).default(4),
});
