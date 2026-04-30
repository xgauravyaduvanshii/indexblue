import { getUser } from '@/lib/auth-utils';
import { createPaintingRepository } from '@/lib/db/painting-queries';
import { executePaintingRequest } from '@/lib/paintings/service';
import { transformRequestSchema } from '@/lib/paintings/schemas';
import { uploadPaintingBlob } from '@/lib/paintings/storage';

export const runtime = 'nodejs';

export { transformRequestSchema };

export async function POST(request: Request) {
  const user = await getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = transformRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      {
        error: 'Invalid transform payload',
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
      operation: parsed.data.operation,
      prompt: parsed.data.prompt ?? '',
      options: parsed.data.options,
      inputs: parsed.data.inputs.map((input) => ({
        mimeType: input.mimeType,
        buffer: Buffer.from(input.base64, 'base64'),
      })),
      repository: createPaintingRepository(),
      uploadToBlob: uploadPaintingBlob,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to transform painting',
      },
      { status: 500 },
    );
  }
}
