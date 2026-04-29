import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const PLATFORM_API_KEY_PATTERN = /^ib_live_([a-z0-9]{12})\.([a-zA-Z0-9_-]{43})$/;
const DEVICE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type CreatedPlatformApiKey = {
  label: string;
  tokenId: string;
  keyPrefix: string;
  plaintextKey: string;
  hash: string;
};

export function hashPlatformApiKey(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function verifyPlatformApiKey(candidate: string, expectedHash: string) {
  const candidateBuffer = Buffer.from(hashPlatformApiKey(candidate), 'utf8');
  const expectedBuffer = Buffer.from(expectedHash, 'utf8');

  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

export function parsePlatformApiKey(value: string) {
  const match = PLATFORM_API_KEY_PATTERN.exec(value.trim());
  if (!match) return null;

  return {
    tokenId: match[1],
    secret: match[2],
    keyPrefix: value.trim().slice(0, 18),
  };
}

export function createPlatformApiKey({ label }: { label: string }): CreatedPlatformApiKey {
  const tokenId = randomBytes(6).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  const plaintextKey = `ib_live_${tokenId}.${secret}`;

  return {
    label,
    tokenId,
    keyPrefix: plaintextKey.slice(0, 18),
    plaintextKey,
    hash: hashPlatformApiKey(plaintextKey),
  };
}

export function generatePlatformDeviceCode(length = 8) {
  const bytes = randomBytes(length);
  let code = '';

  for (let index = 0; index < length; index += 1) {
    code += DEVICE_CODE_ALPHABET[bytes[index] % DEVICE_CODE_ALPHABET.length];
  }

  return code;
}
