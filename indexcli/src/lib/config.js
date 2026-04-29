import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getMachineContext(overrides = {}) {
  return {
    username: overrides.username ?? os.userInfo().username,
    homedir: overrides.homedir ?? os.homedir(),
    hostname: overrides.hostname ?? os.hostname(),
    platform: overrides.platform ?? os.platform(),
  };
}

function deriveMachineKey(machineContext = {}) {
  const resolved = getMachineContext(machineContext);
  return createHash('sha256')
    .update(
      [resolved.username, resolved.homedir, resolved.hostname, resolved.platform].map((value) => value ?? '').join(':'),
      'utf8',
    )
    .digest();
}

export function normalizeApiBaseUrl(value) {
  const normalized = typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'http://13.60.98.189:3000';
  return normalized.replace(/\/+$/, '');
}

export function resolveConfigPaths({ homedir = os.homedir(), platform = os.platform() } = {}) {
  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
    const localData = process.env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
    return {
      configDir: path.join(appData, 'indexcli'),
      stateDir: path.join(localData, 'indexcli'),
      configFile: path.join(appData, 'indexcli', 'config.json'),
      sandboxFile: path.join(localData, 'indexcli', 'sandboxes.json'),
    };
  }

  if (platform === 'darwin') {
    return {
      configDir: path.join(homedir, 'Library', 'Application Support', 'indexcli'),
      stateDir: path.join(homedir, 'Library', 'Application Support', 'indexcli'),
      configFile: path.join(homedir, 'Library', 'Application Support', 'indexcli', 'config.json'),
      sandboxFile: path.join(homedir, 'Library', 'Application Support', 'indexcli', 'sandboxes.json'),
    };
  }

  return {
    configDir: path.join(homedir, '.config', 'indexcli'),
    stateDir: path.join(homedir, '.local', 'state', 'indexcli'),
    configFile: path.join(homedir, '.config', 'indexcli', 'config.json'),
    sandboxFile: path.join(homedir, '.local', 'state', 'indexcli', 'sandboxes.json'),
  };
}

export function encryptStoredSecret(value, machineContext = {}) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveMachineKey(machineContext), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptStoredSecret(value, machineContext = {}) {
  const [ivBase64, authTagBase64, encryptedBase64] = value.split(':');
  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error('Invalid encrypted secret format.');
  }

  const decipher = createDecipheriv(ALGORITHM, deriveMachineKey(machineContext), Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export async function ensureConfigDirectories(paths) {
  await mkdir(paths.configDir, { recursive: true });
  await mkdir(paths.stateDir, { recursive: true });
}

export async function readJsonFile(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonFile(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
}
