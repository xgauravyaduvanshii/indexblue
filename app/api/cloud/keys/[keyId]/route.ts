import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createPlatformApiKey } from '@/lib/cloud/api-keys';
import {
  createPlatformApiKeyRecord,
  getPlatformApiKeyByIdForUser,
  updatePlatformApiKeyStatus,
} from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

const regenerateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
});

export async function DELETE(request: Request, { params }: { params: Promise<{ keyId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { keyId } = await params;
  const record = await updatePlatformApiKeyStatus({
    keyId,
    userId: session.user.id,
    status: 'revoked',
  });

  if (!record) {
    return Response.json({ error: 'API key not found.' }, { status: 404 });
  }

  return Response.json({
    apiKey: {
      id: record.id,
      status: record.status,
      revokedAt: record.revokedAt?.toISOString() ?? null,
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ keyId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = regenerateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid regenerate payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { keyId } = await params;
  const existing = await getPlatformApiKeyByIdForUser({
    keyId,
    userId: session.user.id,
  });

  if (!existing) {
    return Response.json({ error: 'API key not found.' }, { status: 404 });
  }

  await updatePlatformApiKeyStatus({
    keyId,
    userId: session.user.id,
    status: 'revoked',
  });

  const created = createPlatformApiKey({
    label: parsed.data.label ?? existing.label,
  });
  const record = await createPlatformApiKeyRecord({
    userId: session.user.id,
    label: created.label,
    tokenId: created.tokenId,
    keyPrefix: created.keyPrefix,
    keyHash: created.hash,
  });

  if (!record) {
    return Response.json({ error: 'Failed to regenerate API key.' }, { status: 500 });
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
