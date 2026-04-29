import { randomUUID } from 'node:crypto';

type PreviewTunnelAgentEvent =
  | {
      id: string;
      type: 'open';
      sessionId: string;
      port: number;
      protocol: 'ws' | 'wss';
      pathname: string;
      search: string;
      headers: Record<string, string>;
      protocols: string[];
    }
  | {
      id: string;
      type: 'client-message';
      sessionId: string;
      data: string;
      isBinary: boolean;
    }
  | {
      id: string;
      type: 'close';
      sessionId: string;
      code?: number;
      reason?: string;
    };

type PreviewTunnelBrowserEvent =
  | {
      id: string;
      type: 'open';
      sessionId: string;
      protocol?: string;
    }
  | {
      id: string;
      type: 'message';
      sessionId: string;
      data: string;
      isBinary: boolean;
    }
  | {
      id: string;
      type: 'close';
      sessionId: string;
      code?: number;
      reason?: string;
    }
  | {
      id: string;
      type: 'error';
      sessionId: string;
      message: string;
    };

type PreviewTunnelSessionRecord = {
  id: string;
  infraId: string;
  port: number;
  protocol: 'ws' | 'wss';
  pathname: string;
  search: string;
  headers: Record<string, string>;
  protocols: string[];
  createdAt: number;
  lastSeenAt: number;
  state: 'opening' | 'open' | 'closed';
};

type PreviewTunnelSessionDiagnostics = {
  sessionId: string;
  infraId: string;
  port: number;
  requestedProtocol: 'ws' | 'wss';
  negotiatedProtocol: string | null;
  pathname: string;
  search: string;
  state: 'opening' | 'open' | 'closed';
  createdAt: number;
  openedAt: number | null;
  lastActivityAt: number;
  lastBrowserMessageAt: number | null;
  lastAgentMessageAt: number | null;
  browserMessageCount: number;
  agentMessageCount: number;
  lastErrorAt: number | null;
  lastErrorMessage: string | null;
  lastCloseAt: number | null;
  lastCloseCode: number | null;
  lastCloseReason: string | null;
};

type ChannelSubscriber<T> = {
  id: string;
  push: (event: T) => void;
  close: () => void;
};

const SESSION_TTL_MS = 10 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 1000;
const MAX_RECENT_DIAGNOSTICS_PER_INFRA = 12;

