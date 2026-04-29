import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(secret: string) {
  return createHash('sha256').update(secret, 'utf8').digest();
}

function encryptValue(value: string, secret: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptValue(value: string, secret: string) {
  const [ivBase64, authTagBase64, encryptedBase64] = value.split(':');
  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error('Invalid encrypted payload format.');
  }

  const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function prepareCloudInfraCommandPayloadForStorage(
  type: string,
  payload: Record<string, unknown>,
  secret: string,
): Record<string, unknown> {
  if (type !== 'sudo:configure') {
    return payload;
  }

  const password = typeof payload.password === 'string' ? payload.password : null;
  const next = {
    ...payload,
    password: undefined,
    encryptedPassword: password ? encryptValue(password, secret) : undefined,
  };

  return next;
}

export function prepareCloudInfraCommandPayloadForAgent(
  type: string,
  payload: Record<string, unknown>,
  secret: string,
): Record<string, unknown> {
  if (type !== 'sudo:configure') {
    return payload;
  }

  const encryptedPassword = typeof payload.encryptedPassword === 'string' ? payload.encryptedPassword : null;

  return {
    ...payload,
    encryptedPassword: undefined,
    password: encryptedPassword ? decryptValue(encryptedPassword, secret) : undefined,
  };
}

export function redactCloudInfraCommandPayloadForClient(
  type: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (type !== 'sudo:configure') {
    return payload;
  }

  const hasStoredSecret =
    typeof payload.encryptedPassword === 'string' ||
    payload.clearStoredPassword === false ||
    payload.rememberPassword === true;

  return {
    ...payload,
    password: undefined,
    encryptedPassword: undefined,
    hasStoredSecret,
  };
}
