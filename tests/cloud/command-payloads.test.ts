import test from 'node:test';
import assert from 'node:assert/strict';

const {
  prepareCloudInfraCommandPayloadForAgent,
  prepareCloudInfraCommandPayloadForStorage,
  redactCloudInfraCommandPayloadForClient,
} = (await import(new URL('../../lib/cloud/command-payloads.ts', import.meta.url).href)) as typeof import('../../lib/cloud/command-payloads');

const secret = 'test-better-auth-secret';

test('prepareCloudInfraCommandPayloadForStorage seals sudo passwords before persistence', () => {
  const payload = prepareCloudInfraCommandPayloadForStorage(
    'sudo:configure',
    {
      password: 'super-secret',
      rememberPassword: true,
      clearStoredPassword: false,
    },
    secret,
  );

  assert.equal(typeof payload.encryptedPassword, 'string');
  assert.equal(payload.password, undefined);
  assert.equal(payload.rememberPassword, true);
});

test('prepareCloudInfraCommandPayloadForAgent restores the sealed sudo password for the agent only', () => {
  const stored = prepareCloudInfraCommandPayloadForStorage(
    'sudo:configure',
    {
      password: 'super-secret',
      rememberPassword: true,
    },
    secret,
  );

  const agentPayload = prepareCloudInfraCommandPayloadForAgent('sudo:configure', stored, secret);

  assert.equal(agentPayload.password, 'super-secret');
  assert.equal(agentPayload.encryptedPassword, undefined);
});

test('redactCloudInfraCommandPayloadForClient hides both plaintext and sealed sudo password values', () => {
  const stored = prepareCloudInfraCommandPayloadForStorage(
    'sudo:configure',
    {
      password: 'super-secret',
      rememberPassword: true,
      clearStoredPassword: false,
    },
    secret,
  );

  const redacted = redactCloudInfraCommandPayloadForClient('sudo:configure', stored);

  assert.equal(redacted.password, undefined);
  assert.equal(redacted.encryptedPassword, undefined);
  assert.equal(redacted.hasStoredSecret, true);
  assert.equal(redacted.rememberPassword, true);
});
