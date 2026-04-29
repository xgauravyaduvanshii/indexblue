'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Copy, Loader2, Monitor, Power, RefreshCw, Server, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

type InfraRecord = {
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
  } | null;
  metadata: Record<string, unknown>;
  previewDomainStatus: {
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
  lastSeenAt: string | null;
};

type GeneratedApiKey = {
  id: string;
  label: string;
  keyPrefix: string;
  plaintextKey: string;
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

function getSudoSummary(metadata: Record<string, unknown>) {
  return {
    available: metadata?.sudoAvailable === true,
    passwordless: metadata?.sudoPasswordless === true,
    isRoot: metadata?.sudoIsRoot === true,
    storedPassword: metadata?.storedSudoPassword === true,
  };
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T & { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || 'Request failed.');
  }
  return payload as T;
}

export function CloudInfrastructurePage() {
  const [infra, setInfra] = useState<InfraRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyInfraId, setBusyInfraId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<GeneratedApiKey | null>(null);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);

  const activeCount = useMemo(() => infra.filter((item) => item.status === 'online').length, [infra]);
  const totalSandboxes = useMemo(
    () => infra.reduce((sum, item) => sum + (item.latestMetrics?.sandboxCount ?? 0), 0),
    [infra],
  );
  const totalProcesses = useMemo(
    () => infra.reduce((sum, item) => sum + (item.latestMetrics?.processCount ?? 0), 0),
    [infra],
  );

  const loadInfra = async () => {
    try {
      const payload = await requestJson<{ infra: InfraRecord[] }>('/api/cloud/infra', { cache: 'no-store' });
      setInfra(payload.infra);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load infrastructure.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadInfra();
    const interval = window.setInterval(() => {
      void loadInfra();
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  const createCommand = async (infraId: string, type: string, payload: Record<string, unknown> = {}) => {
    return await requestJson<{ command: { id: string } }>(`/api/cloud/infra/${infraId}/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, payload }),
    });
  };

  const waitForCommand = async (infraId: string, commandId: string, timeoutMs = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const payload = await requestJson<{ command: { status: string } }>(
        `/api/cloud/infra/${infraId}/commands/${commandId}`,
        { cache: 'no-store' },
      );
      if (payload.command.status === 'completed' || payload.command.status === 'failed' || payload.command.status === 'cancelled') {
        return payload.command;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    return null;
  };

  const handleAction = async (infraId: string, type: 'infra:stop' | 'infra:restart') => {
    setBusyInfraId(infraId);
    try {
      const created = await createCommand(infraId, type);
      await waitForCommand(infraId, created.command.id, 15000);
      await loadInfra();
    } finally {
      setBusyInfraId(null);
    }
  };

  const handleDelete = async (record: InfraRecord) => {
    if (!window.confirm(`Delete "${record.name}" from Cloud Infrastructure?`)) {
      return;
    }

    setBusyInfraId(record.id);
    try {
      try {
        const disconnect = await createCommand(record.id, 'infra:disconnect');
        await waitForCommand(record.id, disconnect.command.id, 15000);
      } catch {
        // Fall back to delete even if the agent is already gone.
      }

      await requestJson(`/api/cloud/infra/${record.id}`, {
        method: 'DELETE',
      });
      await loadInfra();
    } finally {
      setBusyInfraId(null);
    }
  };

  const handleGenerateKey = async () => {
    setIsGeneratingKey(true);
    try {
      const payload = await requestJson<{ apiKey: GeneratedApiKey }>('/api/cloud/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ label: 'Index CLI' }),
      });
      setGeneratedKey(payload.apiKey);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const copyText = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  return (
    <>
      <div className="overflow-hidden rounded-[36px] border border-border/60 bg-card/40 shadow-[0_30px_120px_rgba(0,0,0,0.18)]">
        <div className="grid gap-6 p-6 sm:p-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
          <div className="relative overflow-hidden rounded-[28px] border border-border/60 bg-background/70 p-6 shadow-sm">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_48%)]" />
            <div className="relative">
              <div className="inline-flex items-center rounded-full border border-border/60 bg-card/75 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Cloud Command Center
              </div>
              <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Standalone infra operations for live machines, shells, sandboxes, and file access
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                This workspace is separate from Builder. Connect any machine running <code>indexcli</code>, monitor
                live health, execute commands, browse files, and manage reusable sandboxes from one operational
                console.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button size="lg" className="gap-2 rounded-2xl" onClick={() => setAddDialogOpen(true)}>
                  <Server className="h-4 w-4" />
                  Add Infra
                </Button>
                <Button asChild size="lg" variant="outline" className="gap-2 rounded-2xl">
                  <Link href="/settings?tab=platform-api">
                    <ShieldCheck className="h-4 w-4" />
                    Platform API Keys
                  </Link>
                </Button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricBox label="Connected" value={String(activeCount)} />
                <MetricBox label="Machines" value={String(infra.length)} />
                <MetricBox label="Sandboxes" value={String(totalSandboxes)} />
                <MetricBox label="Processes" value={String(totalProcesses)} />
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-border/60 bg-background/70 p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Zap className="h-4 w-4 text-primary" />
              Operational readiness
            </div>
            <div className="mt-5 space-y-4">
              <ReadinessItem
                title="Secure pairing"
                description="Generate and rotate platform API keys before you enroll or replace any machine."
              />
              <ReadinessItem
                title="Remote control"
                description="Each connected CLI can stream commands, file operations, and sandbox lifecycle events."
              />
              <ReadinessItem
                title="Live monitoring"
                description="CPU, memory, uptime, process snapshots, and sandbox start rates update from agent heartbeats."
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-2">
          {isLoading ? (
            <Card className="xl:col-span-2 border-border/60 bg-card/40">
              <CardContent className="flex h-48 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : error ? (
            <Card className="xl:col-span-2 border-destructive/30 bg-card/40">
              <CardContent className="py-10 text-sm text-destructive">{error}</CardContent>
            </Card>
          ) : infra.length === 0 ? (
            <Card className="xl:col-span-2 border-border/60 bg-card/40">
              <CardContent className="py-10">
                <div className="max-w-2xl space-y-3">
                  <p className="text-lg font-semibold text-foreground">No infra connected yet</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Generate a platform API key, install <code>indexcli</code> on a machine, and connect it with{' '}
                    <code>indexcli infra connect</code>. Once the agent is live, it will appear here automatically.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            infra.map((record) => {
              const latest = record.latestMetrics;
              const isBusy = busyInfraId === record.id;
              const sudo = getSudoSummary(record.metadata);
              const previewDomainBase =
                typeof record.metadata?.previewDomainBase === 'string' ? record.metadata.previewDomainBase : null;

              return (
                <Card key={record.id} className="border-border/60 bg-card/40 shadow-[0_24px_80px_rgba(0,0,0,0.16)]">
                  <CardHeader className="gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-xl">{record.name}</CardTitle>
                          <Badge variant={record.status === 'online' ? 'default' : 'secondary'}>{record.status}</Badge>
                        </div>
                        <CardDescription>
                          {record.hostname || 'Unknown host'} • {record.platform || 'unknown'} {record.arch || ''}
                        </CardDescription>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" className="gap-2">
                          <Link href={`/cloud-infrastructure/${record.id}`}>
                            <Monitor className="h-4 w-4" />
                            Monitor
                          </Link>
                        </Button>
                        <Button variant="outline" className="gap-2" disabled={isBusy} onClick={() => void handleAction(record.id, 'infra:restart')}>
                          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          Restart
                        </Button>
                        <Button variant="outline" className="gap-2" disabled={isBusy} onClick={() => void handleAction(record.id, 'infra:stop')}>
                          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                          Stop
                        </Button>
                        <Button variant="destructive" className="gap-2" disabled={isBusy} onClick={() => void handleDelete(record)}>
                          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricBox label="Latency" value={record.latencyMs ? `${record.latencyMs} ms` : 'N/A'} />
                      <MetricBox label="Commands" value={String(record.totalCommands)} />
                      <MetricBox label="Filesystem Ops" value={String(record.totalFsOps)} />
                      <MetricBox label="Transferred" value={formatBytes(record.totalDataTransferred)} />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                          <Activity className="h-4 w-4 text-primary" />
                          Real-time health
                        </div>
                        <div className="space-y-4">
                          <div>
                            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                              <span>CPU</span>
                              <span>{latest ? `${latest.cpuPercent.toFixed(0)}%` : 'N/A'}</span>
                            </div>
                            <Progress value={latest?.cpuPercent ?? 0} />
                          </div>
                          <div>
                            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                              <span>Memory</span>
                              <span>{latest ? `${latest.memoryPercent.toFixed(0)}%` : 'N/A'}</span>
                            </div>
                            <Progress value={latest?.memoryPercent ?? 0} />
                          </div>
                          <div className="grid grid-cols-3 gap-3 pt-1 text-xs text-muted-foreground">
                            <div>
                              <div className="uppercase tracking-[0.18em]">Uptime</div>
                              <div className="mt-1 text-sm font-semibold text-foreground">
                                {latest ? formatUptime(latest.uptimeSeconds) : 'N/A'}
                              </div>
                            </div>
                            <div>
                              <div className="uppercase tracking-[0.18em]">Processes</div>
                              <div className="mt-1 text-sm font-semibold text-foreground">
                                {latest ? latest.processCount : 0}
                              </div>
                            </div>
                            <div>
                              <div className="uppercase tracking-[0.18em]">Sandboxes</div>
                              <div className="mt-1 text-sm font-semibold text-foreground">
                                {latest ? latest.sandboxCount : 0}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                          <Zap className="h-4 w-4 text-primary" />
                          Machine profile
                        </div>
                        <div className="grid gap-3 text-sm text-muted-foreground">
                          <div className="flex flex-wrap gap-2 pb-1">
                            <Badge variant={sudo.available ? 'default' : 'secondary'}>Sudo</Badge>
                            <Badge variant={sudo.passwordless ? 'default' : 'secondary'}>Passwordless</Badge>
                            <Badge variant={sudo.isRoot ? 'default' : 'secondary'}>Root</Badge>
                            <Badge variant={sudo.storedPassword ? 'default' : 'secondary'}>Stored Password</Badge>
                            {previewDomainBase ? (
                              <Badge variant={record.previewDomainStatus.connected ? 'default' : 'secondary'}>
                                {record.previewDomainStatus.connected ? 'Preview Domain Connected' : 'Preview Domain Issue'}
                              </Badge>
                            ) : null}
                          </div>
                          {previewDomainBase ? (
                            <div className="rounded-xl border border-border/60 bg-card/40 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Preview domain</div>
                              <div className="mt-1 text-sm font-medium text-foreground">{previewDomainBase}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {record.previewDomainStatus.connected
                                  ? `Connected via ${record.previewDomainStatus.probeHost}`
                                  : record.previewDomainStatus.issues[0] || 'Connectivity checks are still pending.'}
                              </div>
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between gap-3">
                            <span>Node</span>
                            <span className="font-medium text-foreground">{record.nodeVersion || 'Unknown'}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>CLI</span>
                            <span className="font-medium text-foreground">{record.cliVersion || 'Unknown'}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Last seen</span>
                            <span className="font-medium text-foreground">
                              {record.lastSeenAt ? new Date(record.lastSeenAt).toLocaleString() : 'Never'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Machine ID</span>
                            <span className="truncate font-mono text-xs text-foreground">{record.machineId}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Infra</DialogTitle>
            <DialogDescription>
              Generate a key for <code>indexcli</code>, then connect a machine so it can be managed from this cloud workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">1. Generate a one-time CLI key</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    This key grants full system access to the connected machine. Generate it here or from Settings.
                  </p>
                </div>
                <Button onClick={() => void handleGenerateKey()} disabled={isGeneratingKey} className="gap-2">
                  {isGeneratingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />}
                  Generate Key
                </Button>
              </div>

              {generatedKey ? (
                <div className="mt-4 rounded-xl border border-border/60 bg-card/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <code className="block overflow-x-auto text-xs text-foreground">{generatedKey.plaintextKey}</code>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => void copyText(generatedKey.plaintextKey)}>
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <p className="text-sm font-semibold text-foreground">2. Install and connect on your machine</p>
              <div className="mt-3 space-y-3">
                <CodeStep value="npm install -g indexcli" />
                <CodeStep value={`indexcli login --key ${generatedKey?.plaintextKey ?? '<YOUR_PLATFORM_API_KEY>'}`} />
                <CodeStep value={'indexcli infra connect --name "My Machine"'} />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ReadinessItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/55 p-4">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function CodeStep({ value }: { value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <code className="block overflow-x-auto text-xs text-foreground">{value}</code>
    </div>
  );
}
