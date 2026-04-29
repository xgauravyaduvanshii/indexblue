import { buildCloudPreviewPath } from './previews.js';

function escapeInlineScriptAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function buildPreviewTunnelBootstrapPath({
  infraId,
  port,
}: {
  infraId: string;
  port: number;
}) {
  const search = new URLSearchParams({
    infraId,
    port: String(port),
  });

  return `/api/cloud/preview-tunnel/bootstrap?${search.toString()}`;
}

export function injectPreviewTunnelBootstrap(
  html: string,
  {
    infraId,
    port,
  }: {
    infraId: string;
    port: number;
  },
) {
  if (html.includes('data-indexblue-preview-tunnel="true"')) {
    return html;
  }

  const bootstrapPath = buildPreviewTunnelBootstrapPath({ infraId, port });
  const scriptTag = `<script src="${escapeInlineScriptAttribute(bootstrapPath)}" data-indexblue-preview-tunnel="true"></script>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${scriptTag}</head>`);
  }

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${scriptTag}</body>`);
  }

  return `${scriptTag}${html}`;
}

export function buildPreviewTunnelBootstrapScript({
  infraId,
  port,
}: {
  infraId: string;
  port: number;
}) {
  const previewPath = buildCloudPreviewPath({ infraId, port });
  const config = JSON.stringify({
    infraId,
    port,
    previewPath,
    tunnelBasePath: '/api/cloud/preview-tunnel',
  });

  return String.raw`
