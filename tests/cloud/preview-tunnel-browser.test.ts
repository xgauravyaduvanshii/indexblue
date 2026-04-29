import test from 'node:test';
import assert from 'node:assert/strict';

const {
  buildPreviewTunnelBootstrapPath,
  injectPreviewTunnelBootstrap,
} = (await import(new URL('../../lib/cloud/preview-tunnel-browser.ts', import.meta.url).href)) as typeof import('../../lib/cloud/preview-tunnel-browser');

test('buildPreviewTunnelBootstrapPath encodes the preview machine and port', () => {
  assert.equal(
    buildPreviewTunnelBootstrapPath({
      infraId: 'infra-123',
      port: 4173,
    }),
    '/api/cloud/preview-tunnel/bootstrap?infraId=infra-123&port=4173',
  );
});

test('injectPreviewTunnelBootstrap inserts the tunnel script before </head>', () => {
  const html = '<html><head><title>Preview</title></head><body>Hello</body></html>';
  const injected = injectPreviewTunnelBootstrap(html, {
    infraId: 'infra-123',
    port: 3000,
  });

  assert.match(injected, /data-indexblue-preview-tunnel="true"/);
  assert.match(injected, /<script src="\/api\/cloud\/preview-tunnel\/bootstrap\?infraId=infra-123&amp;port=3000"/);
  assert.ok(injected.indexOf('data-indexblue-preview-tunnel') < injected.indexOf('</head>'));
});

test('injectPreviewTunnelBootstrap does not inject the script twice', () => {
  const html = '<html><head></head><body>Once</body></html>';
  const once = injectPreviewTunnelBootstrap(html, {
    infraId: 'infra-123',
    port: 3000,
  });
  const twice = injectPreviewTunnelBootstrap(once, {
    infraId: 'infra-123',
    port: 3000,
  });

  const matches = twice.match(/data-indexblue-preview-tunnel="true"/g) || [];
  assert.equal(matches.length, 1);
});
