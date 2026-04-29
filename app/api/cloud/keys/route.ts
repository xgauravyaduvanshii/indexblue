import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createPlatformApiKey } from '@/lib/cloud/api-keys';
import { createPlatformApiKeyRecord, listPlatformApiKeysByUserId } from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

const createKeySchema = z.object({
  label: z.string().trim().min(1).max(80).default('Index CLI'),
});

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const records = await listPlatformApiKeysByUserId(session.user.id);

  return Response.json({
    apiKeys: records.map((record) => ({
      id: record.id,
      label: record.label,
      tokenId: record.tokenId,
      keyPrefix: record.keyPrefix,
      status: record.status,
      lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
      revokedAt: record.revokedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = createKeySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid API key payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const created = createPlatformApiKey({ label: parsed.data.label });
  const record = await createPlatformApiKeyRecord({
    userId: session.user.id,
    label: created.label,
    tokenId: created.tokenId,
    keyPrefix: created.keyPrefix,
    keyHash: created.hash,
  });

  if (!record) {
    return Response.json({ error: 'Failed to create API key.' }, { status: 500 });
  }

  return Response.json({
    apiKey: {
      id: record.id,
      label: record.label,
      tokenId: record.tokenId,
      keyPrefix: record.keyPrefix,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      plaintextKey: created.plaintextKey,
    },
  });
}