class PreviewTunnelBroker {
  sessions = new Map<string, PreviewTunnelSessionRecord>();
  sessionDiagnostics = new Map<string, PreviewTunnelSessionDiagnostics>();
  recentSessionIdsByInfra = new Map<string, string[]>();
  browserSubscribers = new Map<string, Map<string, ChannelSubscriber<PreviewTunnelBrowserEvent>>>();
  agentSubscribers = new Map<string, Map<string, ChannelSubscriber<PreviewTunnelAgentEvent>>>();
  pendingBrowserEvents = new Map<string, PreviewTunnelBrowserEvent[]>();
  pendingAgentEvents = new Map<string, PreviewTunnelAgentEvent[]>();
  pruneTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.ensurePruneLoop();
  }

  private ensurePruneLoop() {
    if (this.pruneTimer) return;
    this.pruneTimer = setInterval(() => {
      this.pruneExpiredSessions();
    }, PRUNE_INTERVAL_MS);
    this.pruneTimer.unref?.();
  }

  private trackRecentSession(infraId: string, sessionId: string) {
    const current = this.recentSessionIdsByInfra.get(infraId) || [];
    const next = [sessionId, ...current.filter((value) => value !== sessionId)].slice(0, MAX_RECENT_DIAGNOSTICS_PER_INFRA);
    this.recentSessionIdsByInfra.set(infraId, next);

    const retained = new Set(next);
    for (const [candidateSessionId, diagnostics] of this.sessionDiagnostics.entries()) {
      if (diagnostics.infraId !== infraId) continue;
      if (this.sessions.has(candidateSessionId)) continue;
      if (retained.has(candidateSessionId)) continue;
      this.sessionDiagnostics.delete(candidateSessionId);
    }
  }

  private ensureSessionDiagnostics(session: PreviewTunnelSessionRecord) {
    const existing = this.sessionDiagnostics.get(session.id);
    if (existing) {
      return existing;
    }

    const diagnostics: PreviewTunnelSessionDiagnostics = {
      sessionId: session.id,
      infraId: session.infraId,
      port: session.port,
      requestedProtocol: session.protocol,
      negotiatedProtocol: null,
      pathname: session.pathname,
      search: session.search,
      state: session.state,
      createdAt: session.createdAt,
      openedAt: null,
      lastActivityAt: session.lastSeenAt,
      lastBrowserMessageAt: null,
      lastAgentMessageAt: null,
      browserMessageCount: 0,
      agentMessageCount: 0,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastCloseAt: null,
      lastCloseCode: null,
      lastCloseReason: null,
    };

    this.sessionDiagnostics.set(session.id, diagnostics);
    this.trackRecentSession(session.infraId, session.id);
    return diagnostics;
  }

  private updateSessionDiagnostics(
    sessionId: string,
    update: Partial<PreviewTunnelSessionDiagnostics> | ((current: PreviewTunnelSessionDiagnostics) => Partial<PreviewTunnelSessionDiagnostics>),
  ) {
    const session = this.sessions.get(sessionId);
    const fallback = this.sessionDiagnostics.get(sessionId);
    if (!session && !fallback) {
      return null;
    }

    const base = session ? this.ensureSessionDiagnostics(session) : fallback!;
    const patch = typeof update === 'function' ? update(base) : update;
    const next = {
      ...base,
      ...patch,
    };
    this.sessionDiagnostics.set(sessionId, next);
    this.trackRecentSession(next.infraId, sessionId);
    return next;
  }

  private publishToBrowser(sessionId: string, event: PreviewTunnelBrowserEvent) {
    const subscribers = this.browserSubscribers.get(sessionId);
    if (!subscribers || subscribers.size === 0) {
      const pending = this.pendingBrowserEvents.get(sessionId) || [];
      pending.push(event);
      this.pendingBrowserEvents.set(sessionId, pending);
      return;
    }

    for (const subscriber of subscribers.values()) {
      subscriber.push(event);
    }
  }

  private publishToAgent(infraId: string, event: PreviewTunnelAgentEvent) {
    const subscribers = this.agentSubscribers.get(infraId);
    if (!subscribers || subscribers.size === 0) {
      const pending = this.pendingAgentEvents.get(infraId) || [];
      pending.push(event);
      this.pendingAgentEvents.set(infraId, pending);
      return;
    }

    for (const subscriber of subscribers.values()) {
      subscriber.push(event);
    }
  }

  private subscribeChannel<T>(
    bucket: Map<string, Map<string, ChannelSubscriber<T>>>,
    key: string,
    push: (event: T) => void,
    close: () => void,
  ) {
    const subscriberId = randomUUID();
    const subscribers = bucket.get(key) || new Map<string, ChannelSubscriber<T>>();
    subscribers.set(subscriberId, {
      id: subscriberId,
      push,
      close,
    });
    bucket.set(key, subscribers);

    return () => {
      const current = bucket.get(key);
      if (!current) return;
      current.delete(subscriberId);
      if (current.size === 0) {
        bucket.delete(key);
      }
    };
  }

  private flushPendingBrowserEvents(sessionId: string, push: (event: PreviewTunnelBrowserEvent) => void) {
    const pending = this.pendingBrowserEvents.get(sessionId) || [];
    for (const event of pending) {
      push(event);
    }
    this.pendingBrowserEvents.delete(sessionId);
  }

  private flushPendingAgentEvents(infraId: string, push: (event: PreviewTunnelAgentEvent) => void) {
    const pending = this.pendingAgentEvents.get(infraId) || [];
    for (const event of pending) {
      push(event);
    }
    this.pendingAgentEvents.delete(infraId);
  }

  createSession({
    infraId,
    port,
    protocol,
    pathname,
    search,
    headers,
    protocols,
  }: {
    infraId: string;
    port: number;
    protocol: 'ws' | 'wss';
    pathname: string;
    search: string;
    headers?: Record<string, string>;
    protocols?: string[];
  }) {
    const sessionId = randomUUID();
    const session: PreviewTunnelSessionRecord = {
      id: sessionId,
      infraId,
      port,
      protocol,
      pathname,
      search,
      headers: headers || {},
      protocols: protocols || [],
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      state: 'opening',
    };

    this.sessions.set(sessionId, session);
    this.ensureSessionDiagnostics(session);
    this.publishToAgent(infraId, {
      id: randomUUID(),
      type: 'open',
      sessionId,
      port,
      protocol,
      pathname,
      search,
      headers: session.headers,
      protocols: session.protocols,
    });

    return session;
  }

  getSession(sessionId: string) {
    const session = this.sessions.get(sessionId) || null;
    if (session) {
      session.lastSeenAt = Date.now();
      this.updateSessionDiagnostics(sessionId, {
        lastActivityAt: session.lastSeenAt,
      });
    }
    return session;
  }

  subscribeBrowser(sessionId: string, push: (event: PreviewTunnelBrowserEvent) => void, close: () => void) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Preview tunnel session not found.');
    }

    const unsubscribe = this.subscribeChannel(this.browserSubscribers, sessionId, push, close);
    this.flushPendingBrowserEvents(sessionId, push);
    return unsubscribe;
  }

  subscribeAgent(infraId: string, push: (event: PreviewTunnelAgentEvent) => void, close: () => void) {
    const unsubscribe = this.subscribeChannel(this.agentSubscribers, infraId, push, close);
    this.flushPendingAgentEvents(infraId, push);
    return unsubscribe;
  }

  receiveBrowserMessage({
    sessionId,
    data,
    isBinary,
  }: {
    sessionId: string;
    data: string;
    isBinary: boolean;
  }) {
    const session = this.getSession(sessionId);
    if (!session || session.state === 'closed') {
      throw new Error('Preview tunnel session is closed.');
    }

    this.publishToAgent(session.infraId, {
      id: randomUUID(),
      type: 'client-message',
      sessionId,
      data,
      isBinary,
    });
    this.updateSessionDiagnostics(sessionId, (current) => ({
      lastActivityAt: Date.now(),
      lastBrowserMessageAt: Date.now(),
      browserMessageCount: current.browserMessageCount + 1,
    }));
  }

  closeFromBrowser({
    sessionId,
    code,
    reason,
  }: {
    sessionId: string;
    code?: number;
    reason?: string;
  }) {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.state = 'closed';
    const closedAt = Date.now();
    this.updateSessionDiagnostics(sessionId, {
      state: 'closed',
      lastActivityAt: closedAt,
      lastCloseAt: closedAt,
      lastCloseCode: code ?? null,
      lastCloseReason: reason ?? null,
    });
    this.publishToAgent(session.infraId, {
      id: randomUUID(),
      type: 'close',
      sessionId,
      code,
      reason,
    });
    this.publishToBrowser(sessionId, {
      id: randomUUID(),
      type: 'close',
      sessionId,
      code,
      reason,
    });
    this.disposeSession(sessionId);
  }

  openFromAgent({
    sessionId,
    protocol,
  }: {
    sessionId: string;
    protocol?: string;
  }) {
    const session = this.getSession(sessionId);
    if (!session) return;
    session.state = 'open';
    const openedAt = Date.now();
    this.updateSessionDiagnostics(sessionId, {
      state: 'open',
      negotiatedProtocol: protocol ?? null,
      openedAt,
      lastActivityAt: openedAt,
    });
    this.publishToBrowser(sessionId, {
      id: randomUUID(),
      type: 'open',
      sessionId,
      protocol,
    });
  }

  receiveAgentMessage({
    sessionId,
    data,
    isBinary,
  }: {
    sessionId: string;
    data: string;
    isBinary: boolean;
  }) {
    const session = this.getSession(sessionId);
    if (!session) return;
    this.updateSessionDiagnostics(sessionId, (current) => ({
      lastActivityAt: Date.now(),
      lastAgentMessageAt: Date.now(),
      agentMessageCount: current.agentMessageCount + 1,
    }));
    this.publishToBrowser(sessionId, {
      id: randomUUID(),
      type: 'message',
      sessionId,
      data,
      isBinary,
    });
  }

  failFromAgent({
    sessionId,
    message,
  }: {
    sessionId: string;
    message: string;
  }) {
    const session = this.getSession(sessionId);
    if (!session) return;
    this.updateSessionDiagnostics(sessionId, {
      lastActivityAt: Date.now(),
      lastErrorAt: Date.now(),
      lastErrorMessage: message,
    });
    this.publishToBrowser(sessionId, {
      id: randomUUID(),
      type: 'error',
      sessionId,
      message,
    });
  }

  closeFromAgent({
    sessionId,
    code,
    reason,
  }: {
    sessionId: string;
    code?: number;
    reason?: string;
  }) {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.state = 'closed';
    const closedAt = Date.now();
    this.updateSessionDiagnostics(sessionId, {
      state: 'closed',
      lastActivityAt: closedAt,
      lastCloseAt: closedAt,
      lastCloseCode: code ?? null,
      lastCloseReason: reason ?? null,
    });
    this.publishToBrowser(sessionId, {
      id: randomUUID(),
      type: 'close',
      sessionId,
      code,
      reason,
    });
    this.disposeSession(sessionId);
  }

  private disposeSession(sessionId: string) {
    const browserSubscribers = this.browserSubscribers.get(sessionId);
    if (browserSubscribers) {
      for (const subscriber of browserSubscribers.values()) {
        subscriber.close();
      }
      this.browserSubscribers.delete(sessionId);
    }

    this.pendingBrowserEvents.delete(sessionId);
    this.sessions.delete(sessionId);
  }

  getInfraDiagnostics(infraId: string) {
    const diagnostics = (this.recentSessionIdsByInfra.get(infraId) || [])
      .map((sessionId) => this.sessionDiagnostics.get(sessionId))
      .filter(Boolean) as PreviewTunnelSessionDiagnostics[];

    const activeSessions = diagnostics.filter((entry) => entry.state !== 'closed');
    const openingSessions = activeSessions.filter((entry) => entry.state === 'opening');
    const openSessions = activeSessions.filter((entry) => entry.state === 'open');

    return {
      activeSessionCount: activeSessions.length,
      openingSessionCount: openingSessions.length,
      openSessionCount: openSessions.length,
      lastActivityAt: diagnostics[0]?.lastActivityAt ?? null,
      lastSession: diagnostics[0] ?? null,
      recentSessions: diagnostics,
    };
  }

  pruneExpiredSessions() {
    const cutoff = Date.now() - SESSION_TTL_MS;

    for (const session of this.sessions.values()) {
      if (session.lastSeenAt >= cutoff) continue;
      this.closeFromAgent({
        sessionId: session.id,
        code: 1001,
        reason: 'Preview tunnel session expired.',
      });
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __indexbluePreviewTunnelBroker: PreviewTunnelBroker | undefined;
}

export function getPreviewTunnelBroker() {
  if (!globalThis.__indexbluePreviewTunnelBroker) {
    globalThis.__indexbluePreviewTunnelBroker = new PreviewTunnelBroker();
  }

  return globalThis.__indexbluePreviewTunnelBroker;
}

export type {
  PreviewTunnelAgentEvent,
  PreviewTunnelBrowserEvent,
  PreviewTunnelSessionDiagnostics,
  PreviewTunnelSessionRecord,
};
