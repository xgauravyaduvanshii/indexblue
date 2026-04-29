import test from 'node:test';
import assert from 'node:assert/strict';

const {
  getPreviewTunnelBroker,
} = (await import(new URL('../../lib/cloud/preview-tunnel-broker.ts', import.meta.url).href)) as typeof import('../../lib/cloud/preview-tunnel-broker');

function resetBroker() {
  const broker = getPreviewTunnelBroker();
  broker.sessions.clear();
  broker.browserSubscribers.clear();
  broker.agentSubscribers.clear();
  broker.pendingBrowserEvents.clear();
  broker.pendingAgentEvents.clear();
  return broker;
}

test('preview tunnel broker queues agent open events until an agent subscriber connects', () => {
  const broker = resetBroker();
  const session = broker.createSession({
    infraId: 'infra-123',
    port: 3000,
    protocol: 'ws',
    pathname: '/hmr',
    search: '?token=abc',
  });

  const events: Array<{ type: string; sessionId: string; port?: number }> = [];
  const unsubscribe = broker.subscribeAgent(
    'infra-123',
    (event) => {
      events.push(event);
    },
    () => undefined,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'open');
  assert.equal(events[0]?.sessionId, session.id);
  assert.equal(events[0]?.port, 3000);

  unsubscribe();
});

test('preview tunnel broker forwards agent open and message events to browser subscribers', () => {
  const broker = resetBroker();
  const session = broker.createSession({
    infraId: 'infra-456',
    port: 5173,
    protocol: 'ws',
    pathname: '/vite-hmr',
    search: '',
  });

  const browserEvents: Array<{ type: string; sessionId: string; data?: string; protocol?: string }> = [];
  const unsubscribeBrowser = broker.subscribeBrowser(
    session.id,
    (event) => {
      browserEvents.push(event);
    },
    () => undefined,
  );

  broker.openFromAgent({
    sessionId: session.id,
    protocol: 'vite-hmr',
  });
  broker.receiveAgentMessage({
    sessionId: session.id,
    data: '{"type":"connected"}',
    isBinary: false,
  });

  assert.equal(browserEvents[0]?.type, 'open');
  assert.equal(browserEvents[0]?.protocol, 'vite-hmr');
  assert.equal(browserEvents[1]?.type, 'message');
  assert.equal(browserEvents[1]?.data, '{"type":"connected"}');

  unsubscribeBrowser();
});

test('preview tunnel broker exposes infra diagnostics for active and recently closed sessions', () => {
  const broker = resetBroker();
  const session = broker.createSession({
    infraId: 'infra-diag',
    port: 3000,
    protocol: 'ws',
    pathname: '/hmr',
    search: '',
  });

  broker.openFromAgent({
    sessionId: session.id,
    protocol: 'vite-hmr',
  });
  broker.receiveBrowserMessage({
    sessionId: session.id,
    data: 'ping',
    isBinary: false,
  });
  broker.receiveAgentMessage({
    sessionId: session.id,
    data: '{"type":"connected"}',
    isBinary: false,
  });

  const activeDiagnostics = broker.getInfraDiagnostics('infra-diag');
  assert.equal(activeDiagnostics.activeSessionCount, 1);
  assert.equal(activeDiagnostics.openSessionCount, 1);
  assert.equal(activeDiagnostics.lastSession?.sessionId, session.id);
  assert.equal(activeDiagnostics.lastSession?.browserMessageCount, 1);
  assert.equal(activeDiagnostics.lastSession?.agentMessageCount, 1);
  assert.equal(activeDiagnostics.lastSession?.negotiatedProtocol, 'vite-hmr');

  broker.closeFromAgent({
    sessionId: session.id,
    code: 1000,
    reason: 'Normal close',
  });

  const closedDiagnostics = broker.getInfraDiagnostics('infra-diag');
  assert.equal(closedDiagnostics.activeSessionCount, 0);
  assert.equal(closedDiagnostics.recentSessions.length, 1);
  assert.equal(closedDiagnostics.lastSession?.lastCloseCode, 1000);
  assert.equal(closedDiagnostics.lastSession?.lastCloseReason, 'Normal close');
});
