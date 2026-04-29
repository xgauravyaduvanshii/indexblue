import test from 'node:test';
import assert from 'node:assert/strict';

const {
  createPlatformApiKey,
  generatePlatformDeviceCode,
  hashPlatformApiKey,
  verifyPlatformApiKey,
} = (await import(new URL('../../lib/cloud/api-keys.ts', import.meta.url).href)) as typeof import('../../lib/cloud/api-keys');

test('createPlatformApiKey returns a reusable key bundle with stable prefixes', () => {
  const created = createPlatformApiKey({ label: 'CLI Laptop' });

  assert.match(created.plaintextKey, /^ib_live_[a-z0-9]{12}\.[a-zA-Z0-9_-]{43}$/);
  assert.equal(created.label, 'CLI Laptop');
  assert.equal(created.keyPrefix, created.plaintextKey.slice(0, 18));
  assert.equal(created.tokenId.length, 12);
  assert.equal(created.hash, hashPlatformApiKey(created.plaintextKey));
});

test('verifyPlatformApiKey accepts the original key and rejects tampering', () => {
  const created = createPlatformApiKey({ label: 'Build Agent' });

  assert.equal(verifyPlatformApiKey(created.plaintextKey, created.hash), true);
  assert.equal(verifyPlatformApiKey(`${created.plaintextKey}x`, created.hash), false);
});

test('generatePlatformDeviceCode creates uppercase pairing codes without ambiguous separators', () => {
  const code = generatePlatformDeviceCode();

  assert.match(code, /^[A-Z0-9]{8}$/);
  assert.equal(code.includes('-'), false);
});
