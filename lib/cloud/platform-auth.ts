import 'server-only';

import { getPlatformApiKeyByTokenId, touchPlatformApiKeyLastUsed } from '@/lib/db/cloud-infra-queries';
import { parsePlatformApiKey, verifyPlatformApiKey } from '@/lib/cloud/api-keys';

function extractPlatformApiKey(headers: Headers) {
  const authorization = headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  const headerValue = headers.get('x-indexblue-key');
  return headerValue?.trim() || null;
}

export async function authenticatePlatformApiKey(headers: Headers) {
  const rawKey = extractPlatformApiKey(headers);
  if (!rawKey) {
    return null;
  }

  const parsed = parsePlatformApiKey(rawKey);
  if (!parsed) {
    return null;
  }

  const record = await getPlatformApiKeyByTokenId(parsed.tokenId);
  if (!record || record.status !== 'active' || record.revokedAt) {
    return null;
  }

  if (!verifyPlatformApiKey(rawKey, record.keyHash)) {
    return null;
  }

  await touchPlatformApiKeyLastUsed(record.id).catch(() => undefined);

  return {
    apiKey: record,
    userId: record.userId,
    rawKey,
  };
}

export async function requirePlatformApiKey(request: Request) {
  const authenticated = await authenticatePlatformApiKey(request.headers);

  if (!authenticated) {
    return {
      status: 401 as const,
      response: Response.json({ error: 'Invalid or missing platform API key.' }, { status: 401 }),
    };
  }

  return {
    status: 200 as const,
    ...authenticated,
  };
}
