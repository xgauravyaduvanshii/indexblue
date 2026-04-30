import { getUser } from '@/lib/auth-utils';
import { createPaintingRepository } from '@/lib/db/painting-queries';
import { executePaintingRequest } from '@/lib/paintings/service';
import { generateRequestSchema } from '@/lib/paintings/schemas';
import { uploadPaintingBlob } from '@/lib/paintings/storage';

export const runtime = 'nodejs';

export { generateRequestSchema };

export async function POST(request: Request) {
  const user = await getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = generateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      {
        error: 'Invalid generate payload',
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const result = await executePaintingRequest({
      userId: user.id,
      provider: parsed.data.provider,
      model: parsed.data.model,
      operation: 'generate',
      prompt: parsed.data.prompt,
      options: parsed.data.options,
      repository: createPaintingRepository(),
      uploadToBlob: uploadPaintingBlob,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate painting',
      },
      { status: 500 },
    );
  }
}
