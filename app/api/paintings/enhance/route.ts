import { getUser } from '@/lib/auth-utils';
import { generatePaintingPromptSuggestions } from '@/lib/paintings/prompt-enhance';
import { enhancePromptRequestSchema } from '@/lib/paintings/schemas';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const user = await getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = enhancePromptRequestSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: 'Invalid enhance payload',
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const suggestions = await generatePaintingPromptSuggestions(parsed.data);

    return Response.json({
      suggestions,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to enhance painting prompt',
      },
      { status: 500 },
    );
  }
}
