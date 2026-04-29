'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppWindow,
  ExternalLink,
  HardDrive,
  Loader2,
  Play,
  RefreshCcw,
  Smartphone,
  Square,
  Terminal,
  Trash2,
  FolderCode,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type BuilderProjectsDashboardItem = {
  id: string;
  name: string;
  mode: 'local' | 'web' | 'apps' | 'ssh';
  sourceType: 'github' | 'zip' | 'template' | 'local' | 'ssh' | 'empty';
  sourceLabel: string | null;
  sourceUrl: string | null;
  previewUrl: string | null;
  runtimeProvider: 'e2b' | 'local' | 'codesandbox' | 'webcontainers';
  buildStatus: string | null;
  buildRuntime: string | null;
  boxId: string | null;
  hasWorkspace: boolean;
  updatedAt: string;
  createdAt: string;
};

type BusyAction = 'delete' | 'stop' | 'rerun' | null;

export function BuilderProjectsDashboard({ initialProjects }: { initialProjects: BuilderProjectsDashboardItem[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [busyByProject, setBusyByProject] = useState<Record<string, BusyAction>>({});

  const projectSummary = useMemo(
    () => ({
      total: projects.length,
      running: projects.filter((project) => project.buildStatus === 'active').length,
      apps: projects.filter((project) => project.mode === 'apps').length,
    }),
    [projects],
  );

  const setBusy = (projectId: string, action: BusyAction) => {
    setBusyByProject((current) => ({
      ...current,
      [projectId]: action,
    }));
  };

  const openWorkspace = (projectId: string) => {
    router.push(`/builder/projects/${projectId}`);
  };

  const openPreview = (project: BuilderProjectsDashboardItem) => {
    if (project.previewUrl) {
      window.open(project.previewUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    router.push(`/builder/projects/${project.id}`);
  };

  const runRuntimeAction = async (projectId: string, action: 'stop' | 'rerun') => {
    setBusy(projectId, action);

    try {
      const response = await fetch(`/api/builder/projects/${projectId}/runtime`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        buildStatus?: string;
        boxId?: string | null;
        previewUrl?: string | null;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || `Failed to ${action} the project.`);
      }

      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? {
                ...project,
                buildStatus: payload?.buildStatus ?? project.buildStatus,
                boxId: payload?.boxId ?? null,
                previewUrl: payload?.previewUrl ?? null,
              }
            : project,
        ),
      );
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : `Failed to ${action} the project.`);
    } finally {
      setBusy(projectId, null);
    }
  };

  const deleteProject = async (projectId: string, projectName: string) => {
    if (!window.confirm(`Delete "${projectName}"? This removes the project workspace and chat history.`)) {
      return;
    }

    setBusy(projectId, 'delete');

    try {
      const response = await fetch(`/api/builder/projects/${projectId}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete the project.');
      }

      setProjects((current) => current.filter((project) => project.id !== projectId));
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to delete the project.');
    } finally {
      setBusy(projectId, null);
    }
  };

  if (projects.length === 0) {
    return (
      <div className="rounded-[28px] border border-border/60 bg-card/40 p-8 shadow-[0_24px_90px_rgba(0,0,0,0.18)]">
        <div className="flex flex-col gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            Project Library
          </div>
          <h2 className="text-2xl font-semibold text-foreground">No builder projects yet</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Start from the Builder tab to create a local, web, apps, or SSH workspace. Every new project will appear
            here with its preview, runtime controls, and project actions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Projects" value={projectSummary.total} detail="Saved builder workspaces" />
        <SummaryCard label="Running" value={projectSummary.running} detail="Live sessions with active runtime" />
        <SummaryCard label="Apps" value={projectSummary.apps} detail="Mobile app builder workspaces" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
        {projects.map((project) => {
          const busyAction = busyByProject[project.id] ?? null;
          const statusTone = getProjectStatusTone(project.buildStatus);

          return (
            <article
              key={project.id}
              className="overflow-hidden rounded-[28px] border border-border/60 bg-card/45 p-4 shadow-[0_28px_100px_rgba(0,0,0,0.18)]"
            >
              <div className="relative overflow-hidden rounded-[24px] border border-border/60 bg-[#0b0d12]">
                <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProjectModeBadge mode={project.mode} />
                    <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-white/70">
                      {project.sourceLabel || project.sourceType}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]',
                      statusTone.className,
                    )}
                  >
                    {statusTone.label}
                  </span>
                </div>

                <ProjectPreviewSurface project={project} />

                <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black via-black/70 to-transparent p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold text-white">{project.name}</h3>
                      <p className="mt-1 truncate text-xs text-white/65">
                        {project.sourceUrl
                          ? getDisplayHost(project.sourceUrl)
                          : 'Open the project to continue building'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openPreview(project)}
                      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 text-xs font-medium text-white transition hover:bg-white/15"
                    >
                      <ExternalLink className="size-3.5" />
                      Preview
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border/50 bg-background/60 px-2.5 py-1">
                    Provider {project.runtimeProvider}
                  </span>
                  <span className="rounded-full border border-border/50 bg-background/60 px-2.5 py-1">
                    Runtime {project.buildRuntime || 'node'}
                  </span>
                  <span className="rounded-full border border-border/50 bg-background/60 px-2.5 py-1">
                    Updated {formatProjectTime(project.updatedAt)}
                  </span>
                  {project.hasWorkspace ? (
                    <span className="rounded-full border border-border/50 bg-background/60 px-2.5 py-1">
                      Workspace ready
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                  <ProjectActionButton
                    icon={FolderCode}
                    label="Open"
                    onClick={() => openWorkspace(project.id)}
                    busy={false}
                  />
                  <ProjectActionButton
                    icon={ExternalLink}
                    label="Preview"
                    onClick={() => openPreview(project)}
                    busy={false}
                  />
                  <ProjectActionButton
                    icon={Square}
                    label="Stop"
                    onClick={() => void runRuntimeAction(project.id, 'stop')}
                    disabled={busyAction !== null || (!project.boxId && project.buildStatus !== 'active')}
                    busy={busyAction === 'stop'}
                  />
                  <ProjectActionButton
                    icon={RefreshCcw}
                    label="Rerun"
                    onClick={() => void runRuntimeAction(project.id, 'rerun')}
                    disabled={busyAction !== null}
                    busy={busyAction === 'rerun'}
                  />
                  <ProjectActionButton
                    icon={Trash2}
                    label="Delete"
                    onClick={() => void deleteProject(project.id, project.name)}
                    disabled={busyAction !== null}
                    busy={busyAction === 'delete'}
                    variant="danger"
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-[24px] border border-border/60 bg-card/40 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.12)]">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

function ProjectModeBadge({ mode }: { mode: BuilderProjectsDashboardItem['mode'] }) {
  const modeConfig = {
    local: { label: 'Local', icon: HardDrive, className: 'text-amber-100 bg-amber-500/18 border-amber-400/25' },
    web: { label: 'Web', icon: Globe, className: 'text-sky-100 bg-sky-500/18 border-sky-400/25' },
    apps: { label: 'Apps', icon: Smartphone, className: 'text-violet-100 bg-violet-500/18 border-violet-400/25' },
    ssh: { label: 'SSH', icon: Terminal, className: 'text-emerald-100 bg-emerald-500/18 border-emerald-400/25' },
  }[mode];

  const Icon = modeConfig.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.22em]',
        modeConfig.className,
      )}
    >
      <Icon className="size-3.5" />
      {modeConfig.label}
    </span>
  );
}

function ProjectPreviewSurface({ project }: { project: BuilderProjectsDashboardItem }) {
  if (project.mode === 'apps' && project.previewUrl) {
    return (
      <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.25),_transparent_45%),linear-gradient(180deg,_rgba(17,24,39,0.72),_rgba(5,8,14,0.95))] p-10">
        <div className="relative h-full max-h-[260px] w-[138px] rounded-[28px] border border-white/10 bg-black shadow-[0_22px_50px_rgba(0,0,0,0.5)]">
          <div className="absolute left-1/2 top-2 h-4 w-20 -translate-x-1/2 rounded-full bg-white/6" />
          <div className="absolute inset-[8px] overflow-hidden rounded-[20px] border border-white/5">
            <iframe
              src={project.previewUrl}
              title={`${project.name} mobile preview`}
              className="h-full w-full bg-background"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    );
  }

  if (project.previewUrl) {
    return (
      <div className="relative aspect-[16/10] overflow-hidden bg-[linear-gradient(180deg,_rgba(17,24,39,0.72),_rgba(5,8,14,0.95))]">
        <div className="flex h-10 items-center gap-2 border-b border-white/8 bg-black/35 px-4">
          <span className="size-2 rounded-full bg-rose-400/70" />
          <span className="size-2 rounded-full bg-amber-300/70" />
          <span className="size-2 rounded-full bg-emerald-300/70" />
          <span className="ml-2 truncate rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/70">
            {project.previewUrl}
          </span>
        </div>
        <iframe
          src={project.previewUrl}
          title={`${project.name} preview`}
          className="h-[calc(100%-2.5rem)] w-full bg-white"
          loading="lazy"
        />
      </div>
    );
  }

  const PlaceholderIcon = project.mode === 'apps' ? Smartphone : project.mode === 'ssh' ? Terminal : AppWindow;

  return (
    <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_42%),linear-gradient(180deg,_rgba(11,13,18,0.85),_rgba(5,8,14,0.98))]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="relative z-10 flex max-w-[280px] flex-col items-center gap-4 px-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-white/90 shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
          <PlaceholderIcon className="size-8" />
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Preview will appear here</div>
          <div className="mt-1 text-xs leading-5 text-white/60">
            Open the workspace and run the project to capture its live homepage or device preview.
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  busy,
  variant = 'default',
}: {
  icon: typeof Play;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy: boolean;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-medium transition',
        variant === 'danger'
          ? 'border-red-500/20 bg-red-500/8 text-red-200 hover:bg-red-500/12'
          : 'border-border/60 bg-background/70 text-foreground hover:bg-muted/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {label}
    </button>
  );
}

function getProjectStatusTone(status: string | null | undefined) {
  switch (status) {
    case 'active':
      return {
        label: 'Running',
        className: 'border border-emerald-400/20 bg-emerald-500/15 text-emerald-100',
      };
    case 'paused':
      return {
        label: 'Stopped',
        className: 'border border-amber-400/20 bg-amber-500/15 text-amber-100',
      };
    case 'error':
      return {
        label: 'Error',
        className: 'border border-red-400/20 bg-red-500/15 text-red-100',
      };
    case 'completed':
      return {
        label: 'Completed',
        className: 'border border-sky-400/20 bg-sky-500/15 text-sky-100',
      };
    default:
      return {
        label: 'Idle',
        className: 'border border-white/10 bg-black/30 text-white/70',
      };
  }
}

function getDisplayHost(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatProjectTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recently';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}
