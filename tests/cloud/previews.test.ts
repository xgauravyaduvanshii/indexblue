import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BETTER_AUTH_BASE_URL = 'https://indexblue.ai';

const {
  buildCloudPreviewLinks,
  buildPreviewDnsRecords,
  parseCloudPreviewHost,
  resolvePreviewDnsTarget,
  resolvePreviewDnsTargetHost,
  sanitizePreviewDomainBase,
} = (await import(new URL('../../lib/cloud/previews.ts', import.meta.url).href)) as typeof import('../../lib/cloud/previews');

test('buildCloudPreviewLinks prefers preview subdomains when a domain base is provided', () => {
  process.env.BETTER_AUTH_BASE_URL = 'https://indexblue.ai';

  const links = buildCloudPreviewLinks({
    infraId: 'infra-123',
    port: 3000,
    domainBase: 'dev.example.com',
  });

  assert.equal(links.host, '3000--infra-123.dev.example.com');
  assert.equal(links.url, 'https://3000--infra-123.dev.example.com/');
  assert.equal(links.pathUrl, 'https://indexblue.ai/cloud-preview/infra-123/3000');
});

test('buildCloudPreviewLinks preserves the app gateway protocol and port for custom preview domains', () => {
  process.env.BETTER_AUTH_BASE_URL = 'http://13.60.98.189:3000';

  const links = buildCloudPreviewLinks({
    infraId: 'infra-123',
    port: 3000,
    domainBase: 'preview.groovicart.com',
  });

  assert.equal(links.host, '3000--infra-123.preview.groovicart.com');
  assert.equal(links.url, 'http://3000--infra-123.preview.groovicart.com:3000/');
  assert.equal(links.hostUrl, 'http://3000--infra-123.preview.groovicart.com:3000/');
});

test('parseCloudPreviewHost extracts infra id and port from encoded preview hosts', () => {
  const parsed = parseCloudPreviewHost('4173--infra-abc.preview.example.com');

  assert.deepEqual(parsed, {
    port: 4173,
    infraId: 'infra-abc',
    host: '4173--infra-abc.preview.example.com',
  });
});

test('buildPreviewDnsRecords returns a wildcard CNAME for domain-backed app hosts', () => {
  process.env.BETTER_AUTH_BASE_URL = 'https://indexblue.ai';

  const records = buildPreviewDnsRecords('dev.example.com');

  assert.deepEqual(records, [
    {
      status: 'ready',
      note: null,
      description: 'Wildcard preview routing',
      targetHost: 'indexblue.ai',
      type: 'CNAME',
      name: '*.dev.example.com',
      value: 'indexblue.ai',
    },
  ]);
});

test('buildPreviewDnsRecords returns a placeholder record when the public host is unavailable', () => {
  const records = buildPreviewDnsRecords('preview.example.com', {
    targetHost: null,
  });

  assert.deepEqual(records, [
    {
      status: 'needs-public-host',
      note: 'Set BETTER_AUTH_BASE_URL, NEXT_PUBLIC_APP_URL, or CLOUD_PREVIEW_TARGET_HOST to a public hostname before using custom preview DNS.',
      description: 'Wildcard preview routing',
      targetHost: null,
      type: 'CNAME',
      name: '*.preview.example.com',
      value: 'your-public-indexblue-host.example.com',
    },
  ]);
});

test('buildPreviewDnsRecords returns a wildcard A record when the target is a public IP', () => {
  const records = buildPreviewDnsRecords('preview.example.com', {
    targetHost: '13.60.98.189',
  });

  assert.deepEqual(records, [
    {
      status: 'ready',
      note: null,
      description: 'Wildcard preview routing',
      targetHost: '13.60.98.189',
      type: 'A',
      name: '*.preview.example.com',
      value: '13.60.98.189',
    },
  ]);
});

test('resolvePreviewDnsTargetHost prefers a forwarded request host when the app origin is local-only', () => {
  process.env.BETTER_AUTH_BASE_URL = 'http://localhost:3000';

  const host = resolvePreviewDnsTargetHost({
    requestHost: 'app.indexblue.ai:3000',
  });

  assert.equal(host, 'app.indexblue.ai');
});

test('resolvePreviewDnsTargetHost falls back to null when both app and request hosts are local', () => {
  process.env.BETTER_AUTH_BASE_URL = 'http://localhost:3000';

  const host = resolvePreviewDnsTargetHost({
    requestHost: 'localhost:3000',
  });

  assert.equal(host, null);
});

test('resolvePreviewDnsTarget falls back to the connected machine public ip when platform hosts are local', () => {
  process.env.BETTER_AUTH_BASE_URL = 'http://localhost:3000';

  const target = resolvePreviewDnsTarget({
    requestHost: 'localhost:3000',
    fallbackHost: '13.60.98.189',
  });

  assert.deepEqual(target, {
    host: '13.60.98.189',
    source: 'machine-public-ip',
  });
});

test('resolvePreviewDnsTargetHost restores the default origin for following tests', () => {
  process.env.BETTER_AUTH_BASE_URL = 'https://indexblue.ai';

  const records = buildPreviewDnsRecords('dev.example.com');

  assert.deepEqual(records, [
    {
      status: 'ready',
      note: null,
      description: 'Wildcard preview routing',
      targetHost: 'indexblue.ai',
      type: 'CNAME',
      name: '*.dev.example.com',
      value: 'indexblue.ai',
    },
  ]);
});

test('sanitizePreviewDomainBase strips protocols and paths', () => {
  assert.equal(sanitizePreviewDomainBase('https://Dev.Example.com/foo/bar'), 'dev.example.com');
});
