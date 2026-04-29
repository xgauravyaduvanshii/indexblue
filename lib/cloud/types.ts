export type PlatformApiKeyStatus = 'active' | 'revoked';

export type PlatformDeviceSessionStatus = 'pending' | 'approved' | 'claimed' | 'expired' | 'cancelled';

export type CloudInfraMachineStatus = 'online' | 'offline' | 'attention';

export type CloudInfraCommandStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type CloudInfraSandboxStatus = 'running' | 'stopped' | 'error';

export type CloudInfraProcessSnapshot = {
  pid: number;
  command: string;
  cpuPercent: number;
  memoryPercent: number;
  startedAt?: string | null;
  state?: string | null;
};

export type CloudInfraMetricSnapshot = {
  cpuPercent: number;
  memoryPercent: number;
  uptimeSeconds: number;
  networkRxBytes: number;
  networkTxBytes: number;
  processCount: number;
  sandboxCount: number;
  recordedAt: string;
};

export type CloudInfraMachineMetadata = {
  machineLabel?: string;
  ipAddress?: string | null;
  shell?: string | null;
  cwd?: string | null;
  sandboxRoot?: string | null;
  tags?: string[];
  lastError?: string | null;
  sudoAvailable?: boolean;
  sudoPasswordless?: boolean;
  sudoIsRoot?: boolean;
  storedSudoPassword?: boolean;
  publicIp?: string | null;
  privateIpAddresses?: string[];
  privateIpEntries?: Array<{
    interface?: string | null;
    family?: string | number | null;
    address: string;
  }>;
  systemVendor?: string | null;
  productName?: string | null;
  cpuModel?: string | null;
  cpuArchitecture?: string | null;
  cpuLogicalCores?: number | null;
  cpuSpeedMHz?: number | null;
  memoryTotalBytes?: number | null;
  gpuDevices?: Array<{
    vendor?: string | null;
    name: string;
  }>;
  previewDomainBase?: string | null;
  activePreviews?: Array<{
    port: number;
    protocol?: 'http' | 'https';
    host?: string | null;
    label?: string | null;
    processName?: string | null;
    command?: string | null;
    source?: string | null;
    sandboxSlug?: string | null;
    sandboxName?: string | null;
    path?: string | null;
    pid?: number | null;
  }>;
};

export type CloudInfraSandboxPorts = Array<{
  port: number;
  protocol?: 'http' | 'https' | 'tcp';
  label?: string | null;
}>;

export type CloudInfraSandboxMetadata = {
  env?: Record<string, string>;
  notes?: string | null;
  lastExitCode?: number | null;
};

export type CloudInfraSandboxRecordPayload = {
  slug: string;
  name: string;
  rootPath: string;
  startCommand: string | null;
  status: CloudInfraSandboxStatus;
  pid: number | null;
  ports: CloudInfraSandboxPorts;
  metadata?: CloudInfraSandboxMetadata;
  startCount?: number;
  lastStartedAt?: string | null;
  lastStoppedAt?: string | null;
};

export type CloudInfraCommandType =
  | 'exec'
  | 'preview:fetch'
  | 'sudo:configure'
  | 'infra:stop'
  | 'infra:restart'
  | 'infra:disconnect'
  | 'fs:list'
  | 'fs:read'
  | 'fs:write'
  | 'fs:delete'
  | 'fs:mkdir'
  | 'fs:move'
  | 'fs:copy'
  | 'sandbox:list'
  | 'sandbox:create'
  | 'sandbox:start'
  | 'sandbox:stop'
  | 'sandbox:restart'
  | 'sandbox:delete';

export type CloudInfraCommandPayload = {
  command?: string;
  cwd?: string | null;
  sudo?: boolean;
  timeoutMs?: number | null;
  path?: string;
  targetPath?: string;
  content?: string;
  contentEncoding?: 'utf8' | 'base64';
  recursive?: boolean;
  password?: string;
  encryptedPassword?: string;
  rememberPassword?: boolean;
  clearStoredPassword?: boolean;
  forcePasswordless?: boolean;
  source?: string;
  actorLabel?: string;
  preview?: {
    port?: number;
    protocol?: 'http' | 'https';
    method?: string;
    pathname?: string;
    search?: string;
    headers?: Record<string, string>;
    bodyBase64?: string;
  };
  sandbox?: {
    name?: string;
    slug?: string;
    rootPath?: string;
    startCommand?: string | null;
    ports?: CloudInfraSandboxPorts;
    metadata?: CloudInfraSandboxMetadata;
  };
};
