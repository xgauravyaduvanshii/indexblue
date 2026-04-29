import test from 'node:test';
import assert from 'node:assert/strict';

import {
  expandHomeDirectory,
  normalizeWorkingDirectory,
  resolveWorkingDirectoryInput,
} from '../src/lib/workspace.js';

test('expandHomeDirectory resolves bare and nested home paths', () => {
  assert.equal(expandHomeDirectory('~', '/home/demo'), '/home/demo');
  assert.equal(expandHomeDirectory('~/workspace', '/home/demo'), '/home/demo/workspace');
  assert.equal(expandHomeDirectory('/var/tmp', '/home/demo'), '/var/tmp');
});

test('resolveWorkingDirectoryInput handles relative and parent navigation', () => {
  assert.equal(
    resolveWorkingDirectoryInput('..', {
      baseDirectory: '/srv/projects/indexblue/indexcli',
      homedir: '/home/demo',
    }),
    '/srv/projects/indexblue',
  );

  assert.equal(
    resolveWorkingDirectoryInput('logs', {
      baseDirectory: '/srv/projects/indexblue',
      homedir: '/home/demo',
    }),
    '/srv/projects/indexblue/logs',
  );
});

test('normalizeWorkingDirectory trims empty values to null', () => {
  assert.equal(normalizeWorkingDirectory('  /tmp/work  '), '/tmp/work');
  assert.equal(normalizeWorkingDirectory('   '), null);
  assert.equal(normalizeWorkingDirectory(null), null);
});
