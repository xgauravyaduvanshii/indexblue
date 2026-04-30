import { getUser } from '@/lib/auth-utils';
import { listConfiguredPaintingModels } from '@/lib/paintings/catalog';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return Response.json({
      models: listConfiguredPaintingModels({
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        STABILITY_API_KEY: process.env.STABILITY_API_KEY,
        FREEPIK_API_KEY: process.env.FREEPIK_API_KEY,
        OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
      }),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load painting models',
      },
      { status: 500 },
    );
  }
}
