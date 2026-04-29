import type { CloudInfraMachineMetadata } from '@/lib/cloud/types';

export type CloudActivePreview = {
  port: number;
  protocol?: 'http' | 'https';
  host?: string | null;
  label?: string | null;
  processName?: string | null;
  command?: string | null;
  source?: string | null;
  sandboxSlug?: string | null;
  sandboxName?: string | null;
  pid?: number | null;
  path?: string | null;
};

export type CloudPreviewLink = CloudActivePreview & {
  url: string;
  pathUrl: string;
  hostUrl: string | null;
  host: string | null;
};

type CloudSandboxPreviewSource = {
  slug: string;
  name: string;
  startCommand?: string | null;
  pid?: number | null;
  ports?: Array<{
    port: number;
    protocol?: 'http' | 'https' | 'tcp';
    label?: string | null;
  }>;
};

export type CloudPreviewDnsRecord = {
  type: 'A' | 'CNAME';
  name: string;
  value: string;
  status: 'ready' | 'needs-public-host';
  description: string;
  targetHost: string | null;
  note?: string | null;
};

export type CloudPreviewDnsTargetSource =
  | 'explicit-host'
  | 'app-origin'
  | 'request-host'
  | 'machine-public-ip'
  | 'unavailable';

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function sanitizePreviewDomainBase(value: string | null | undefined) {
  if (!value) return null;

  const trimmed = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

export function isIpHostname(hostname: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

export function getCloudPreviewAppOrigin() {
  return trimTrailingSlash(
    process.env.BETTER_AUTH_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  );
}

function normalizeHostInput(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return null;

  const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
  const withoutPath = withoutProtocol.replace(/\/.*$/, '');
  const host = withoutPath.includes(':') && !withoutPath.includes(']')
    ? withoutPath.split(':')[0] || withoutPath
    : withoutPath;

  return host.replace(/\.+$/, '') || null;
}

function isLocalOnlyHostname(hostname: string | null | undefined) {
  if (!hostname) return true;
  const normalized = normalizeHostInput(hostname);
  if (!normalized) return true;
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0';
}

export function resolvePreviewDnsTargetHost({
  requestHost,
}: {
  requestHost?: string | null;
} = {}) {
  return resolvePreviewDnsTarget({
    requestHost,
  }).host;
}

export function resolvePreviewDnsTarget({
  requestHost,
  fallbackHost,
}: {
  requestHost?: string | null;
  fallbackHost?: string | null;
} = {}) {
  const explicitHost = normalizeHostInput(process.env.CLOUD_PREVIEW_TARGET_HOST);
  if (explicitHost && !isLocalOnlyHostname(explicitHost)) {
    return {
      host: explicitHost,
      source: 'explicit-host' as const,
    };
  }

  try {
    const appHost = normalizeHostInput(new URL(getCloudPreviewAppOrigin()).hostname);
    if (appHost && !isLocalOnlyHostname(appHost)) {
      return {
        host: appHost,
        source: 'app-origin' as const,
      };
    }
  } catch {
    // Ignore malformed app origin and continue to request host.
  }

  const forwardedHost = normalizeHostInput(requestHost);
  if (forwardedHost && !isLocalOnlyHostname(forwardedHost)) {
    return {
      host: forwardedHost,
      source: 'request-host' as const,
    };
  }

  const normalizedFallbackHost = normalizeHostInput(fallbackHost);
  if (normalizedFallbackHost && !isLocalOnlyHostname(normalizedFallbackHost)) {
    return {
      host: normalizedFallbackHost,
      source: 'machine-public-ip' as const,
    };
  }

  return {
    host: null,
    source: 'unavailable' as const,
  };
}

export function getPlatformPreviewDomainBase() {
  const configured = sanitizePreviewDomainBase(process.env.CLOUD_PREVIEW_BASE_DOMAIN);
  if (configured) {
    return configured;
  }

  try {
    const hostname = new URL(getCloudPreviewAppOrigin()).hostname;
    if (!hostname || hostname === 'localhost' || isIpHostname(hostname)) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

export function buildCloudPreviewPath({
  infraId,
  port,
  pathname = '/',
}: {
  infraId: string;
  port: number;
  pathname?: string;
}) {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `/cloud-preview/${infraId}/${port}${normalizedPath === '/' ? '' : normalizedPath}`;
}

export function buildCloudPreviewSubdomainLabel({
  infraId,
  port,
}: {
  infraId: string;
  port: number;
}) {
  return `${port}--${infraId}`;
}

export function buildCloudPreviewLinks({
  infraId,
  port,
  protocol = 'http',
  pathname = '/',
  search = '',
  domainBase,
}: {
  infraId: string;
  port: number;
  protocol?: 'http' | 'https';
  pathname?: string;
  search?: string;
  domainBase?: string | null;
}) {
  const path = buildCloudPreviewPath({ infraId, port, pathname });
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const appOrigin = getCloudPreviewAppOrigin();
  let appGatewayProtocol = protocol;
  let appGatewayPort = '';

  try {
    const appUrl = new URL(appOrigin);
    appGatewayProtocol = appUrl.protocol === 'https:' ? 'https' : 'http';
    appGatewayPort = appUrl.port;
  } catch {
    appGatewayProtocol = protocol === 'https' ? 'https' : 'http';
    appGatewayPort = '';
  }

  const pathUrl = `${appOrigin}${path}${search}`;
  const sanitizedDomainBase = sanitizePreviewDomainBase(domainBase);
  const host = sanitizedDomainBase ? `${buildCloudPreviewSubdomainLabel({ infraId, port })}.${sanitizedDomainBase}` : null;
  const hostPortSuffix = appGatewayPort ? `:${appGatewayPort}` : '';
  const hostUrl = host ? `${appGatewayProtocol}://${host}${hostPortSuffix}${normalizedPath}${search}` : null;

  return {
    pathUrl,
    host,
    hostUrl,
    url: hostUrl || pathUrl,
  };
}

export function parseCloudPreviewHost(hostHeader: string | null | undefined) {
  if (!hostHeader) return null;
  const hostWithoutPort = hostHeader.split(':')[0]?.toLowerCase() ?? '';
  const [label] = hostWithoutPort.split('.');
  const match = label?.match(/^(\d{1,5})--([a-z0-9-]+)$/);
  if (!match) return null;

  const port = Number(match[1]);
  const infraId = match[2];
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !infraId) {
    return null;
  }

  return {
    port,
    infraId,
    host: hostWithoutPort,
  };
}

export function buildPreviewDnsRecords(
  domainBase: string | null | undefined,
  {
    targetHost = resolvePreviewDnsTargetHost(),
  }: {
    targetHost?: string | null;
  } = {},
): CloudPreviewDnsRecord[] {
  const sanitizedDomainBase = sanitizePreviewDomainBase(domainBase);
  if (!sanitizedDomainBase) return [];

  const normalizedTargetHost = normalizeHostInput(targetHost);
  if (!normalizedTargetHost || isLocalOnlyHostname(normalizedTargetHost)) {
    return [
      {
        type: 'CNAME',
        name: `*.${sanitizedDomainBase}`,
        value: 'your-public-indexblue-host.example.com',
        status: 'needs-public-host',
        description: 'Wildcard preview routing',
        targetHost: null,
        note: 'Set BETTER_AUTH_BASE_URL, NEXT_PUBLIC_APP_URL, or CLOUD_PREVIEW_TARGET_HOST to a public hostname before using custom preview DNS.',
      },
    ];
  }

  return [
    isIpHostname(normalizedTargetHost)
      ? {
          type: 'A',
          name: `*.${sanitizedDomainBase}`,
          value: normalizedTargetHost,
          status: 'ready',
          description: 'Wildcard preview routing',
          targetHost: normalizedTargetHost,
          note: null,
        }
      : {
          type: 'CNAME',
          name: `*.${sanitizedDomainBase}`,
          value: normalizedTargetHost,
          status: 'ready',
          description: 'Wildcard preview routing',
          targetHost: normalizedTargetHost,
          note: null,
        },
  ];
}

function getPreviewLabel(preview: CloudActivePreview) {
  if (preview.label) return preview.label;
  if (preview.sandboxName) return `${preview.sandboxName} (${preview.port})`;
  if (preview.processName) return `${preview.processName} (${preview.port})`;
  return `Port ${preview.port}`;
}

export function collectCloudPreviewLinks({
  infraId,
  metadata,
  sandboxes,
}: {
  infraId: string;
  metadata: CloudInfraMachineMetadata;
  sandboxes: CloudSandboxPreviewSource[];
}): CloudPreviewLink[] {
  const customDomainBase = sanitizePreviewDomainBase(metadata.previewDomainBase);
  const managedDomainBase = getPlatformPreviewDomainBase();
  const previews = new Map<number, CloudActivePreview>();
  const activePreviews = Array.isArray(metadata.activePreviews) ? metadata.activePreviews : [];

  for (const preview of activePreviews) {
    if (!preview || typeof preview !== 'object') continue;
    const port = Number((preview as Record<string, unknown>).port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;

    previews.set(port, {
      port,
      protocol:
        (preview as Record<string, unknown>).protocol === 'https'
          ? 'https'
          : 'http',
      host: typeof (preview as Record<string, unknown>).host === 'string' ? String((preview as Record<string, unknown>).host) : null,
      label: typeof (preview as Record<string, unknown>).label === 'string' ? String((preview as Record<string, unknown>).label) : null,
      processName:
        typeof (preview as Record<string, unknown>).processName === 'string'
          ? String((preview as Record<string, unknown>).processName)
          : null,
      command:
        typeof (preview as Record<string, unknown>).command === 'string'
          ? String((preview as Record<string, unknown>).command)
          : null,
      source:
        typeof (preview as Record<string, unknown>).source === 'string' ? String((preview as Record<string, unknown>).source) : null,
      sandboxSlug:
        typeof (preview as Record<string, unknown>).sandboxSlug === 'string'
          ? String((preview as Record<string, unknown>).sandboxSlug)
          : null,
      sandboxName:
        typeof (preview as Record<string, unknown>).sandboxName === 'string'
          ? String((preview as Record<string, unknown>).sandboxName)
          : null,
      path:
        typeof (preview as Record<string, unknown>).path === 'string' ? String((preview as Record<string, unknown>).path) : '/',
      pid: typeof (preview as Record<string, unknown>).pid === 'number' ? Number((preview as Record<string, unknown>).pid) : null,
    });
  }

  for (const sandbox of sandboxes) {
    for (const portRecord of sandbox.ports ?? []) {
      const port = Number(portRecord.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) continue;

      const existing = previews.get(port);
      previews.set(port, {
        port,
        protocol: portRecord.protocol === 'https' ? 'https' : existing?.protocol ?? 'http',
        label: existing?.label ?? sandbox.name,
        sandboxSlug: sandbox.slug,
        sandboxName: sandbox.name,
        source: existing?.source ?? 'sandbox',
        host: existing?.host ?? null,
        processName: existing?.processName ?? null,
        command: existing?.command ?? sandbox.startCommand ?? null,
        path: existing?.path ?? '/',
        pid: existing?.pid ?? sandbox.pid ?? null,
      });
    }
  }

  return Array.from(previews.values())
    .sort((left, right) => left.port - right.port)
    .map((preview) => {
      const links = buildCloudPreviewLinks({
        infraId,
        port: preview.port,
        protocol: preview.protocol ?? 'http',
        pathname: preview.path ?? '/',
        domainBase: customDomainBase || managedDomainBase,
      });

      return {
        ...preview,
        label: getPreviewLabel(preview),
        url: links.url,
        pathUrl: links.pathUrl,
        hostUrl: customDomainBase || managedDomainBase ? links.hostUrl : null,
        host: customDomainBase || managedDomainBase ? links.host : null,
      };
    });
}
