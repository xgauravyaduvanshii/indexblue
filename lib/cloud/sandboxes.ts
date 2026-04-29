import type { CloudInfraSandboxRecordPayload } from '@/lib/cloud/types';

type CloudInfraSandboxRecordInput = Omit<CloudInfraSandboxRecordPayload, 'startCommand' | 'pid' | 'ports'> & {
  startCommand?: string | null;
  pid?: number | null;
  ports?: CloudInfraSandboxRecordPayload['ports'];
};

export function normalizeCloudSandboxRecordPayload(
  sandbox: CloudInfraSandboxRecordInput,
): CloudInfraSandboxRecordPayload {
  return {
    ...sandbox,
    startCommand: sandbox.startCommand ?? null,
    pid: sandbox.pid ?? null,
    ports: sandbox.ports ?? [],
  };
}

export function normalizeCloudSandboxRecordPayloads(
  sandboxes: CloudInfraSandboxRecordInput[],
): CloudInfraSandboxRecordPayload[] {
  return sandboxes.map(normalizeCloudSandboxRecordPayload);
}
