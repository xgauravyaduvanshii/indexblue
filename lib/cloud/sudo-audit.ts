import type { CloudInfraCommandPayload, CloudInfraCommandStatus } from '@/lib/cloud/types';

export type SudoAuditCommandRecord = {
  id: string;
  type: string;
  status: CloudInfraCommandStatus | string;
  payload: CloudInfraCommandPayload | Record<string, unknown>;
  result?: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type SudoAuditEntry = {
  id: string;
  status: CloudInfraCommandStatus | string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  action: 'store-password' | 'clear-password' | 'force-passwordless-request' | 'update';
  title: string;
  detail: string;
  actorLabel: string;
  resultSummary: string | null;
  errorMessage: string | null;
};

function getBoolean(value: unknown) {
  return value === true;
}

export function buildSudoAuditEntries(commands: SudoAuditCommandRecord[]): SudoAuditEntry[] {
  return commands
    .filter((command) => command.type === 'sudo:configure')
    .map((command) => {
      const payload = (command.payload || {}) as CloudInfraCommandPayload & Record<string, unknown>;
      const result = command.result && typeof command.result === 'object' ? command.result : {};
      const actorLabel = typeof payload.actorLabel === 'string' ? payload.actorLabel : 'Cloud Infrastructure dashboard';
      const forcePasswordless = getBoolean(payload.forcePasswordless);
      const clearStoredPassword = getBoolean(payload.clearStoredPassword);
      const rememberPassword = getBoolean(payload.rememberPassword);

      if (forcePasswordless) {
        return {
          id: command.id,
          status: command.status,
          createdAt: command.createdAt,
          startedAt: command.startedAt ?? null,
          completedAt: command.completedAt ?? null,
          action: 'force-passwordless-request' as const,
          title: 'Requested force passwordless sudo',
          detail: 'Attempted to enable blanket passwordless sudo through the dashboard.',
          actorLabel,
          resultSummary: null,
          errorMessage: command.errorMessage,
        };
      }

      if (clearStoredPassword) {
        return {
          id: command.id,
          status: command.status,
          createdAt: command.createdAt,
          startedAt: command.startedAt ?? null,
          completedAt: command.completedAt ?? null,
          action: 'clear-password' as const,
          title: 'Cleared stored sudo password',
          detail: 'Removed the encrypted sudo password cache from the connected machine.',
          actorLabel,
          resultSummary: command.status === 'completed' ? 'Stored sudo password removed from the machine.' : null,
          errorMessage: command.errorMessage,
        };
      }

      if (rememberPassword) {
        return {
          id: command.id,
          status: command.status,
          createdAt: command.createdAt,
          startedAt: command.startedAt ?? null,
          completedAt: command.completedAt ?? null,
          action: 'store-password' as const,
          title: 'Saved sudo password for reuse',
          detail: 'Stored an encrypted sudo password in the local CLI config on the connected machine.',
          actorLabel,
          resultSummary: command.status === 'completed' ? 'Stored sudo password is now available for future remote commands.' : null,
          errorMessage: command.errorMessage,
        };
      }

      return {
        id: command.id,
        status: command.status,
        createdAt: command.createdAt,
        startedAt: command.startedAt ?? null,
        completedAt: command.completedAt ?? null,
        action: 'update' as const,
        title: 'Updated sudo configuration',
        detail: 'Applied a sudo configuration change from the dashboard.',
        actorLabel,
        resultSummary:
          command.status === 'completed' && getBoolean((result as Record<string, unknown>).storedSudoPassword)
            ? 'The machine confirmed a stored sudo password is available.'
            : null,
        errorMessage: command.errorMessage,
      };
    });
}
