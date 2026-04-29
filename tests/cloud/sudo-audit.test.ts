import test from 'node:test';
import assert from 'node:assert/strict';

const { buildSudoAuditEntries } = (await import(
  new URL('../../lib/cloud/sudo-audit.ts', import.meta.url).href
)) as typeof import('../../lib/cloud/sudo-audit');

test('buildSudoAuditEntries summarizes stored-password sudo commands', () => {
  const [entry] = buildSudoAuditEntries([
    {
      id: 'cmd-store',
      type: 'sudo:configure',
      status: 'completed',
      payload: {
        rememberPassword: true,
      },
      errorMessage: null,
      createdAt: '2026-04-29T12:00:00.000Z',
      startedAt: '2026-04-29T12:00:01.000Z',
      completedAt: '2026-04-29T12:00:02.000Z',
    },
  ]);

  assert.equal(entry?.action, 'store-password');
  assert.equal(entry?.title, 'Saved sudo password for reuse');
});

test('buildSudoAuditEntries summarizes cleared-password sudo commands', () => {
  const [entry] = buildSudoAuditEntries([
    {
      id: 'cmd-clear',
      type: 'sudo:configure',
      status: 'completed',
      payload: {
        clearStoredPassword: true,
      },
      errorMessage: null,
      createdAt: '2026-04-29T12:05:00.000Z',
      startedAt: null,
      completedAt: '2026-04-29T12:05:02.000Z',
    },
  ]);

  assert.equal(entry?.action, 'clear-password');
  assert.equal(entry?.title, 'Cleared stored sudo password');
});

test('buildSudoAuditEntries retains blocked force-passwordless requests for audit visibility', () => {
  const [entry] = buildSudoAuditEntries([
    {
      id: 'cmd-force',
      type: 'sudo:configure',
      status: 'failed',
      payload: {
        forcePasswordless: true,
      },
      errorMessage: 'Force passwordless sudo is not supported through IndexBlue for host safety.',
      createdAt: '2026-04-29T12:10:00.000Z',
      startedAt: null,
      completedAt: null,
    },
  ]);

  assert.equal(entry?.action, 'force-passwordless-request');
  assert.match(entry?.detail ?? '', /passwordless sudo/i);
  assert.match(entry?.errorMessage ?? '', /host safety/i);
});

test('buildSudoAuditEntries ignores unrelated command types', () => {
  const entries = buildSudoAuditEntries([
    {
      id: 'cmd-exec',
      type: 'exec',
      status: 'completed',
      payload: {
        command: 'pwd',
      },
      errorMessage: null,
      createdAt: '2026-04-29T12:15:00.000Z',
      startedAt: null,
      completedAt: null,
    },
  ]);

  assert.deepEqual(entries, []);
});
