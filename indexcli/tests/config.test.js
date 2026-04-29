import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decryptStoredSecret,
  encryptStoredSecret,
  normalizeApiBaseUrl,
  resolveConfigPaths,
} from '../src/lib/config.js';

const machineContext = {
  username: 'builder-user',
  homedir: '/home/builder-user',
  hostname: 'builder-host',
  platform: 'linux',
};

test('normalizeApiBaseUrl strips trailing slashes and keeps the origin stable', () => {
  assert.equal(normalizeApiBaseUrl('https://indexblue.ai////'), 'https://indexblue.ai');
  assert.equal(normalizeApiBaseUrl('https://indexblue.ai/cloud'), 'https://indexblue.ai/cloud');
});

test('encryptStoredSecret round-trips using a deterministic machine context', () => {
  const encrypted = encryptStoredSecret('ib_live_secret', machineContext);

  assert.notEqual(encrypted, 'ib_live_secret');
  assert.equal(decryptStoredSecret(encrypted, machineContext), 'ib_live_secret');
});

test('resolveConfigPaths nests config and state inside the provided home directory', () => {
  const paths = resolveConfigPaths({ homedir: '/tmp/indexcli-home', platform: 'linux' });

  assert.equal(paths.configDir, '/tmp/indexcli-home/.config/indexcli');
  assert.equal(paths.stateDir, '/tmp/indexcli-home/.local/state/indexcli');
  assert.equal(paths.configFile, '/tmp/indexcli-home/.config/indexcli/config.json');
  assert.equal(paths.sandboxFile, '/tmp/indexcli-home/.local/state/indexcli/sandboxes.json');
});
