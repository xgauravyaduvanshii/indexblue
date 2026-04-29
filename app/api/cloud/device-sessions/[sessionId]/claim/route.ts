import { decryptBuilderSecret } from '@/lib/builder/secrets';
import {
  expireStalePlatformDeviceSessions,
  getPlatformDeviceSessionById,
  updatePlatformDeviceSession,
} from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  await expireStalePlatformDeviceSessions();

  const { sessionId } = await params;
  const session = await getPlatformDeviceSessionById(sessionId);

  if (!session) {
    return Response.json({ error: 'Device session not found.' }, { status: 404 });
  }

  if (session.status === 'approved' && session.encryptedApiKey) {
    const plaintextKey = decryptBuilderSecret(session.encryptedApiKey);
    await updatePlatformDeviceSession({
      sessionId,
      status: 'claimed',
      claimedAt: new Date(),
      encryptedApiKey: null,
    });

    return Response.json({
      status: 'approved',
      apiKey: plaintextKey,
      apiKeyId: session.apiKeyId,
    });
  }

  return Response.json({
    status: session.status,
    expiresAt: session.expiresAt.toISOString(),
  });
}
