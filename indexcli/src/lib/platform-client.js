import { normalizeApiBaseUrl } from './config.js';

async function requestJson({ baseUrl, path, method = 'GET', apiKey, body }) {
  const response = await fetch(`${normalizeApiBaseUrl(baseUrl)}${path}`, {
    method,
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with status ${response.status}.`);
  }

  return payload;
}

export function createDeviceSession(baseUrl, requestedLabel) {
  return requestJson({
    baseUrl,
    path: '/api/cloud/device-sessions',
    method: 'POST',
    body: { requestedLabel },
  });
}

export function claimDeviceSession(baseUrl, sessionId) {
  return requestJson({
    baseUrl,
    path: `/api/cloud/device-sessions/${sessionId}/claim`,
  });
}

export function registerInfra(baseUrl, apiKey, body) {
  return requestJson({
    baseUrl,
    path: '/api/cloud/agent/register',
    method: 'POST',
    apiKey,
    body,
  });
}

export function sendHeartbeat(baseUrl, apiKey, body) {
  return requestJson({
    baseUrl,
    path: '/api/cloud/agent/heartbeat',
    method: 'POST',
    apiKey,
    body,
  });
}

export function pullInfraCommand(baseUrl, apiKey, body) {
  return requestJson({
    baseUrl,
    path: '/api/cloud/agent/commands/pull',
    method: 'POST',
    apiKey,
    body,
  });
}

export function updateInfraCommand(baseUrl, apiKey, commandId, body) {
  return requestJson({
    baseUrl,
    path: `/api/cloud/agent/commands/${commandId}`,
    method: 'POST',
    apiKey,
    body,
  });
}

export function readInfraCommandStatus(baseUrl, apiKey, commandId, infraId) {
  const search = new URLSearchParams({
    infraId,
  });

  return requestJson({
    baseUrl,
    path: `/api/cloud/agent/commands/${commandId}?${search.toString()}`,
    method: 'GET',
    apiKey,
  });
}

export function openTunnelEventStream(baseUrl, apiKey, infraId, signal) {
  const url = new URL('/api/cloud/agent/tunnel/events', normalizeApiBaseUrl(baseUrl));
  url.searchParams.set('infraId', infraId);

  return fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    signal,
  });
}

export function pushTunnelMessage(baseUrl, apiKey, body) {
  return requestJson({
    baseUrl,
    path: '/api/cloud/agent/tunnel/messages',
    method: 'POST',
    apiKey,
    body,
  });
}
