import test from 'node:test';
import assert from 'node:assert/strict';

import { getStoredSudoPassword, setStoredSudoPassword } from '../src/lib/state.js';

const machineContext = {
  username: 'builder-user',
  homedir: '/home/builder-user',
  hostname: 'builder-host',
  platform: 'linux',
};

test('setStoredSudoPassword encrypts the local sudo secret and getStoredSudoPassword decrypts it', () => {
  const config = {
    encryptedSudoPassword: null,
  };

  const next = setStoredSudoPassword(config, 'sudo-pass-123', machineContext);

  assert.notEqual(next.encryptedSudoPassword, 'sudo-pass-123');
  assert.equal(getStoredSudoPassword(next, machineContext), 'sudo-pass-123');
});

test('setStoredSudoPassword clears the stored value when given an empty password', () => {
  const config = {
    encryptedSudoPassword: 'present',
  };

  const next = setStoredSudoPassword(config, '', machineContext);

  assert.equal(next.encryptedSudoPassword, null);
  assert.equal(getStoredSudoPassword(next, machineContext), null);
});