(() => {
  if (typeof window === 'undefined' || window.__INDEXBLUE_PREVIEW_TUNNEL__) {
    return;
  }

  const CONFIG = ${config};
  const NativeWebSocket = window.WebSocket;
  if (typeof NativeWebSocket !== 'function') {
    return;
  }

  const READY = {
    CONNECTING: NativeWebSocket.CONNECTING ?? 0,
    OPEN: NativeWebSocket.OPEN ?? 1,
    CLOSING: NativeWebSocket.CLOSING ?? 2,
    CLOSED: NativeWebSocket.CLOSED ?? 3,
  };
  const CLOSE_EVENT =
    typeof window.CloseEvent === 'function'
      ? window.CloseEvent
      : function CloseEvent(type, init) {
          const event = new Event(type);
          event.code = init?.code ?? 1000;
          event.reason = init?.reason ?? '';
          event.wasClean = true;
          return event;
        };
  const knownPreviewHosts = new Set([
    window.location.hostname.toLowerCase(),
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
  ]);

  function normalizeProtocols(protocols) {
    if (typeof protocols === 'string') {
      return protocols.length > 0 ? [protocols] : [];
    }

    if (Array.isArray(protocols)) {
      return protocols.filter((value) => typeof value === 'string' && value.length > 0);
    }

    return [];
  }

  function normalizeUrl(url) {
    if (typeof url === 'string' || url instanceof URL) {
      return new URL(String(url), window.location.href);
    }

    throw new TypeError('Invalid WebSocket URL.');
  }

  function escapeRegExp(value) {
    return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
  }

  function shouldTunnel(url) {
    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'ws:' && protocol !== 'wss:') {
      return false;
    }

    if (knownPreviewHosts.has(url.hostname.toLowerCase())) {
      return true;
    }

    return url.pathname.startsWith(CONFIG.previewPath);
  }

  function resolveTarget(url) {
    const parsed = normalizeUrl(url);
    if (!shouldTunnel(parsed)) {
      return null;
    }

    const isSamePreviewHost = knownPreviewHosts.has(parsed.hostname.toLowerCase());
    const pathname = isSamePreviewHost
      ? parsed.pathname
      : parsed.pathname.replace(new RegExp('^' + escapeRegExp(CONFIG.previewPath)), '') || '/';

    return {
      originalUrl: parsed.toString(),
      port:
        isSamePreviewHost || !parsed.port
          ? CONFIG.port
          : Number(parsed.port),
      protocol: parsed.protocol === 'wss:' ? 'wss' : 'ws',
      pathname: pathname.startsWith('/') ? pathname : '/' + pathname,
      search: parsed.search || '',
    };
  }

  function base64FromArrayBuffer(buffer) {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    let binary = '';
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }

    return btoa(binary);
  }

  function arrayBufferFromBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  function createMessagePayload(data) {
    if (typeof data === 'string') {
      return {
        data,
        isBinary: false,
      };
    }

    if (data instanceof ArrayBuffer) {
      return {
        data: base64FromArrayBuffer(data),
        isBinary: true,
      };
    }

    if (ArrayBuffer.isView(data)) {
      return {
        data: base64FromArrayBuffer(data),
        isBinary: true,
      };
    }

    throw new TypeError('Unsupported WebSocket payload type.');
  }

  function restoreMessagePayload(instance, payload) {
    if (!payload.isBinary) {
      return payload.data;
    }

    const buffer = arrayBufferFromBase64(payload.data);
    if (instance.binaryType === 'blob' && typeof Blob === 'function') {
      return new Blob([buffer]);
    }

    return buffer;
  }

  function createSocketLike(url, protocols, target) {
    const listeners = new Map();
    const instance = Object.create(PreviewTunnelWebSocket.prototype);
    instance.url = target.originalUrl;
    instance.readyState = READY.CONNECTING;
    instance.bufferedAmount = 0;
    instance.extensions = '';
    instance.protocol = '';
    instance.binaryType = 'blob';
    instance.onopen = null;
    instance.onerror = null;
    instance.onclose = null;
    instance.onmessage = null;
    instance.__sessionId = null;
    instance.__eventSource = null;
    instance.__pendingMessages = [];
    instance.__closed = false;
    instance.__listeners = listeners;
    instance.__target = target;
    instance.__protocols = normalizeProtocols(protocols);
    instance.__controller = new AbortController();

    instance.addEventListener = function addEventListener(type, listener) {
      if (typeof listener !== 'function') {
        return;
      }

      const bucket = listeners.get(type) || new Set();
      bucket.add(listener);
      listeners.set(type, bucket);
    };

    instance.removeEventListener = function removeEventListener(type, listener) {
      const bucket = listeners.get(type);
      if (!bucket) {
        return;
      }

      bucket.delete(listener);
      if (bucket.size === 0) {
        listeners.delete(type);
      }
    };

    instance.dispatchEvent = function dispatchEvent(event) {
      const bucket = listeners.get(event.type);
      if (bucket) {
        for (const listener of bucket) {
          listener.call(instance, event);
        }
      }
      return !event.defaultPrevented;
    };

    instance.__emit = function emit(event, handlerName) {
      instance.dispatchEvent(event);
      const handler = instance[handlerName];
      if (typeof handler === 'function') {
        handler.call(instance, event);
      }
    };

    const init = async () => {
      try {
        const response = await fetch(CONFIG.tunnelBasePath + '/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            infraId: CONFIG.infraId,
            port: target.port,
            protocol: target.protocol,
            pathname: target.pathname,
            search: target.search,
            headers: {
              origin: window.location.origin,
              'user-agent': navigator.userAgent,
            },
            protocols: instance.__protocols,
          }),
          signal: instance.__controller.signal,
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.sessionId) {
          throw new Error(payload?.error || 'Failed to create preview tunnel session.');
        }

        if (instance.__closed) {
          return;
        }

        instance.__sessionId = payload.sessionId;
        const eventSource = new EventSource(CONFIG.tunnelBasePath + '/session/' + payload.sessionId + '/events');
        instance.__eventSource = eventSource;

        eventSource.onmessage = async (messageEvent) => {
          let eventPayload = null;
          try {
            eventPayload = JSON.parse(messageEvent.data);
          } catch {
            return;
          }

          if (!eventPayload || eventPayload.sessionId !== instance.__sessionId) {
            return;
          }

          if (eventPayload.type === 'open') {
            if (instance.readyState !== READY.CONNECTING) {
              return;
            }

            instance.readyState = READY.OPEN;
            instance.protocol = eventPayload.protocol || instance.__protocols[0] || '';
            instance.__emit(new Event('open'), 'onopen');

            while (instance.__pendingMessages.length > 0) {
              const nextPayload = instance.__pendingMessages.shift();
              if (nextPayload !== undefined) {
                void instance.send(nextPayload);
              }
            }
            return;
          }

          if (eventPayload.type === 'message') {
            if (instance.readyState === READY.CLOSED) {
              return;
            }

            const restored = restoreMessagePayload(instance, eventPayload);
            instance.__emit(new MessageEvent('message', { data: restored }), 'onmessage');
            return;
          }

          if (eventPayload.type === 'error') {
            instance.__emit(new Event('error'), 'onerror');
            return;
          }

          if (eventPayload.type === 'close') {
            if (instance.readyState === READY.CLOSED) {
              return;
            }

            instance.readyState = READY.CLOSED;
            instance.__closed = true;
            eventSource.close();
            instance.__emit(new CLOSE_EVENT('close', {
              code: eventPayload.code ?? 1000,
              reason: eventPayload.reason ?? '',
            }), 'onclose');
          }
        };

        eventSource.onerror = () => {
          if (instance.readyState === READY.CLOSED || instance.__closed) {
            return;
          }

          instance.__emit(new Event('error'), 'onerror');
        };
      } catch (error) {
        if (instance.readyState !== READY.CLOSED) {
          instance.readyState = READY.CLOSED;
          instance.__closed = true;
          instance.__emit(new Event('error'), 'onerror');
          instance.__emit(new CLOSE_EVENT('close', {
            code: 1011,
            reason: error instanceof Error ? error.message : 'Preview tunnel connection failed.',
          }), 'onclose');
        }
      }
    };

    void init();
    return instance;
  }

  function PreviewTunnelWebSocket(url, protocols) {
    const target = resolveTarget(url);
    if (!target) {
      return protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
    }

    return createSocketLike(url, protocols, target);
  }

  PreviewTunnelWebSocket.prototype.send = function send(data) {
    if (this.readyState === READY.CONNECTING) {
      this.__pendingMessages.push(data);
      return;
    }

    if (this.readyState !== READY.OPEN || !this.__sessionId) {
      throw new Error('WebSocket is not open.');
    }

    const payload = createMessagePayload(data);
    void fetch(CONFIG.tunnelBasePath + '/session/' + this.__sessionId + '/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).catch(() => {
      if (this.readyState !== READY.CLOSED) {
        this.__emit(new Event('error'), 'onerror');
      }
    });
  };

  PreviewTunnelWebSocket.prototype.close = function close(code, reason) {
    if (this.readyState === READY.CLOSED || this.__closed) {
      return;
    }

    this.__closed = true;
    this.readyState = READY.CLOSING;
    this.__controller?.abort?.();
    this.__eventSource?.close?.();

    if (this.__sessionId) {
      void fetch(CONFIG.tunnelBasePath + '/session/' + this.__sessionId + '/close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          reason,
        }),
      }).catch(() => undefined);
    }

    this.readyState = READY.CLOSED;
    this.__emit(new CLOSE_EVENT('close', {
      code: code ?? 1000,
      reason: reason ?? '',
    }), 'onclose');
  };

  Object.defineProperties(PreviewTunnelWebSocket, {
    CONNECTING: { value: READY.CONNECTING },
    OPEN: { value: READY.OPEN },
    CLOSING: { value: READY.CLOSING },
    CLOSED: { value: READY.CLOSED },
  });
  Object.defineProperties(PreviewTunnelWebSocket.prototype, {
    CONNECTING: { value: READY.CONNECTING },
    OPEN: { value: READY.OPEN },
    CLOSING: { value: READY.CLOSING },
    CLOSED: { value: READY.CLOSED },
  });

  window.__INDEXBLUE_PREVIEW_TUNNEL__ = {
    infraId: CONFIG.infraId,
    port: CONFIG.port,
    nativeWebSocket: NativeWebSocket,
  };
  window.WebSocket = PreviewTunnelWebSocket;
})();
`.trim();
}

declare global {
  interface Window {
    __INDEXBLUE_PREVIEW_TUNNEL__?: {
      infraId: string;
      port: number;
      nativeWebSocket: typeof WebSocket;
    };
  }
}
