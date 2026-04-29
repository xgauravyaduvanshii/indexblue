import { auth } from '@/lib/auth';
import { encryptBuilderSecret } from '@/lib/builder/secrets';
import { createPlatformApiKey } from '@/lib/cloud/api-keys';
import {
  createPlatformApiKeyRecord,
  expireStalePlatformDeviceSessions,
  getPlatformDeviceSessionByCode,
  updatePlatformDeviceSession,
} from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await expireStalePlatformDeviceSessions();

  const { code } = await params;
  const deviceSession = await getPlatformDeviceSessionByCode(code);

  if (!deviceSession) {
    return Response.json({ error: 'Device session not found.' }, { status: 404 });
  }

  if (deviceSession.status === 'approved' || deviceSession.status === 'claimed') {
    return Response.json({
      status: deviceSession.status,
      apiKeyId: deviceSession.apiKeyId,
    });
  }

  if (deviceSession.status !== 'pending' || deviceSession.expiresAt.getTime() < Date.now()) {
    return Response.json({ error: 'Device session has expired.' }, { status: 410 });
  }

  const created = createPlatformApiKey({
    label: deviceSession.requestedLabel?.trim() || 'Index CLI',
  });
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

  await updatePlatformDeviceSession({
    sessionId: deviceSession.id,
    status: 'approved',
    userId: session.user.id,
    apiKeyId: record.id,
    encryptedApiKey: encryptBuilderSecret(created.plaintextKey),
    approvedAt: new Date(),
  });

  return Response.json({
    status: 'approved',
    code: deviceSession.code,
    apiKeyId: record.id,
    keyPrefix: record.keyPrefix,
  });
}
