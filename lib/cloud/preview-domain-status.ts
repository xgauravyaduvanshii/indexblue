import { lookup } from 'node:dns/promises';
import { buildCloudPreviewLinks, sanitizePreviewDomainBase } from '@/lib/cloud/previews';

type PreviewDomainStatusResult = {
  configured: boolean;
  connected: boolean;
  dnsResolved: boolean;
  httpReachable: boolean;
  proxyDetected: boolean;
  probeHost: string | null;
  probeUrl: string | null;
  gatewayPort: number | null;
  resolvedAddresses: string[];
  httpStatus: number | null;
  checkedAt: string;
  issues: string[];
};

const PREVIEW_DOMAIN_STATUS_TTL_MS = 25_000;

const previewDomainStatusCache = new Map<
  string,
  {
    expiresAt: number;
    value: PreviewDomainStatusResult;
  }
>();

function parseGatewayPort(probeUrl: string | null) {
  if (!probeUrl) return null;

  try {
    const parsed = new URL(probeUrl);
    if (parsed.port) {
      return Number(parsed.port);
    }

    return parsed.protocol === 'https:' ? 443 : 80;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, timeoutMs = 4_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  try {
    return await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPreviewDomainStatus({
  infraId,
  domainBase,
  probePort,
}: {
  infraId: string;
  domainBase: string | null | undefined;
  probePort: number;
}): Promise<PreviewDomainStatusResult> {
  const sanitizedDomainBase = sanitizePreviewDomainBase(domainBase);
  const cacheKey = `${infraId}:${sanitizedDomainBase || 'none'}:${probePort}`;
  const cached = previewDomainStatusCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const checkedAt = new Date().toISOString();
  if (!sanitizedDomainBase) {
    const result: PreviewDomainStatusResult = {
      configured: false,
      connected: false,
      dnsResolved: false,
      httpReachable: false,
      proxyDetected: false,
      probeHost: null,
      probeUrl: null,
      gatewayPort: null,
      resolvedAddresses: [],
      httpStatus: null,
      checkedAt,
      issues: ['Add a custom preview domain base to start checking wildcard DNS connectivity.'],
    };
    previewDomainStatusCache.set(cacheKey, {
      expiresAt: Date.now() + PREVIEW_DOMAIN_STATUS_TTL_MS,
      value: result,
    });
    return result;
  }

  const links = buildCloudPreviewLinks({
    infraId,
    port: probePort,
    domainBase: sanitizedDomainBase,
  });

  const probeHost = links.host;
  const probeUrl = links.hostUrl;
  const gatewayPort = parseGatewayPort(probeUrl);
  const issues: string[] = [];
  let dnsResolved = false;
  let httpReachable = false;
  let proxyDetected = false;
  let httpStatus: number | null = null;
  let resolvedAddresses: string[] = [];

  if (!probeHost || !probeUrl) {
    issues.push('Preview probe host could not be generated from the current preview configuration.');
  } else {
    try {
      const records = await lookup(probeHost, { all: true });
      resolvedAddresses = Array.from(
        new Set(records.map((record) => record.address).filter((address) => typeof address === 'string' && address.length > 0)),
      );
      dnsResolved = resolvedAddresses.length > 0;
    } catch {
      issues.push('Wildcard DNS is not resolving yet. Add the shown record and wait for propagation.');
    }

    if (dnsResolved) {
      try {
        const response = await fetchWithTimeout(probeUrl);
        httpReachable = true;
        httpStatus = response.status;
        proxyDetected =
          response.headers.get('x-indexblue-preview-proxy') === 'true' ||
          response.headers.get('x-indexblue-preview') === 'true';

        if (!proxyDetected) {
          issues.push(
            'DNS resolves, but the request is not reaching the IndexBlue preview gateway yet. Verify the wildcard record points to the same public host running IndexBlue.',
          );
        }
      } catch {
        issues.push(
          gatewayPort && gatewayPort !== 80 && gatewayPort !== 443
            ? `DNS resolves, but the IndexBlue preview gateway is not reachable on port ${gatewayPort}. Expose that port or place a reverse proxy on 80/443.`
            : 'DNS resolves, but the IndexBlue preview gateway is refusing connections.',
        );
      }
    }
  }

  const result: PreviewDomainStatusResult = {
    configured: true,
    connected: dnsResolved && httpReachable && proxyDetected,
    dnsResolved,
    httpReachable,
    proxyDetected,
    probeHost,
    probeUrl,
    gatewayPort,
    resolvedAddresses,
    httpStatus,
    checkedAt,
    issues,
  };

  previewDomainStatusCache.set(cacheKey, {
    expiresAt: Date.now() + PREVIEW_DOMAIN_STATUS_TTL_MS,
    value: result,
  });

  return result;
}
