import test from 'node:test';
import assert from 'node:assert/strict';

import { buildShellExecutionCommand } from '../src/lib/system.js';

test('buildShellExecutionCommand bootstraps common user toolchains before the requested command', () => {
  const wrapped = buildShellExecutionCommand('npm install && npm run dev');

  assert.match(wrapped, /HOME\/\.nvm\/nvm\.sh/);
  assert.match(wrapped, /source "\$HOME\/\.profile"/);
  assert.match(wrapped, /source "\$HOME\/\.bashrc"/);
  assert.match(wrapped, /npm install && npm run dev/);
});
