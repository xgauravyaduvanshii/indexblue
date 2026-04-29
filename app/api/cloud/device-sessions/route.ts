import { z } from 'zod';
import { createPlatformDeviceSession, expireStalePlatformDeviceSessions } from '@/lib/db/cloud-infra-queries';
import { generatePlatformDeviceCode } from '@/lib/cloud/api-keys';

export const runtime = 'nodejs';

const createDeviceSessionSchema = z.object({
  requestedLabel: z.string().trim().min(1).max(80).optional(),
});

function getBaseUrl() {
  return (process.env.BETTER_AUTH_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );
}

export async function POST(request: Request) {
  await expireStalePlatformDeviceSessions();

  const parsed = createDeviceSessionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid device-session payload.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const session = await createPlatformDeviceSession({
    code: generatePlatformDeviceCode(),
    requestedLabel: parsed.data.requestedLabel ?? 'Index CLI',
    expiresAt,
  });

  if (!session) {
    return Response.json({ error: 'Failed to create device session.' }, { status: 500 });
  }

  const baseUrl = getBaseUrl();

  return Response.json({
    sessionId: session.id,
    code: session.code,
    status: session.status,
    requestedLabel: session.requestedLabel,
    expiresAt: session.expiresAt.toISOString(),
    verificationUrl: `${baseUrl}/cloud-infrastructure/device/${session.code}`,
    claimUrl: `${baseUrl}/api/cloud/device-sessions/${session.id}/claim`,
    pollIntervalMs: 3000,
  });
}
