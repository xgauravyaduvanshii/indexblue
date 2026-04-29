'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  Loader2,
  Plus,
  Play,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { CloudMetricChart, CloudStartRateChart } from '@/components/cloud-infra-charts';
import { buildSudoAuditEntries } from '@/lib/cloud/sudo-audit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';

type DetailResponse = {
  infra: {
    id: string;
    name: string;
    machineId: string;
    hostname: string | null;
    platform: string | null;
    arch: string | null;
    release: string | null;
    cliVersion: string | null;
    nodeVersion: string | null;
    status: string;
    latencyMs: number | null;
    totalCommands: number;
    totalFsOps: number;
    totalDataTransferred: number;
    latestMetrics: {
      cpuPercent: number;
      memoryPercent: number;
      uptimeSeconds: number;
      processCount: number;
      sandboxCount: number;
      networkRxBytes: number;
      networkTxBytes: number;
      recordedAt: string;
    } | null;
    latestProcesses: Array<{
      pid: number;
      command: string;
      cpuPercent: number;
      memoryPercent: number;
      state?: string | null;
    }>;
    metadata: Record<string, unknown>;
    lastSeenAt: string | null;
  };
  metrics: Array<{
    cpuPercent: number;
    memoryPercent: number;
    uptimeSeconds: number;
    networkRxBytes: number;
    networkTxBytes: number;
    processCount: number;
    sandboxCount: number;
    createdAt: string;
  }>;
  sandboxes: Array<{
    id: string;
    slug: string;
    name: string;
    rootPath: string;
    startCommand: string | null;
    status: string;
    pid: number | null;
    ports: Array<{ port: number; protocol?: string; label?: string | null }>;
    startCount: number;
    lastStartedAt: string | null;
  }>;
  usage: {
    totalCommands: number;
    totalFsOps: number;
    totalDataTransferred: number;
    uptimePercent: number;
    latestLatencyMs: number | null;
  };
  previews: Array<{
    port: number;
    protocol?: 'http' | 'https';
    label?: string | null;
    processName?: string | null;
    source?: string | null;
    sandboxSlug?: string | null;
    sandboxName?: string | null;
    host?: string | null;
    url: string;
    pathUrl: string;
    hostUrl: string | null;
  }>;
  previewTunnel: {
    activeSessionCount: number;
    openingSessionCount: number;
    openSessionCount: number;
    lastActivityAt: string | null;
    lastSession: {
      sessionId: string;
      port: number;
      state: 'opening' | 'open' | 'closed';
      requestedProtocol: 'ws' | 'wss';
      negotiatedProtocol: string | null;
      pathname: string;
      search: string;
      createdAt: string;
      openedAt: string | null;
      lastActivityAt: string;
      lastBrowserMessageAt: string | null;
      lastAgentMessageAt: string | null;
      browserMessageCount: number;
      agentMessageCount: number;
      lastErrorAt: string | null;
      lastErrorMessage: string | null;
      lastCloseAt: string | null;
      lastCloseCode: number | null;
      lastCloseReason: string | null;
    } | null;
    recentSessions: Array<{
      sessionId: string;
      port: number;
      state: 'opening' | 'open' | 'closed';
      requestedProtocol: 'ws' | 'wss';
      negotiatedProtocol: string | null;
      pathname: string;
      search: string;
      createdAt: string;
      openedAt: string | null;
      lastActivityAt: string;
      lastBrowserMessageAt: string | null;
      lastAgentMessageAt: string | null;
      browserMessageCount: number;
      agentMessageCount: number;
      lastErrorAt: string | null;
      lastErrorMessage: string | null;
      lastCloseAt: string | null;
      lastCloseCode: number | null;
      lastCloseReason: string | null;
    }>;
  };
  previewConfig: {
    appOrigin: string;
    platformPreviewDomainBase: string | null;
    customPreviewDomainBase: string | null;
    dnsTargetHost: string | null;
    dnsTargetSource: 'explicit-host' | 'app-origin' | 'request-host' | 'machine-public-ip' | 'unavailable';
    dnsRecords: Array<{
      type: 'A' | 'CNAME';
      name: string;
      value: string;
      status: 'ready' | 'needs-public-host';
      description: string;
      targetHost: string | null;
      note?: string | null;
    }>;
    wildcardHostPattern: string;
    requiresCustomDns: boolean;
    domainStatus: {
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
  };
  recentCommands: Array<{
    id: string;
    type: string;
    status: string;
    payload: Record<string, unknown>;
    result: Record<string, unknown>;
    errorMessage: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  }>;
  startRate: Array<{ timestamp: string; count: number }>;
};

type RemoteCommand = {
  id: string;
  status: string;
  result: Record<string, unknown>;
  errorMessage: string | null;
  events: Array<{ stream: string; message: string }>;
};

type TerminalSessionState = {
  id: string;
  label: string;
  commandInput: string;
  runAsSudo: boolean;
  consoleOutput: string;
  liveCommand: RemoteCommand | null;
  lastCommandStatus: string | null;
  lastCommandError: string | null;
  isRunning: boolean;
  isCancelling: boolean;
};

type FileEntry = {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size: number;
  modifiedAt: string | null;
};

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUptime(seconds = 0) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T & { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || 'Request failed.');
  }
  return payload as T;
}

function createTerminalSession(index: number): TerminalSessionState {
  return {
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `terminal-${Date.now()}-${index}`,
    label: `Terminal ${index}`,
    commandInput: 'pwd && ls -la',
    runAsSudo: false,
    consoleOutput: '',
    liveCommand: null,
    lastCommandStatus: null,
    lastCommandError: null,
    isRunning: false,
    isCancelling: false,
  };
}

function getCommandEventsText(command: RemoteCommand | null | undefined) {
  return command?.events.map((event) => event.message).join('') || '';
}

function appendConsoleText(existing: string, next: string) {
  if (!next) return existing;
  return `${existing}${next}`;
}

function formatTerminalCommandFooter(command: RemoteCommand | null | undefined) {
  if (!command || command.status === 'running' || command.status === 'queued') {
    return '';
  }

  const statusLabel =
    command.status === 'completed'
      ? '[completed]'
      : command.status === 'cancelled'
        ? '[cancelled]'
        : '[failed]';

  const suffix = command.errorMessage ? ` ${command.errorMessage}` : '';
  return `${statusLabel}${suffix}\n`;
}

function getDnsTargetSourceLabel(source: DetailResponse['previewConfig']['dnsTargetSource']) {
  switch (source) {
    case 'explicit-host':
      return 'Manual public host override';
    case 'app-origin':
      return 'Detected from IndexBlue app origin';
    case 'request-host':
      return 'Detected from current request host';
    case 'machine-public-ip':
      return 'Using CLI machine public IP fallback';
    default:
      return 'Public target unavailable';
  }
}

function buildExecutionAssistHints(activeTerminal: TerminalSessionState | null) {
  if (!activeTerminal) return [];

  const combinedText = `${activeTerminal.lastCommandError || ''}\n${activeTerminal.consoleOutput}\n${getCommandEventsText(activeTerminal.liveCommand)}`;
  const hints: Array<{ id: string; title: string; detail: string }> = [];

  if (/npm:\s+command not found/i.test(combinedText)) {
    hints.push({
      id: 'missing-npm',
      title: 'Node toolchain was missing from the shell environment',
      detail:
        'IndexCLI now bootstraps common profile files and NVM before remote commands. Re-run the command, and reconnect the agent if it was started before this update.',
    });
  }

  if (/EACCES|permission denied/i.test(combinedText)) {
    hints.push({
      id: 'permission-denied',
      title: 'Workspace ownership or permissions blocked the command',
      detail:
        'Retry with sudo enabled, or fix the directory owner with a command such as sudo chown -R <user>:<user> <project-path> before running npm install again.',
    });
  }

  return hints;
}

export function CloudInfraDetailPage({ infraId }: { infraId: string }) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'monitor' | 'execute' | 'filesystem' | 'sandboxes'>('monitor');
  const [terminals, setTerminals] = useState<TerminalSessionState[]>(() => [createTerminalSession(1)]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [terminalCounter, setTerminalCounter] = useState(1);
  const [fsPath, setFsPath] = useState('/');
  const [fsEntries, setFsEntries] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string; contentEncoding: string } | null>(
    null,
  );
  const [isFsBusy, setIsFsBusy] = useState(false);
  const [sandboxForm, setSandboxForm] = useState({
    name: '',
    rootPath: '',
    startCommand: '',
  });
  const [sudoPassword, setSudoPassword] = useState('');
  const [rememberSudoPassword, setRememberSudoPassword] = useState(true);
  const [requestForcePasswordless, setRequestForcePasswordless] = useState(false);
  const [isSavingSudo, setIsSavingSudo] = useState(false);
  const [sudoError, setSudoError] = useState<string | null>(null);
  const [previewDomainBase, setPreviewDomainBase] = useState('');
  const [hasEditedPreviewDomainBase, setHasEditedPreviewDomainBase] = useState(false);
  const [isSavingPreview, setIsSavingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const loadDetail = async () => {
    try {
      const payload = await requestJson<DetailResponse>(`/api/cloud/infra/${infraId}`, { cache: 'no-store' });
      setDetail(payload);
      if (!hasEditedPreviewDomainBase) {
        setPreviewDomainBase(payload.previewConfig.customPreviewDomainBase ?? '');
      }
      if (!fsPath || fsPath === '/') {
        const nextPath = typeof payload.infra.metadata?.cwd === 'string' ? payload.infra.metadata.cwd : '/';
        setFsPath(nextPath);
      }
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load infra details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
    const interval = window.setInterval(() => {
      void loadDetail();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [infraId, hasEditedPreviewDomainBase]);

  useEffect(() => {
    if (!activeTerminalId && terminals[0]?.id) {
      setActiveTerminalId(terminals[0].id);
    }
  }, [activeTerminalId, terminals]);

  const activeTerminal = useMemo(
    () => terminals.find((terminal) => terminal.id === activeTerminalId) ?? terminals[0] ?? null,
    [activeTerminalId, terminals],
  );

  const commandOutput = useMemo(
    () =>
      `${activeTerminal?.consoleOutput ?? ''}${getCommandEventsText(activeTerminal?.liveCommand)}` || '',
    [activeTerminal],
  );
  const executionAssistHints = useMemo(() => buildExecutionAssistHints(activeTerminal), [activeTerminal]);
  const sudoAuditEntries = useMemo(
    () => buildSudoAuditEntries(detail?.recentCommands ?? []).slice(0, 8),
    [detail?.recentCommands],
  );
  const previewTunnelSessionsByPort = useMemo(() => {
    const sessions = detail?.previewTunnel.recentSessions ?? [];
    const map = new Map<number, (typeof sessions)[number]>();

    for (const session of sessions) {
      const existing = map.get(session.port);
      if (!existing || new Date(session.lastActivityAt).getTime() > new Date(existing.lastActivityAt).getTime()) {
        map.set(session.port, session);
      }
    }

    return map;
  }, [detail?.previewTunnel.recentSessions]);
  const machineProfile = useMemo(() => {
    const metadata = detail?.infra.metadata ?? {};
    return {
      systemVendor: typeof metadata.systemVendor === 'string' ? metadata.systemVendor : null,
      productName: typeof metadata.productName === 'string' ? metadata.productName : null,
      cpuModel: typeof metadata.cpuModel === 'string' ? metadata.cpuModel : null,
      cpuArchitecture: typeof metadata.cpuArchitecture === 'string' ? metadata.cpuArchitecture : null,
      cpuLogicalCores: typeof metadata.cpuLogicalCores === 'number' ? metadata.cpuLogicalCores : null,
      cpuSpeedMHz: typeof metadata.cpuSpeedMHz === 'number' ? metadata.cpuSpeedMHz : null,
      memoryTotalBytes: typeof metadata.memoryTotalBytes === 'number' ? metadata.memoryTotalBytes : null,
      publicIp: typeof metadata.publicIp === 'string' ? metadata.publicIp : null,
      privateIpAddresses: Array.isArray(metadata.privateIpAddresses)
        ? metadata.privateIpAddresses.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [],
      privateIpEntries: Array.isArray(metadata.privateIpEntries)
        ? metadata.privateIpEntries
            .filter(
              (
                value,
              ): value is {
                interface?: string | null;
                family?: string | number | null;
                address: string;
              } =>
                Boolean(value && typeof value === 'object' && typeof (value as { address?: string }).address === 'string'),
            )
            .map((value) => ({
              interface: typeof value.interface === 'string' ? value.interface : null,
              family: typeof value.family === 'string' || typeof value.family === 'number' ? value.family : null,
              address: value.address,
            }))
        : [],
      gpuDevices: Array.isArray(metadata.gpuDevices)
        ? metadata.gpuDevices
            .filter((value): value is { name: string; vendor?: string | null } => Boolean(value && typeof value === 'object' && typeof (value as { name?: string }).name === 'string'))
            .map((value) => ({
              name: value.name,
              vendor: typeof value.vendor === 'string' ? value.vendor : null,
            }))
        : [],
    };
  }, [detail?.infra.metadata]);

  const updateTerminal = (terminalId: string, updater: (terminal: TerminalSessionState) => TerminalSessionState) => {
    setTerminals((current) =>
      current.map((terminal) => (terminal.id === terminalId ? updater(terminal) : terminal)),
    );
  };

  const createCommand = async (type: string, payload: Record<string, unknown> = {}) => {
    return await requestJson<{ command: { id: string } }>(`/api/cloud/infra/${infraId}/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, payload }),
    });
  };

  const waitForCommand = async (commandId: string, onUpdate?: (command: RemoteCommand) => void) => {
    while (true) {
      const payload = await requestJson<{ command: RemoteCommand }>(`/api/cloud/infra/${infraId}/commands/${commandId}`, {
        cache: 'no-store',
      });
      onUpdate?.(payload.command);
      if (
        payload.command.status === 'completed' ||
        payload.command.status === 'failed' ||
        payload.command.status === 'cancelled'
      ) {
        return payload.command;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  };

  const runCommand = async (type: string, payload: Record<string, unknown>, onUpdate?: (command: RemoteCommand) => void) => {
    const created = await createCommand(type, payload);
    onUpdate?.({
      id: created.command.id,
      status: 'queued',
      result: {},
      errorMessage: null,
      events: [],
    });
    return await waitForCommand(created.command.id, onUpdate);
  };

  const handleExec = async () => {
    if (!activeTerminal) return;
    const submittedCommand = activeTerminal.commandInput.trim();

    updateTerminal(activeTerminal.id, (terminal) => ({
      ...terminal,
      isRunning: true,
      isCancelling: false,
      consoleOutput: appendConsoleText(
        terminal.consoleOutput,
        `\n$ ${submittedCommand || terminal.commandInput}\n`,
      ),
      liveCommand: null,
      lastCommandStatus: 'queued',
      lastCommandError: null,
    }));
    try {
      const finalCommand = await runCommand('exec', {
        command: activeTerminal.commandInput,
        sudo: activeTerminal.runAsSudo,
        cwd: typeof detail?.infra.metadata?.cwd === 'string' ? detail?.infra.metadata.cwd : undefined,
      }, (command) => {
        updateTerminal(activeTerminal.id, (terminal) => ({
          ...terminal,
          liveCommand: command,
          lastCommandStatus: command.status,
          lastCommandError: command.errorMessage,
        }));
      });

      updateTerminal(activeTerminal.id, (terminal) => ({
        ...terminal,
        consoleOutput: appendConsoleText(
          terminal.consoleOutput,
          `${getCommandEventsText(finalCommand)}${formatTerminalCommandFooter(finalCommand)}`,
        ),
        liveCommand: null,
        lastCommandStatus: finalCommand.status,
        lastCommandError: finalCommand.errorMessage,
      }));
      await loadDetail();
    } finally {
      updateTerminal(activeTerminal.id, (terminal) => ({
        ...terminal,
        isRunning: false,
        isCancelling: false,
      }));
    }
  };

  const cancelActiveCommand = async () => {
    if (!activeTerminal?.liveCommand?.id) return;

    updateTerminal(activeTerminal.id, (terminal) => ({
      ...terminal,
      isCancelling: true,
    }));

    try {
      const payload = await requestJson<{ command: RemoteCommand }>(
        `/api/cloud/infra/${infraId}/commands/${activeTerminal.liveCommand.id}`,
        { method: 'DELETE' },
      );

      updateTerminal(activeTerminal.id, (terminal) => ({
        ...terminal,
        liveCommand: {
          ...(terminal.liveCommand ?? {
            id: payload.command.id,
            status: payload.command.status,
            result: {},
            errorMessage: null,
            events: [],
          }),
          ...payload.command,
          events: terminal.liveCommand?.events ?? [],
        },
      }));

      await loadDetail();
    } finally {
      updateTerminal(activeTerminal.id, (terminal) => ({
        ...terminal,
        isRunning: false,
        isCancelling: false,
      }));
    }
  };

  const addTerminal = () => {
    const nextIndex = terminalCounter + 1;
    const nextTerminal = createTerminalSession(nextIndex);
    setTerminals((current) => [...current, nextTerminal]);
    setActiveTerminalId(nextTerminal.id);
    setTerminalCounter(nextIndex);
  };

  const closeTerminal = async (terminalId: string) => {
    const terminal = terminals.find((entry) => entry.id === terminalId);
    if (!terminal) return;

    if (terminal.liveCommand?.id && (terminal.liveCommand.status === 'running' || terminal.liveCommand.status === 'queued')) {
      await requestJson(`/api/cloud/infra/${infraId}/commands/${terminal.liveCommand.id}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }

    const filtered = terminals.filter((entry) => entry.id !== terminalId);
    if (filtered.length === 0) {
      const fallbackTerminal = createTerminalSession(1);
      setTerminals([fallbackTerminal]);
      setActiveTerminalId(fallbackTerminal.id);
      setTerminalCounter(Math.max(terminalCounter, 1));
      return;
    }

    setTerminals(filtered);
    if (activeTerminalId === terminalId) {
      setActiveTerminalId(filtered[0]?.id ?? null);
    }
  };

  const clearActiveTerminalOutput = () => {
    if (!activeTerminal) return;
    updateTerminal(activeTerminal.id, (terminal) => ({
      ...terminal,
      consoleOutput: '',
      liveCommand: terminal.isRunning ? terminal.liveCommand : null,
      lastCommandError: terminal.isRunning ? terminal.lastCommandError : null,
      lastCommandStatus: terminal.isRunning ? terminal.lastCommandStatus : null,
    }));
  };

  const loadDirectory = async (targetPath = fsPath) => {
    setIsFsBusy(true);
    try {
      const command = await runCommand('fs:list', { path: targetPath });
      const entries = Array.isArray(command.result.entries) ? (command.result.entries as FileEntry[]) : [];
      setFsEntries(entries);
      setFsPath(targetPath);
    } finally {
      setIsFsBusy(false);
    }
  };

  useEffect(() => {
    if (!detail || activeTab !== 'filesystem') return;
    void loadDirectory(fsPath);
  }, [detail, activeTab]);

  const openFile = async (targetPath: string) => {
    setIsFsBusy(true);
    try {
      const command = await runCommand('fs:read', { path: targetPath });
      setSelectedFile({
        path: targetPath,
        content: typeof command.result.content === 'string' ? command.result.content : '',
        contentEncoding: typeof command.result.contentEncoding === 'string' ? command.result.contentEncoding : 'utf8',
      });
    } finally {
      setIsFsBusy(false);
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setIsFsBusy(true);
    try {
      await runCommand('fs:write', {
        path: selectedFile.path,
        content: selectedFile.content,
        contentEncoding: selectedFile.contentEncoding,
      });
      await loadDirectory(fsPath);
    } finally {
      setIsFsBusy(false);
    }
  };

  const uploadFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const isText = file.type.startsWith('text/') || file.name.match(/\.(json|ts|tsx|js|jsx|md|txt|css|html|yml|yaml)$/i);
    const targetPath = `${fsPath.replace(/\/$/, '')}/${file.name}`.replace(/^\/\//, '/');
    const content = isText ? new TextDecoder().decode(buffer) : arrayBufferToBase64(buffer);
    await runCommand('fs:write', {
      path: targetPath,
      content,
      contentEncoding: isText ? 'utf8' : 'base64',
    });
    await loadDirectory(fsPath);
  };

  const downloadSelectedFile = () => {
    if (!selectedFile) return;
    const href =
      selectedFile.contentEncoding === 'base64'
        ? `data:application/octet-stream;base64,${selectedFile.content}`
        : URL.createObjectURL(new Blob([selectedFile.content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = selectedFile.path.split('/').pop() || 'download.txt';
    anchor.click();
    if (selectedFile.contentEncoding !== 'base64') {
      URL.revokeObjectURL(href);
    }
  };

  const handleSandboxAction = async (type: string, slug?: string) => {
    await runCommand(type, {
      sandbox: slug ? { slug } : undefined,
    });
    await loadDetail();
  };

  const handleSandboxCreate = async () => {
    await runCommand('sandbox:create', {
      sandbox: {
        name: sandboxForm.name,
        rootPath: sandboxForm.rootPath,
        startCommand: sandboxForm.startCommand || null,
      },
    });
    setSandboxForm({ name: '', rootPath: '', startCommand: '' });
    await loadDetail();
  };

  const deleteSelectedFile = async () => {
    if (!selectedFile) return;
    setIsFsBusy(true);
    try {
      await runCommand('fs:delete', { path: selectedFile.path });
      setSelectedFile(null);
      await loadDirectory(fsPath);
    } finally {
      setIsFsBusy(false);
    }
  };

  const saveSudoConfiguration = async () => {
    setIsSavingSudo(true);
    setSudoError(null);
    try {
      await runCommand('sudo:configure', {
        password: sudoPassword || undefined,
        rememberPassword: rememberSudoPassword,
        clearStoredPassword: sudoPassword.trim().length === 0,
        forcePasswordless: requestForcePasswordless,
      });
      setSudoPassword('');
      await loadDetail();
    } catch (saveError) {
      setSudoError(saveError instanceof Error ? saveError.message : 'Failed to update sudo configuration.');
    } finally {
      setIsSavingSudo(false);
    }
  };

  const clearStoredSudoPassword = async () => {
    setIsSavingSudo(true);
    setSudoError(null);
    try {
      await runCommand('sudo:configure', {
        clearStoredPassword: true,
        rememberPassword: false,
      });
      setSudoPassword('');
      await loadDetail();
    } catch (saveError) {
      setSudoError(saveError instanceof Error ? saveError.message : 'Failed to clear stored sudo password.');
    } finally {
      setIsSavingSudo(false);
    }
  };

  const savePreviewDomainBase = async () => {
    setIsSavingPreview(true);
    setPreviewError(null);
    try {
      setHasEditedPreviewDomainBase(false);
      await requestJson(`/api/cloud/infra/${infraId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          previewDomainBase: previewDomainBase.trim().length > 0 ? previewDomainBase.trim() : null,
        }),
      });
      await loadDetail();
    } catch (saveError) {
      setPreviewError(saveError instanceof Error ? saveError.message : 'Failed to update preview DNS settings.');
    } finally {
      setIsSavingPreview(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return <div className="text-sm text-destructive">{error || 'Infra detail unavailable.'}</div>;
  }

  const latest = detail.infra.latestMetrics;
  const sudoState = {
    available: detail.infra.metadata?.sudoAvailable === true,
    passwordless: detail.infra.metadata?.sudoPasswordless === true,
    isRoot: detail.infra.metadata?.sudoIsRoot === true,
    storedPassword: detail.infra.metadata?.storedSudoPassword === true,
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[32px] border border-border/60 bg-card/40 shadow-[0_24px_80px_rgba(0,0,0,0.16)]">
        <div className="relative flex flex-wrap items-center justify-between gap-4 p-6 sm:p-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_42%)]" />

          <div className="relative space-y-2">
            <Button asChild variant="ghost" className="gap-2 px-0 text-muted-foreground hover:text-foreground">
              <Link href="/cloud-infrastructure">
                <ArrowLeft className="h-4 w-4" />
                Back to Cloud Infrastructure
              </Link>
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">{detail.infra.name}</h1>
              <Badge variant={detail.infra.status === 'online' ? 'default' : 'secondary'}>{detail.infra.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {detail.infra.hostname || 'Unknown host'} • {detail.infra.platform || 'unknown'} {detail.infra.arch || ''}
            </p>
          </div>

          <div className="relative flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" className="gap-2 rounded-2xl">
              <Link href="/settings?tab=platform-api">
                <ShieldCheck className="h-4 w-4" />
                Platform Keys
              </Link>
            </Button>
            <QuickStat label="Latency" value={detail.infra.latencyMs ? `${detail.infra.latencyMs} ms` : 'N/A'} />
            <QuickStat label="Transferred" value={formatBytes(detail.usage.totalDataTransferred)} />
            <QuickStat label="Uptime" value={latest ? formatUptime(latest.uptimeSeconds) : 'N/A'} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border/60 bg-card/35 p-2">
        {[
          { value: 'monitor', label: 'Monitor', icon: Server },
          { value: 'execute', label: 'Execution', icon: Terminal },
          { value: 'filesystem', label: 'Filesystem', icon: FolderOpen },
          { value: 'sandboxes', label: 'Sandboxes', icon: Square },
        ].map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            variant={activeTab === value ? 'default' : 'ghost'}
            className="gap-2 rounded-xl"
            onClick={() => setActiveTab(value as typeof activeTab)}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Button>
        ))}
      </div>

      {activeTab === 'monitor' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Real-time health chart</CardTitle>
              <CardDescription>CPU and memory usage sampled from the connected CLI heartbeat.</CardDescription>
            </CardHeader>
            <CardContent>
              <CloudMetricChart data={detail.metrics.map((metric) => ({ createdAt: metric.createdAt, cpuPercent: metric.cpuPercent, memoryPercent: metric.memoryPercent }))} />
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Usage stats</CardTitle>
              <CardDescription>Observed command volume, file operations, and connection quality.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <MonitorMetric label="CPU" value={latest ? `${latest.cpuPercent.toFixed(0)}%` : 'N/A'} progress={latest?.cpuPercent ?? 0} />
              <MonitorMetric label="Memory" value={latest ? `${latest.memoryPercent.toFixed(0)}%` : 'N/A'} progress={latest?.memoryPercent ?? 0} />
              <div className="grid gap-3 sm:grid-cols-2">
                <QuickStat label="Commands" value={String(detail.usage.totalCommands)} />
                <QuickStat label="Filesystem Ops" value={String(detail.usage.totalFsOps)} />
                <QuickStat label="Processes" value={String(latest?.processCount ?? 0)} />
                <QuickStat label="Sandboxes" value={String(latest?.sandboxCount ?? 0)} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Sudo capability</CardTitle>
              <CardDescription>Root capability indicators reported by the connected CLI agent.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <CapabilityBadge active={sudoState.available} label="Sudo Available" />
                <CapabilityBadge active={sudoState.passwordless} label="Passwordless" />
                <CapabilityBadge active={sudoState.isRoot} label="Root Session" />
                <CapabilityBadge active={sudoState.storedPassword} label="Stored Password" />
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Passwordless shows whether the machine already has password-free sudo. Stored Password means the CLI
                has an encrypted local sudo secret cached on that machine for future remote commands.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40 xl:col-span-2">
            <CardHeader>
              <CardTitle>Machine profile</CardTitle>
              <CardDescription>
                Hardware, vendor, and network identity reported by the connected CLI machine.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Hardware</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <QuickStat label="Vendor" value={machineProfile.systemVendor || 'Unknown'} />
                  <QuickStat label="Product" value={machineProfile.productName || 'Unknown'} />
                  <QuickStat label="CPU" value={machineProfile.cpuModel || 'Unknown'} />
                  <QuickStat
                    label="CPU Threads"
                    value={machineProfile.cpuLogicalCores ? String(machineProfile.cpuLogicalCores) : 'Unknown'}
                  />
                  <QuickStat label="Architecture" value={machineProfile.cpuArchitecture || detail.infra.arch || 'Unknown'} />
                  <QuickStat
                    label="Memory"
                    value={machineProfile.memoryTotalBytes ? formatBytes(machineProfile.memoryTotalBytes) : 'Unknown'}
                  />
                </div>
                <div className="mt-4 rounded-2xl border border-border/60 bg-card/35 p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">GPU Devices</div>
                  {machineProfile.gpuDevices.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {machineProfile.gpuDevices.map((gpu) => (
                        <Badge key={`${gpu.vendor || 'gpu'}-${gpu.name}`} variant="outline" className="max-w-full truncate">
                          {gpu.vendor ? `${gpu.vendor} ` : ''}
                          {gpu.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No GPU details detected yet on this machine.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Network Identity</div>
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Public IP</div>
                    <div className="mt-1 font-mono text-sm text-foreground">{machineProfile.publicIp || 'Detecting...'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Private IPs</div>
                    {machineProfile.privateIpAddresses.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {machineProfile.privateIpAddresses.map((address) => (
                          <Badge key={address} variant="secondary" className="font-mono">
                            {address}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No private IP addresses detected.</p>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Network interfaces</div>
                    {machineProfile.privateIpEntries.length > 0 ? (
                      <div className="mt-2 overflow-hidden rounded-xl border border-border/60">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Interface</TableHead>
                              <TableHead>Family</TableHead>
                              <TableHead>Address</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {machineProfile.privateIpEntries.map((entry) => (
                              <TableRow key={`${entry.interface || 'iface'}-${entry.address}`}>
                                <TableCell className="font-mono text-xs">{entry.interface || 'unknown'}</TableCell>
                                <TableCell className="font-mono text-xs">{entry.family ? String(entry.family) : 'n/a'}</TableCell>
                                <TableCell className="font-mono text-xs">{entry.address}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">Interface-level address details are not available yet.</p>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <QuickStat label="Hostname" value={detail.infra.hostname || 'Unknown'} />
                    <QuickStat label="Platform" value={detail.infra.platform || 'Unknown'} />
                    <QuickStat label="Release" value={detail.infra.release || 'Unknown'} />
                    <QuickStat
                      label="CPU Speed"
                      value={machineProfile.cpuSpeedMHz ? `${machineProfile.cpuSpeedMHz} MHz` : 'Unknown'}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40 xl:col-span-2">
            <CardHeader>
              <CardTitle>Preview tunnel status</CardTitle>
              <CardDescription>
                Live WebSocket and HMR bridge activity for remote preview URLs on this machine.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <CapabilityBadge active={detail.previewTunnel.openSessionCount > 0} label="HMR Active" />
                <CapabilityBadge active={detail.previewTunnel.activeSessionCount > 0} label="Tunnel Connected" />
                <CapabilityBadge active={detail.previewTunnel.openingSessionCount > 0} label="Handshake Pending" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <QuickStat label="Open Sessions" value={String(detail.previewTunnel.openSessionCount)} />
                <QuickStat label="Active Sessions" value={String(detail.previewTunnel.activeSessionCount)} />
                <QuickStat label="Recent Sessions" value={String(detail.previewTunnel.recentSessions.length)} />
                <QuickStat label="Last Activity" value={formatTimestamp(detail.previewTunnel.lastActivityAt)} />
              </div>

              {detail.previewTunnel.lastSession ? (
                <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          Last WebSocket session on port {detail.previewTunnel.lastSession.port}
                        </p>
                        <Badge variant={getPreviewTunnelStatusVariant(detail.previewTunnel.lastSession.state)}>
                          {detail.previewTunnel.lastSession.state}
                        </Badge>
                        <Badge variant="outline">
                          {detail.previewTunnel.lastSession.negotiatedProtocol || detail.previewTunnel.lastSession.requestedProtocol}
                        </Badge>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">
                        {detail.previewTunnel.lastSession.pathname}
                        {detail.previewTunnel.lastSession.search}
                      </p>
                      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                        <div>Opened: {formatTimestamp(detail.previewTunnel.lastSession.openedAt || detail.previewTunnel.lastSession.createdAt)}</div>
                        <div>Browser messages: {detail.previewTunnel.lastSession.browserMessageCount}</div>
                        <div>Agent messages: {detail.previewTunnel.lastSession.agentMessageCount}</div>
                        <div>Last browser event: {formatTimestamp(detail.previewTunnel.lastSession.lastBrowserMessageAt)}</div>
                        <div>Last agent event: {formatTimestamp(detail.previewTunnel.lastSession.lastAgentMessageAt)}</div>
                        <div>Session ID: <span className="font-mono text-foreground">{detail.previewTunnel.lastSession.sessionId.slice(0, 12)}</span></div>
                      </div>
                      {detail.previewTunnel.lastSession.lastErrorMessage ? (
                        <p className="text-sm text-destructive">
                          Last error: {detail.previewTunnel.lastSession.lastErrorMessage}
                        </p>
                      ) : null}
                      {detail.previewTunnel.lastSession.lastCloseAt ? (
                        <p className="text-xs text-muted-foreground">
                          Closed {formatTimestamp(detail.previewTunnel.lastSession.lastCloseAt)}
                          {detail.previewTunnel.lastSession.lastCloseCode
                            ? ` with code ${detail.previewTunnel.lastSession.lastCloseCode}`
                            : ''}
                          {detail.previewTunnel.lastSession.lastCloseReason
                            ? ` (${detail.previewTunnel.lastSession.lastCloseReason})`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 p-6 text-sm text-muted-foreground">
                  No preview websocket sessions have been observed yet. Open a preview URL that uses HMR or another browser WebSocket connection and the tunnel diagnostics will appear here.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40 xl:col-span-2">
            <CardHeader>
              <CardTitle>Preview URLs</CardTitle>
              <CardDescription>
                Live application previews detected on this machine. Open the path URL immediately, or use the custom-domain host after DNS is configured.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {detail.previews.length > 0 ? (
                <div className="space-y-3">
                  {detail.previews.map((preview) => (
                    <div key={`${preview.port}-${preview.url}`} className="rounded-2xl border border-border/60 bg-background/50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{preview.label || `Port ${preview.port}`}</p>
                            <Badge variant="secondary">{preview.protocol || 'http'}</Badge>
                            <Badge variant="outline">:{preview.port}</Badge>
                            {previewTunnelSessionsByPort.get(preview.port) ? (
                              <Badge variant={getPreviewTunnelStatusVariant(previewTunnelSessionsByPort.get(preview.port)?.state || 'closed')}>
                                {previewTunnelSessionsByPort.get(preview.port)?.state === 'open' ? 'HMR Active' : 'Tunnel Seen'}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {preview.processName || 'Detected preview process'} {preview.source ? `• ${preview.source}` : ''}
                          </p>
                          {previewTunnelSessionsByPort.get(preview.port) ? (
                            <p className="text-xs text-muted-foreground">
                              Last WS activity {formatTimestamp(previewTunnelSessionsByPort.get(preview.port)?.lastActivityAt || null)}
                            </p>
                          ) : null}
                          <div className="space-y-1 text-xs">
                            <div className="font-mono text-foreground">{preview.pathUrl}</div>
                            {preview.hostUrl ? (
                              <div className="font-mono text-muted-foreground">{preview.hostUrl}</div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" className="gap-2">
                            <a href={preview.pathUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" />
                              Open
                            </a>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => void copyText(preview.hostUrl || preview.pathUrl)}
                          >
                            <Copy className="h-4 w-4" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 p-6 text-sm text-muted-foreground">
                  No web preview ports are active right now. Start a dev server such as <code>npm run dev</code>, <code>npm start</code>, or <code>npm run preview</code> and this list will populate automatically.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40 xl:col-span-2">
            <CardHeader>
              <CardTitle>Preview DNS</CardTitle>
              <CardDescription>
                Give this machine its own wildcard preview host. Use your DNS provider to point a wildcard record at IndexBlue, then previews can open on your custom subdomain pattern.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="preview-domain-base">Custom preview domain base</Label>
                <Input
                  id="preview-domain-base"
                  value={previewDomainBase}
                  onChange={(event) => {
                    setHasEditedPreviewDomainBase(true);
                    setPreviewDomainBase(event.target.value);
                  }}
                  placeholder="dev.example.com"
                />
                <p className="text-xs text-muted-foreground">
                  Example preview host pattern: <span className="font-mono">{detail.previewConfig.wildcardHostPattern}</span>
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Globe className="h-4 w-4" />
                    Routing summary
                  </div>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={detail.previewConfig.domainStatus.connected ? 'default' : 'secondary'}>
                        {detail.previewConfig.domainStatus.connected ? 'Domain connected' : 'Domain not connected'}
                      </Badge>
                      <Badge variant={detail.previewConfig.domainStatus.dnsResolved ? 'default' : 'secondary'}>
                        DNS {detail.previewConfig.domainStatus.dnsResolved ? 'resolved' : 'pending'}
                      </Badge>
                      <Badge variant={detail.previewConfig.domainStatus.httpReachable ? 'default' : 'secondary'}>
                        Gateway {detail.previewConfig.domainStatus.httpReachable ? 'reachable' : 'unreachable'}
                      </Badge>
                      <Badge variant={detail.previewConfig.domainStatus.proxyDetected ? 'default' : 'secondary'}>
                        Proxy route {detail.previewConfig.domainStatus.proxyDetected ? 'detected' : 'missing'}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Wildcard host</div>
                      <div className="mt-1 font-mono text-xs text-foreground">{detail.previewConfig.wildcardHostPattern}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Target host</div>
                      <div className="mt-1 font-mono text-xs text-foreground">
                        {detail.previewConfig.dnsTargetHost || 'Public IndexBlue host not detected yet'}
                      </div>
                      <div className="mt-2 inline-flex rounded-full border border-border/60 bg-card/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {getDnsTargetSourceLabel(detail.previewConfig.dnsTargetSource)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Example preview URL</div>
                      <div className="mt-1 font-mono text-xs text-foreground break-all">
                        {detail.previewConfig.domainStatus.probeUrl || 'Preview host URL will appear after a domain is configured.'}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <QuickStat
                        label="Gateway Port"
                        value={detail.previewConfig.domainStatus.gatewayPort ? String(detail.previewConfig.domainStatus.gatewayPort) : 'N/A'}
                      />
                      <QuickStat
                        label="Last Check"
                        value={formatTimestamp(detail.previewConfig.domainStatus.checkedAt)}
                      />
                    </div>
                    {detail.previewConfig.domainStatus.resolvedAddresses.length > 0 ? (
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Resolved Addresses</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {detail.previewConfig.domainStatus.resolvedAddresses.map((address) => (
                            <Badge key={address} variant="secondary" className="font-mono">
                              {address}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <p className="text-xs leading-6 text-muted-foreground">
                      Use a wildcard record so every preview port automatically resolves, for example
                      <span className="font-mono text-foreground"> 3000--{infraId}.{previewDomainBase || 'your-domain.example.com'}</span>.
                    </p>
                    {detail.previewConfig.domainStatus.gatewayPort &&
                    detail.previewConfig.domainStatus.gatewayPort !== 80 &&
                    detail.previewConfig.domainStatus.gatewayPort !== 443 ? (
                      <p className="text-xs leading-6 text-amber-200/90">
                        This IndexBlue deployment is currently exposed on port {detail.previewConfig.domainStatus.gatewayPort},
                        so host-based preview links also need that port until you place the app behind a standard 80/443 reverse proxy.
                      </p>
                    ) : null}
                    {detail.previewConfig.dnsTargetSource === 'machine-public-ip' ? (
                      <p className="text-xs leading-6 text-amber-200/90">
                        This value is coming from the connected CLI machine&apos;s public IP fallback. For the most stable
                        production routing, point <code>CLOUD_PREVIEW_TARGET_HOST</code> or your app URL env vars at the
                        public IndexBlue host when available.
                      </p>
                    ) : null}
                    {detail.previewConfig.domainStatus.issues.length > 0 ? (
                      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-amber-100/90">Support notes</div>
                        <div className="mt-2 space-y-2 text-xs leading-6 text-amber-100/85">
                          {detail.previewConfig.domainStatus.issues.map((issue) => (
                            <p key={issue}>{issue}</p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Globe className="h-4 w-4" />
                      DNS records
                    </div>
                    <Badge
                      variant={
                        detail.previewConfig.dnsRecords.length === 0
                          ? 'secondary'
                          : detail.previewConfig.dnsRecords.every((record) => record.status === 'ready')
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {detail.previewConfig.dnsRecords.length === 0
                        ? 'Add a domain'
                        : detail.previewConfig.dnsRecords.every((record) => record.status === 'ready')
                          ? 'Ready to add'
                          : 'Needs public host'}
                    </Badge>
                  </div>

                  {detail.previewConfig.dnsRecords.length > 0 ? (
                    <div className="mt-4 overflow-hidden rounded-xl border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.previewConfig.dnsRecords.map((record) => (
                            <TableRow key={`${record.type}-${record.name}-${record.value}`}>
                              <TableCell className="font-mono">{record.type}</TableCell>
                              <TableCell className="font-mono">{record.name}</TableCell>
                              <TableCell className="font-mono">{record.value}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Add a custom preview domain base first. Path-based preview links work immediately even without DNS.
                    </p>
                  )}

                  {detail.previewConfig.dnsRecords[0]?.note ? (
                    <p className="mt-3 text-xs leading-6 text-amber-200/90">
                      {detail.previewConfig.dnsRecords[0].note}
                    </p>
                  ) : null}
                </div>
              </div>

              {previewError ? <p className="text-sm text-destructive">{previewError}</p> : null}

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void savePreviewDomainBase()} disabled={isSavingPreview} className="gap-2">
                  {isSavingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save preview DNS
                </Button>
                {detail.previewConfig.dnsRecords.length > 0 ? (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() =>
                      void copyText(
                        detail.previewConfig.dnsRecords
                          .map((record) => `${record.type} ${record.name} ${record.value}`)
                          .join('\n'),
                      )
                    }
                  >
                    <Copy className="h-4 w-4" />
                    Copy DNS records
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40 xl:col-span-2">
            <CardHeader>
              <CardTitle>Sudo audit log</CardTitle>
              <CardDescription>
                Recent dashboard-side sudo configuration changes for this machine, including blocked passwordless requests.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sudoAuditEntries.length > 0 ? (
                <div className="space-y-3">
                  {sudoAuditEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-2xl border border-border/60 bg-background/50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                            <Badge variant={getCommandStatusVariant(entry.status)}>{entry.status}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{entry.detail}</p>
                          <p className="text-xs text-muted-foreground">Triggered by {entry.actorLabel}</p>
                          {entry.resultSummary ? (
                            <p className="text-xs text-foreground/80">{entry.resultSummary}</p>
                          ) : null}
                          {entry.errorMessage ? (
                            <p className="text-sm text-destructive">{entry.errorMessage}</p>
                          ) : null}
                        </div>
                        <div className="text-right text-xs leading-5 text-muted-foreground">
                          <div>{formatTimestamp(entry.createdAt)}</div>
                          <div>{entry.completedAt ? `Finished ${formatTimestamp(entry.completedAt)}` : 'Pending completion'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 p-6 text-sm text-muted-foreground">
                  No sudo configuration changes have been made from the dashboard yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Process monitor</CardTitle>
              <CardDescription>Live process snapshot from the connected machine.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[320px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PID</TableHead>
                      <TableHead>CPU</TableHead>
                      <TableHead>Memory</TableHead>
                      <TableHead>Command</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.infra.latestProcesses.map((processRow) => (
                      <TableRow key={`${processRow.pid}-${processRow.command}`}>
                        <TableCell>{processRow.pid}</TableCell>
                        <TableCell>{processRow.cpuPercent.toFixed(1)}%</TableCell>
                        <TableCell>{processRow.memoryPercent.toFixed(1)}%</TableCell>
                        <TableCell className="max-w-[420px] truncate">{processRow.command}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Sandbox start rate</CardTitle>
              <CardDescription>How often sandboxes have been started or restarted in the last 24 hours.</CardDescription>
            </CardHeader>
            <CardContent>
              <CloudStartRateChart data={detail.startRate} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === 'execute' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Process & Code Execution</CardTitle>
              <CardDescription>Run any shell command remotely and stream the output back live.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/40 p-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
                {terminals.map((terminal) => (
                  <div
                    key={terminal.id}
                    className={`group flex items-center gap-1 rounded-xl border px-1 py-1 transition ${
                      activeTerminal?.id === terminal.id
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'border-border/50 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground'
                    }`}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 rounded-xl"
                      onClick={() => setActiveTerminalId(terminal.id)}
                    >
                      <Terminal className="h-4 w-4" />
                      {terminal.label}
                      {terminal.isRunning ? <Badge variant="secondary">Running</Badge> : null}
                    </Button>
                    {terminals.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground transition group-hover:text-foreground"
                        onClick={() => void closeTerminal(terminal.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
                </div>
                <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={addTerminal}>
                  <Plus className="h-4 w-4" />
                  New terminal
                </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 rounded-xl"
                    onClick={clearActiveTerminalOutput}
                    disabled={!activeTerminal || activeTerminal.isRunning || commandOutput.length === 0}
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <QuickStat label="Active Terminal" value={activeTerminal?.label || 'None'} />
                <QuickStat
                  label="Status"
                  value={
                    activeTerminal?.isRunning
                      ? activeTerminal.isCancelling
                        ? 'Cancelling'
                        : 'Running'
                      : activeTerminal?.lastCommandStatus || 'Idle'
                  }
                />
                <QuickStat
                  label="Mode"
                  value={activeTerminal?.runAsSudo ? 'sudo enabled' : 'standard shell'}
                />
              </div>

              <Textarea
                value={activeTerminal?.commandInput ?? ''}
                onChange={(event) => {
                  if (!activeTerminal) return;
                  updateTerminal(activeTerminal.id, (terminal) => ({
                    ...terminal,
                    commandInput: event.target.value,
                  }));
                }}
                className="min-h-[120px] font-mono text-sm"
              />
              <label className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/50 px-4 py-3 text-sm text-foreground">
                <Checkbox
                  checked={activeTerminal?.runAsSudo ?? false}
                  onCheckedChange={(value) => {
                    if (!activeTerminal) return;
                    updateTerminal(activeTerminal.id, (terminal) => ({
                      ...terminal,
                      runAsSudo: Boolean(value),
                    }));
                  }}
                />
                <span>Run with sudo using passwordless sudo or the remembered password on the machine.</span>
              </label>
              <div className="flex gap-3">
                <Button onClick={() => void handleExec()} disabled={!activeTerminal || activeTerminal.isRunning} className="gap-2">
                  {activeTerminal?.isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Run remotely
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => void copyText(activeTerminal?.commandInput ?? '')}
                  disabled={!activeTerminal}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={
                    !activeTerminal?.liveCommand ||
                    activeTerminal.isCancelling ||
                    (activeTerminal.liveCommand.status !== 'running' && activeTerminal.liveCommand.status !== 'queued')
                  }
                  onClick={() => void cancelActiveCommand()}
                >
                  {activeTerminal?.isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                  Cancel command
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Sudo configuration</CardTitle>
              <CardDescription>
                Save an encrypted sudo password on the connected machine so future remote sudo commands do not prompt repeatedly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sudo-password">Sudo password</Label>
                <Input
                  id="sudo-password"
                  type="password"
                  value={sudoPassword}
                  onChange={(event) => setSudoPassword(event.target.value)}
                  placeholder="Enter sudo password to remember on this machine"
                />
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/50 px-4 py-3 text-sm text-foreground">
                <Checkbox
                  checked={rememberSudoPassword}
                  onCheckedChange={(value) => setRememberSudoPassword(Boolean(value))}
                />
                <span>Remember this password in the local CLI config so remote sudo commands can reuse it.</span>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-foreground">
                <Checkbox
                  checked={requestForcePasswordless}
                  onCheckedChange={(value) => setRequestForcePasswordless(Boolean(value))}
                />
                <span>
                  Force passwordless sudo by writing a blanket <code>NOPASSWD:ALL</code> sudoers entry.
                  IndexBlue blocks this request for host safety.
                </span>
              </label>

              {sudoError ? <p className="text-sm text-destructive">{sudoError}</p> : null}

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void saveSudoConfiguration()} disabled={isSavingSudo} className="gap-2">
                  {isSavingSudo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Save sudo config
                </Button>
                <Button variant="outline" onClick={() => void clearStoredSudoPassword()} disabled={isSavingSudo} className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Clear stored password
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-[#090b10] text-white shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-white">Live output</CardTitle>
                  <CardDescription className="text-white/60">
                    {activeTerminal?.isRunning
                      ? `${activeTerminal.label} status: ${activeTerminal.liveCommand?.status || 'running'}`
                      : activeTerminal?.lastCommandStatus
                        ? `${activeTerminal.label} status: ${activeTerminal.lastCommandStatus}`
                        : 'No command running yet'}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeTerminal?.lastCommandStatus ? (
                    <Badge variant={getCommandStatusVariant(activeTerminal.lastCommandStatus)}>
                      {activeTerminal.lastCommandStatus}
                    </Badge>
                  ) : null}
                  {activeTerminal?.runAsSudo ? <Badge variant="secondary">sudo</Badge> : null}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[340px] rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-xs">
                <pre className="whitespace-pre-wrap break-words text-white/90">{commandOutput || 'Run a command to see output.'}</pre>
              </ScrollArea>
              {activeTerminal?.lastCommandError ? (
                <p className="mt-3 text-xs text-red-300">{activeTerminal.lastCommandError}</p>
              ) : null}
              {executionAssistHints.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {executionAssistHints.map((hint) => (
                    <div key={hint.id} className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/90">
                        {hint.title}
                      </div>
                      <p className="mt-2 text-xs leading-6 text-amber-100/80">{hint.detail}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === 'filesystem' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Filesystem Operations</CardTitle>
              <CardDescription>Browse directories, inspect files, and upload new content to the machine.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={fsPath} onChange={(event) => setFsPath(event.target.value)} />
                <Button variant="outline" onClick={() => void loadDirectory(fsPath)} disabled={isFsBusy} className="gap-2">
                  {isFsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                  Load
                </Button>
              </div>
              <div className="flex gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-sm text-foreground">
                  <Upload className="h-4 w-4" />
                  Upload
                  <input
                    type="file"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void uploadFile(file);
                      }
                    }}
                  />
                </label>
              </div>
              <ScrollArea className="h-[360px] rounded-xl border border-border/60 bg-background/60">
                <div className="divide-y divide-border/40">
                  {fsEntries.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() =>
                        entry.type === 'folder' ? void loadDirectory(entry.path) : void openFile(entry.path)
                      }
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{entry.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{entry.path}</div>
                      </div>
                      <Badge variant="secondary">{entry.type}</Badge>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Selected file</CardTitle>
              <CardDescription>
                {selectedFile ? selectedFile.path : 'Select a file from the browser to inspect or edit it.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedFile ? (
                <>
                  <Textarea
                    value={selectedFile.content}
                    onChange={(event) =>
                      setSelectedFile((current) => (current ? { ...current, content: event.target.value } : current))
                    }
                    className="min-h-[360px] font-mono text-sm"
                    disabled={selectedFile.contentEncoding !== 'utf8'}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void saveFile()} disabled={isFsBusy || selectedFile.contentEncoding !== 'utf8'} className="gap-2">
                      <Save className="h-4 w-4" />
                      Save
                    </Button>
                    <Button variant="outline" onClick={() => downloadSelectedFile()} className="gap-2">
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => void deleteSelectedFile()} disabled={isFsBusy}>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                  {selectedFile.contentEncoding !== 'utf8' ? (
                    <p className="text-xs text-muted-foreground">
                      This file was loaded as base64 because it looks binary. Download it instead of editing inline.
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 p-8 text-sm text-muted-foreground">
                  Pick a file to preview its contents here.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === 'sandboxes' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Create sandbox</CardTitle>
              <CardDescription>Register a reusable workspace root and optional start command on this machine.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Sandbox name"
                value={sandboxForm.name}
                onChange={(event) => setSandboxForm((current) => ({ ...current, name: event.target.value }))}
              />
              <Input
                placeholder="/absolute/path/to/workspace"
                value={sandboxForm.rootPath}
                onChange={(event) => setSandboxForm((current) => ({ ...current, rootPath: event.target.value }))}
              />
              <Input
                placeholder="npm run dev"
                value={sandboxForm.startCommand}
                onChange={(event) => setSandboxForm((current) => ({ ...current, startCommand: event.target.value }))}
              />
              <Button onClick={() => void handleSandboxCreate()} className="gap-2">
                <Server className="h-4 w-4" />
                Create sandbox
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Sandbox lifecycle management</CardTitle>
              <CardDescription>Create, start, stop, restart, and delete named sandboxes on the connected machine.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {detail.sandboxes.map((sandbox) => (
                <div key={sandbox.id} className="rounded-2xl border border-border/60 bg-background/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-semibold text-foreground">{sandbox.name}</p>
                        <Badge variant={sandbox.status === 'running' ? 'default' : 'secondary'}>{sandbox.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{sandbox.rootPath}</p>
                      <p className="text-xs text-muted-foreground">
                        Starts: {sandbox.startCount} • Last started: {sandbox.lastStartedAt ? new Date(sandbox.lastStartedAt).toLocaleString() : 'Never'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="gap-2" onClick={() => void handleSandboxAction('sandbox:start', sandbox.slug)}>
                        <Play className="h-4 w-4" />
                        Start
                      </Button>
                      <Button variant="outline" className="gap-2" onClick={() => void handleSandboxAction('sandbox:stop', sandbox.slug)}>
                        <Square className="h-4 w-4" />
                        Stop
                      </Button>
                      <Button variant="outline" className="gap-2" onClick={() => void handleSandboxAction('sandbox:restart', sandbox.slug)}>
                        <RefreshCw className="h-4 w-4" />
                        Restart
                      </Button>
                      <Button variant="destructive" className="gap-2" onClick={() => void handleSandboxAction('sandbox:delete', sandbox.slug)}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function MonitorMetric({ label, value, progress }: { label: string; value: string; progress: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <Progress value={progress} />
    </div>
  );
}

function CapabilityBadge({ active, label }: { active: boolean; label: string }) {
  return <Badge variant={active ? 'default' : 'secondary'}>{label}</Badge>;
}

function getPreviewTunnelStatusVariant(status: 'opening' | 'open' | 'closed'): 'default' | 'secondary' | 'destructive' {
  if (status === 'open') return 'default';
  if (status === 'opening') return 'secondary';
  return 'destructive';
}

function getCommandStatusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'completed') return 'default';
  if (status === 'failed' || status === 'cancelled') return 'destructive';
  return 'secondary';
}

function formatTimestamp(value: string | null) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString();
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}
