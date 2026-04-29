'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppWindow,
  Cable,
  ChevronDown,
  ChevronRight,
  FileArchive,
  FileText,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Globe,
  HardDrive,
  KeyRound,
  Layers3,
  Lock,
  Radar,
  Server,
  Settings2,
  Shapes,
  Smartphone,
  Terminal,
  Upload,
} from 'lucide-react';
import { BuilderPageHeader } from '@/components/builder-page-header';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Orb } from '@/components/ui/orb';
import { signIn, useSession } from '@/lib/auth-client';
import { type BuilderTemplateId, getBuilderTemplateOptions } from '@/lib/builder/template-options';
import { cn } from '@/lib/utils';

type BuilderMode = 'local' | 'web' | 'apps' | 'ssh';
type SshAuthMode = 'config' | 'key' | 'password';
type BuilderSubView = 'default' | 'git' | 'zip' | 'template';
type FolderSpace = 'workspace' | 'projects' | 'sandbox';
type GitHubRepo = {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  cloneUrl: string;
  private: boolean;
  defaultBranch: string;
};
type ZipTreeNode = {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: ZipTreeNode[];
};
type TemplateId = BuilderTemplateId;

const SECTIONS = {
  local: {
    badge: 'Local section',
    title: 'Local Builder',
    description:
      'Use local workspace context inside Indexblue. Open files, builder settings, and saved memories to build from your own environment first.',
    features: [
      { icon: FolderOpen, label: 'Uploads and local files' },
      { icon: Settings2, label: 'Builder settings and prompts' },
      { icon: Layers3, label: 'Saved memories and context' },
    ],
    colors: ['#6B5B4F', '#8B7355'] as [string, string],
  },
  web: {
    badge: 'Web section',
    title: 'Web Builder',
    description:
      'Use web-connected builder tools for live browsing, online research, and connected integrations when the task depends on fresh data.',
    features: [
      { icon: Globe, label: 'Live web exploration' },
      { icon: Radar, label: 'Real-time search signals' },
      { icon: Cable, label: 'Connected web integrations' },
    ],
    colors: ['#5B6478', '#8AA4D6'] as [string, string],
  },
  apps: {
    badge: 'Apps section',
    title: 'Apps Builder',
    description:
      'Use the mobile app builder workspace for Expo, React Native, and app-like product flows with device-first preview and app development tools.',
    features: [
      { icon: Smartphone, label: 'Mobile-first preview and flows' },
      { icon: Shapes, label: 'App starter templates' },
      { icon: Terminal, label: 'Builder-driven app runtime work' },
    ],
    colors: ['#3F4D7A', '#7D7BDA'] as [string, string],
  },
  ssh: {
    badge: 'SSH section',
    title: 'SSH Builder',
    description:
      'Use SSH-connected builder access to work against remote machines, inspect services, and operate inside server environments when the task lives off-device.',
    features: [
      { icon: Server, label: 'Remote server access' },
      { icon: Terminal, label: 'Command-line workflows' },
      { icon: Cable, label: 'Secure infrastructure connections' },
    ],
    colors: ['#4F6B64', '#73A697'] as [string, string],
  },
} satisfies Record<
  BuilderMode,
  {
    badge: string;
    title: string;
    description: string;
    features: Array<{ icon: typeof HardDrive; label: string }>;
    colors: [string, string];
  }
>;

const SPACE_OPTIONS: Array<{ value: FolderSpace; label: string }> = [
  { value: 'workspace', label: 'Workspace' },
  { value: 'projects', label: 'Projects' },
  { value: 'sandbox', label: 'Sandbox' },
];

const DEFAULT_WEB_RUNTIME_PROVIDER = process.env.NEXT_PUBLIC_BUILDER_WEB_RUNTIME_PROVIDER ?? 'codesandbox';

export default function BuilderPage() {
  const router = useRouter();
  const [mode, setMode] = useState<BuilderMode | null>(null);
  const [sshAuthMode, setSshAuthMode] = useState<SshAuthMode>('config');
  const [subView, setSubView] = useState<BuilderSubView>('default');
  const [repoUrl, setRepoUrl] = useState('');
  const [githubRepos, setGitHubRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [githubConnected, setGitHubConnected] = useState(false);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [repoLoadError, setRepoLoadError] = useState<string | null>(null);
  const [cloneLogs, setCloneLogs] = useState<string[]>([]);
  const [cloneTargetDir, setCloneTargetDir] = useState<string | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [isCloning, setIsCloning] = useState(false);

  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipImportError, setZipImportError] = useState<string | null>(null);
  const [zipExtractedPath, setZipExtractedPath] = useState<string | null>(null);
  const [zipArchiveName, setZipArchiveName] = useState<string | null>(null);
  const [zipTree, setZipTree] = useState<ZipTreeNode[]>([]);
  const [isImportingZip, setIsImportingZip] = useState(false);
  const [expandedZipFolders, setExpandedZipFolders] = useState<Record<string, boolean>>({});
  const [selectedZipFile, setSelectedZipFile] = useState<string | null>(null);
  const [selectedZipFileContent, setSelectedZipFileContent] = useState<string>('');
  const [isLoadingZipFile, setIsLoadingZipFile] = useState(false);
  const [isZipPreviewOpen, setIsZipPreviewOpen] = useState(false);

  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderSpace, setNewFolderSpace] = useState<FolderSpace>('workspace');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [localFolderError, setLocalFolderError] = useState<string | null>(null);
  const [createdFolderPath, setCreatedFolderPath] = useState<string | null>(null);
  const [openedFolderName, setOpenedFolderName] = useState<string | null>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState<TemplateId>('next-app');
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateCreatedPath, setTemplateCreatedPath] = useState<string | null>(null);
  const [templateCreatedName, setTemplateCreatedName] = useState<string | null>(null);

  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState('22');
  const [sshUsername, setSshUsername] = useState('');
  const [sshConfigContent, setSshConfigContent] = useState('');
  const [sshKeyContent, setSshKeyContent] = useState('');
  const [sshPassphrase, setSshPassphrase] = useState('');
  const [sshPassword, setSshPassword] = useState('');
  const [sshLogs, setSshLogs] = useState<string[]>([]);
  const [sshError, setSshError] = useState<string | null>(null);
  const [sshStatus, setSshStatus] = useState<string | null>(null);
  const [isConnectingSsh, setIsConnectingSsh] = useState(false);

  const { data: session } = useSession();
  const activeSection = mode ? SECTIONS[mode] : null;
  const isDevMode = process.env.NODE_ENV === 'development';

  const openBuilderProject = (redirectTo?: string | null) => {
    if (!redirectTo) return;
    router.push(redirectTo);
  };

  const resetGitState = () => {
    setCloneLogs([]);
    setCloneError(null);
    setCloneTargetDir(null);
    setRepoLoadError(null);
  };

  const openGitCloneCard = () => {
    setSubView('git');
    resetGitState();
  };

  const closeGitCloneCard = () => {
    setSubView('default');
    setCloneError(null);
  };

  const openZipImportCard = () => {
    setSubView('zip');
    setZipImportError(null);
    setZipExtractedPath(null);
    setZipArchiveName(null);
    setZipTree([]);
    setExpandedZipFolders({});
    setSelectedZipFile(null);
    setSelectedZipFileContent('');
    setIsZipPreviewOpen(false);
  };

  const closeZipImportCard = () => {
    setSubView('default');
    setZipImportError(null);
  };

  const openTemplateCard = () => {
    if (mode === 'apps') {
      setSelectedTemplateId('expo-app');
    } else if (selectedTemplateId === 'expo-app') {
      setSelectedTemplateId('next-app');
    }
    setSubView('template');
    setTemplateError(null);
  };

  const closeTemplateCard = () => {
    setSubView('default');
    setTemplateError(null);
  };

  useEffect(() => {
    const shouldLoadRepos =
      subView === 'git' && (mode === 'local' || mode === 'web' || mode === 'apps') && !!session?.user;
    if (!shouldLoadRepos) return;

    let ignore = false;

    const loadRepos = async () => {
      setIsLoadingRepos(true);
      setRepoLoadError(null);

      try {
        const response = await fetch('/api/builder/github/repos', { cache: 'no-store' });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error ?? 'Failed to load GitHub repos.');
        }

        if (ignore) return;
        setGitHubConnected(Boolean(payload.connected));
        setGitHubRepos(payload.repos ?? []);
        setSelectedRepoId(payload.selectedRepoId ? Number(payload.selectedRepoId) : null);
      } catch (error) {
        if (ignore) return;
        setRepoLoadError(error instanceof Error ? error.message : 'Failed to load GitHub repos.');
        setGitHubConnected(false);
      } finally {
        if (!ignore) setIsLoadingRepos(false);
      }
    };

    void loadRepos();

    return () => {
      ignore = true;
    };
  }, [mode, session?.user, subView]);

  useEffect(() => {
    const selectedRepo = githubRepos.find((repo) => repo.id === selectedRepoId);
    if (selectedRepo) {
      setRepoUrl(selectedRepo.cloneUrl);
    }
  }, [githubRepos, selectedRepoId]);

  const handleSelectRepo = async (repo: GitHubRepo) => {
    setSelectedRepoId(repo.id);
    setRepoUrl(repo.cloneUrl);
    setRepoLoadError(null);

    try {
      const response = await fetch('/api/builder/github/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoId: String(repo.id),
          repoName: repo.name,
          repoFullName: repo.fullName,
          repoUrl: repo.htmlUrl,
          cloneUrl: repo.cloneUrl,
          isPrivate: repo.private,
          defaultBranch: repo.defaultBranch,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? 'Failed to save selected repository.');
      }
    } catch (error) {
      setRepoLoadError(error instanceof Error ? error.message : 'Failed to save selected repository.');
    }
  };

  const handleCloneRepository = async () => {
    if (!repoUrl.trim()) {
      setCloneError('Repository URL is required.');
      return;
    }

    setIsCloning(true);
    setCloneError(null);
    setCloneTargetDir(null);
    setCloneLogs(['Starting clone request...']);

    try {
      const response = await fetch('/api/builder/git/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          repoUrl: repoUrl.trim(),
          authMode: 'public',
        }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? 'Clone request failed.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            message?: string;
            targetDir?: string;
            redirectTo?: string;
          };

          if (event.message) {
            const message = event.message;
            setCloneLogs((current) => [...current, message]);
          }

          if (event.type === 'done') {
            setCloneTargetDir(event.targetDir ?? null);
            openBuilderProject(event.redirectTo ?? null);
          }

          if (event.type === 'error') {
            setCloneError(event.message ?? 'Clone failed.');
          }
        }
      }
    } catch (error) {
      setCloneError(error instanceof Error ? error.message : 'Clone failed.');
    } finally {
      setIsCloning(false);
    }
  };

  const handleZipImport = async () => {
    if (!zipFile) {
      setZipImportError('ZIP file is required.');
      return;
    }

    setIsImportingZip(true);
    setZipImportError(null);
    setZipExtractedPath(null);
    setZipArchiveName(null);
    setZipTree([]);

    try {
      const formData = new FormData();
      formData.append('file', zipFile);
      if (mode) {
        formData.append('mode', mode);
      }

      const response = await fetch('/api/builder/zip/import', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to import ZIP archive.');
      }

      setZipExtractedPath(payload.extractedPath ?? null);
      setZipArchiveName(payload.archiveName ?? null);
      setZipTree(payload.tree ?? []);
      setExpandedZipFolders({});
      setSelectedZipFile(null);
      setSelectedZipFileContent('');
      setIsZipPreviewOpen(true);
      openBuilderProject(payload.redirectTo ?? null);
    } catch (error) {
      setZipImportError(error instanceof Error ? error.message : 'Failed to import ZIP archive.');
    } finally {
      setIsImportingZip(false);
    }
  };

  const handleToggleZipFolder = (folderPath: string) => {
    setExpandedZipFolders((current) => ({
      ...current,
      [folderPath]: !current[folderPath],
    }));
  };

  const handleSelectZipFile = async (relativePath: string) => {
    if (!zipExtractedPath) return;

    setSelectedZipFile(relativePath);
    setSelectedZipFileContent('');
    setIsLoadingZipFile(true);
    setZipImportError(null);

    try {
      const params = new URLSearchParams({
        extractedPath: zipExtractedPath,
        relativePath,
      });
      const response = await fetch(`/api/builder/zip/file?${params.toString()}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to load file preview.');
      }

      setSelectedZipFileContent(payload.content ?? '');
    } catch (error) {
      setZipImportError(error instanceof Error ? error.message : 'Failed to load file preview.');
    } finally {
      setIsLoadingZipFile(false);
    }
  };

  const handleOpenFolder = async () => {
    setLocalFolderError(null);

    const picker = (
      window as Window & {
        showDirectoryPicker?: () => Promise<{ name?: string }>;
      }
    ).showDirectoryPicker;

    if (!picker) {
      setLocalFolderError('Directory picker is not available in this browser.');
      return;
    }

    try {
      const handle = await picker();
      setOpenedFolderName(handle?.name ?? 'Selected folder');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      setLocalFolderError(error instanceof Error ? error.message : 'Failed to open folder.');
    }
  };

  const handleCreateLocalFolder = async () => {
    if (!newFolderName.trim()) {
      setLocalFolderError('Folder name is required.');
      return;
    }

    setIsCreatingFolder(true);
    setLocalFolderError(null);

    try {
      const response = await fetch('/api/builder/local/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderName: newFolderName.trim(),
          space: newFolderSpace,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to create folder.');
      }

      setCreatedFolderPath(payload.createdPath ?? null);
      setIsCreateFolderOpen(false);
      setNewFolderName('');
      openBuilderProject(payload.redirectTo ?? null);
    } catch (error) {
      setLocalFolderError(error instanceof Error ? error.message : 'Failed to create folder.');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleReadTextFile = async (event: ChangeEvent<HTMLInputElement>, onLoaded: (content: string) => void) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onLoaded(await file.text());
  };

  const handleCreateTemplate = async () => {
    setIsCreatingTemplate(true);
    setTemplateError(null);
    setTemplateCreatedPath(null);

    try {
      const response = await fetch('/api/builder/template/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId, mode }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to create template workspace.');
      }

      setTemplateCreatedPath(payload.createdPath ?? null);
      setTemplateCreatedName(payload.templateName ?? null);
      openBuilderProject(payload.redirectTo ?? null);
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : 'Failed to create template workspace.');
    } finally {
      setIsCreatingTemplate(false);
    }
  };

  const handleConnectSsh = async () => {
    if (!sshHost.trim() || !sshPort.trim() || !sshUsername.trim()) {
      setSshError('Host, port, and username are required.');
      return;
    }

    setIsConnectingSsh(true);
    setSshError(null);
    setSshStatus(null);
    setSshLogs(['Starting SSH connection...']);

    try {
      const response = await fetch('/api/builder/ssh/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: sshHost.trim(),
          port: Number(sshPort),
          username: sshUsername.trim(),
          authMode: sshAuthMode,
          configContent: sshConfigContent,
          keyContent: sshKeyContent,
          passphrase: sshPassphrase,
          password: sshPassword,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? 'SSH request failed.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            message?: string;
            status?: string;
            redirectTo?: string;
          };

          if (event.message) {
            const message = event.message;
            setSshLogs((current) => [...current, message]);
          }

          if (event.type === 'done') {
            setSshStatus(event.status ?? 'connected');
            openBuilderProject(event.redirectTo ?? null);
          }

          if (event.type === 'error') {
            setSshError(event.message ?? 'SSH connection failed.');
          }
        }
      }
    } catch (error) {
      setSshError(error instanceof Error ? error.message : 'SSH connection failed.');
    } finally {
      setIsConnectingSsh(false);
    }
  };

  const hideSectionIntro =
    (mode === 'local' && (subView === 'git' || subView === 'zip' || subView === 'template')) ||
    (mode === 'web' && (subView === 'git' || subView === 'zip' || subView === 'template')) ||
    (mode === 'apps' && (subView === 'git' || subView === 'zip' || subView === 'template')) ||
    (mode === 'ssh' && subView === 'zip');

  const handleEmptyStart = async () => {
    try {
      const response = await fetch('/api/builder/project/empty', {
        method: 'POST',
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to create empty builder project.');
      }

      openBuilderProject(payload.redirectTo ?? null);
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : 'Failed to create empty builder project.');
    }
  };

  return (
    <div className="relative flex h-dvh w-full flex-col items-center overflow-hidden bg-background">
      <div className="relative z-10 flex min-h-0 w-full max-w-6xl flex-1 flex-col p-4 safe-area-inset-bottom sm:p-6">
        <BuilderPageHeader active="builder" className="shrink-0 pt-2 sm:pt-4" />

        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col items-center">
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <div className="pointer-events-none relative size-[260px] opacity-30 sm:size-[300px]">
              <Orb
                colors={activeSection?.colors ?? ['#6B5B4F', '#8AA4D6']}
                agentState={null}
                volumeMode="auto"
                inputVolumeRef={{ current: 0 }}
                outputVolumeRef={{ current: 0 }}
                className="h-full w-full"
              />
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-3 pb-2 sm:pb-0">
            {!mode && (
              <div className="flex w-full flex-col gap-4 rounded-xl border border-border/60 bg-card/30 p-4">
                <div className="flex flex-col gap-1">
                  <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-2.5 py-1">
                    <span className="font-pixel text-[9px] uppercase tracking-wider text-muted-foreground/70">
                      Builder modes
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">Choose how you want to start</p>
                  <p className="text-xs leading-relaxed text-muted-foreground/70">
                    Pick a builder mode and we will open only that context in the center.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <ModeButton
                    icon={HardDrive}
                    label="Local"
                    onClick={() => {
                      setMode('local');
                      setSubView('default');
                    }}
                  />
                  <ModeButton
                    icon={AppWindow}
                    label="Web"
                    onClick={() => {
                      setMode('web');
                      setSubView('default');
                    }}
                  />
                  <ModeButton
                    icon={Smartphone}
                    label="Apps"
                    onClick={() => {
                      setMode('apps');
                      setSubView('default');
                    }}
                  />
                  <ModeButton
                    icon={Terminal}
                    label="SSH"
                    onClick={() => {
                      setMode('ssh');
                      setSubView('default');
                    }}
                  />
                </div>
              </div>
            )}

            {mode && activeSection && (
              <div className="flex w-full flex-col gap-4 rounded-xl border border-border/60 bg-card/30 p-4">
                {!hideSectionIntro && (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-2.5 py-1">
                          <span className="font-pixel text-[9px] uppercase tracking-wider text-muted-foreground/70">
                            {activeSection.badge}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground">{activeSection.title}</p>
                        <p className="text-xs leading-relaxed text-muted-foreground/70">{activeSection.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMode(null);
                          setSubView('default');
                        }}
                        className="flex h-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-card/60 px-3 text-xs text-foreground transition-colors hover:bg-muted/40"
                      >
                        Back
                      </button>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {activeSection.features.map(({ icon: Icon, label }) => (
                        <div key={label} className="flex items-center gap-2.5">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
                            <Icon className="size-3.5 text-primary" aria-hidden />
                          </div>
                          <span className="text-xs text-foreground/70">{label}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {mode === 'local' && (
                  <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-background/50 p-3">
                    {subView === 'default' && (
                      <>
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-medium text-foreground">Local workspace actions</p>
                          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                            Start from a folder on this machine, clone an existing repository, or create a new
                            workspace.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                          <ActionButton icon={FolderOpen} label="Open Folder" onClick={handleOpenFolder} />
                          <ActionButton icon={GitBranch} label="Clone Git Repo" onClick={openGitCloneCard} />
                          <ActionButton
                            icon={FolderPlus}
                            label="Create Folder"
                            onClick={() => {
                              setLocalFolderError(null);
                              setIsCreateFolderOpen(true);
                            }}
                          />
                          <ActionButton icon={FileArchive} label="Import ZIP" onClick={openZipImportCard} />
                        </div>

                        {(localFolderError || openedFolderName || createdFolderPath) && (
                          <div className="rounded-lg border border-border/50 bg-card/50 p-3 text-[11px]">
                            {localFolderError && <p className="text-red-400">{localFolderError}</p>}
                            {openedFolderName && (
                              <p className="text-foreground/80">Opened folder: {openedFolderName}</p>
                            )}
                            {createdFolderPath && (
                              <p className="text-emerald-400">Created folder: {createdFolderPath}</p>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {subView === 'git' && (
                      <GitCloneCard
                        sessionUser={!!session?.user}
                        githubConnected={githubConnected}
                        isLoadingRepos={isLoadingRepos}
                        repoLoadError={repoLoadError}
                        githubRepos={githubRepos}
                        selectedRepoId={selectedRepoId}
                        onSelectRepo={handleSelectRepo}
                        repoUrl={repoUrl}
                        onRepoUrlChange={setRepoUrl}
                        cloneError={cloneError}
                        cloneTargetDir={cloneTargetDir}
                        cloneLogs={cloneLogs}
                        isCloning={isCloning}
                        onClone={handleCloneRepository}
                        onBack={closeGitCloneCard}
                      />
                    )}

                    {subView === 'zip' && (
                      <ZipImportCard
                        zipFile={zipFile}
                        setZipFile={setZipFile}
                        zipImportError={zipImportError}
                        zipArchiveName={zipArchiveName}
                        zipExtractedPath={zipExtractedPath}
                        zipTree={zipTree}
                        isImportingZip={isImportingZip}
                        onImport={handleZipImport}
                        onBack={closeZipImportCard}
                        onOpenPreview={() => setIsZipPreviewOpen(true)}
                      />
                    )}
                  </div>
                )}

                {mode === 'web' && (
                  <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-background/50 p-3">
                    {subView === 'default' && (
                      <>
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-medium text-foreground">Web builder actions</p>
                          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                            Pull in a repository, start from a template, or import a zipped project to continue building
                            online.
                          </p>
                        </div>
                        <div className={cn('grid grid-cols-1 gap-2', isDevMode ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
                          <ActionButton icon={GitBranch} label="Clone Git Repo" onClick={openGitCloneCard} />
                          <ActionButton icon={Shapes} label="Templates" onClick={openTemplateCard} />
                          <ActionButton icon={FileArchive} label="Import ZIP" onClick={openZipImportCard} />
                          {isDevMode ? (
                            <ActionButton icon={Layers3} label="Empty Start" onClick={() => void handleEmptyStart()} />
                          ) : null}
                        </div>

                        {(templateCreatedName || templateCreatedPath) && (
                          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                            {templateCreatedName && (
                              <p className="text-[11px] text-emerald-300">
                                {templateCreatedName} created successfully.
                              </p>
                            )}
                            {templateCreatedPath && (
                              <p className="mt-1 text-[11px] text-emerald-200/75">{templateCreatedPath}</p>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {subView === 'git' && (
                      <GitCloneCard
                        sessionUser={!!session?.user}
                        githubConnected={githubConnected}
                        isLoadingRepos={isLoadingRepos}
                        repoLoadError={repoLoadError}
                        githubRepos={githubRepos}
                        selectedRepoId={selectedRepoId}
                        onSelectRepo={handleSelectRepo}
                        repoUrl={repoUrl}
                        onRepoUrlChange={setRepoUrl}
                        cloneError={cloneError}
                        cloneTargetDir={cloneTargetDir}
                        cloneLogs={cloneLogs}
                        isCloning={isCloning}
                        onClone={handleCloneRepository}
                        onBack={closeGitCloneCard}
                      />
                    )}

                    {subView === 'template' && (
                      <TemplateCard
                        mode={mode}
                        selectedTemplateId={selectedTemplateId}
                        onSelectTemplate={setSelectedTemplateId}
                        templateError={templateError}
                        isCreatingTemplate={isCreatingTemplate}
                        templateCreatedPath={templateCreatedPath}
                        onCreate={handleCreateTemplate}
                        onBack={closeTemplateCard}
                      />
                    )}

                    {subView === 'zip' && (
                      <ZipImportCard
                        zipFile={zipFile}
                        setZipFile={setZipFile}
                        zipImportError={zipImportError}
                        zipArchiveName={zipArchiveName}
                        zipExtractedPath={zipExtractedPath}
                        zipTree={zipTree}
                        isImportingZip={isImportingZip}
                        onImport={handleZipImport}
                        onBack={closeZipImportCard}
                        onOpenPreview={() => setIsZipPreviewOpen(true)}
                      />
                    )}
                  </div>
                )}

                {mode === 'apps' && (
                  <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-background/50 p-3">
                    {subView === 'default' && (
                      <>
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-medium text-foreground">Mobile app builder actions</p>
                          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                            Bring in an Expo or React Native project, import a zipped mobile workspace, or start from a
                            mobile template.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <ActionButton icon={GitBranch} label="Clone Git Repo" onClick={openGitCloneCard} />
                          <ActionButton icon={Shapes} label="Templates" onClick={openTemplateCard} />
                          <ActionButton icon={FileArchive} label="Import ZIP" onClick={openZipImportCard} />
                        </div>

                        {(templateCreatedName || templateCreatedPath) && (
                          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                            {templateCreatedName && (
                              <p className="text-[11px] text-emerald-300">
                                {templateCreatedName} created successfully.
                              </p>
                            )}
                            {templateCreatedPath && (
                              <p className="mt-1 text-[11px] text-emerald-200/75">{templateCreatedPath}</p>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {subView === 'git' && (
                      <GitCloneCard
                        sessionUser={!!session?.user}
                        githubConnected={githubConnected}
                        isLoadingRepos={isLoadingRepos}
                        repoLoadError={repoLoadError}
                        githubRepos={githubRepos}
                        selectedRepoId={selectedRepoId}
                        onSelectRepo={handleSelectRepo}
                        repoUrl={repoUrl}
                        onRepoUrlChange={setRepoUrl}
                        cloneError={cloneError}
                        cloneTargetDir={cloneTargetDir}
                        cloneLogs={cloneLogs}
                        isCloning={isCloning}
                        onClone={handleCloneRepository}
                        onBack={closeGitCloneCard}
                      />
                    )}

                    {subView === 'template' && (
                      <TemplateCard
                        mode={mode}
                        selectedTemplateId={selectedTemplateId}
                        onSelectTemplate={setSelectedTemplateId}
                        templateError={templateError}
                        isCreatingTemplate={isCreatingTemplate}
                        templateCreatedPath={templateCreatedPath}
                        onCreate={handleCreateTemplate}
                        onBack={closeTemplateCard}
                      />
                    )}

                    {subView === 'zip' && (
                      <ZipImportCard
                        zipFile={zipFile}
                        setZipFile={setZipFile}
                        zipImportError={zipImportError}
                        zipArchiveName={zipArchiveName}
                        zipExtractedPath={zipExtractedPath}
                        zipTree={zipTree}
                        isImportingZip={isImportingZip}
                        onImport={handleZipImport}
                        onBack={closeZipImportCard}
                        onOpenPreview={() => setIsZipPreviewOpen(true)}
                      />
                    )}
                  </div>
                )}

                {mode === 'ssh' && (
                  <div className="max-h-[56vh] overflow-y-auto rounded-xl border border-border/50 bg-background/50 p-3 pr-2">
                    <div className="flex flex-col gap-3">
                      {subView === 'default' && (
                        <>
                          <ActionButton icon={FileArchive} label="Import ZIP" onClick={openZipImportCard} />

                          <div className="flex flex-col gap-1">
                            <p className="text-xs font-medium text-foreground">SSH connection</p>
                            <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                              Enter your server details and test the connection with config, private key, or password
                              mode.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <InputField
                              label="Host"
                              value={sshHost}
                              onChange={setSshHost}
                              placeholder="example.server.com"
                            />
                            <InputField label="Port" value={sshPort} onChange={setSshPort} placeholder="22" />
                            <InputField
                              label="Username"
                              value={sshUsername}
                              onChange={setSshUsername}
                              placeholder="ubuntu"
                              className="sm:col-span-2"
                            />
                          </div>

                          <div className="flex flex-col gap-2">
                            <p className="text-[11px] text-muted-foreground/80">Authentication method</p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <AuthButton
                                active={sshAuthMode === 'config'}
                                icon={Upload}
                                label="Config File"
                                onClick={() => setSshAuthMode('config')}
                              />
                              <AuthButton
                                active={sshAuthMode === 'key'}
                                icon={KeyRound}
                                label="Private Key"
                                onClick={() => setSshAuthMode('key')}
                              />
                              <AuthButton
                                active={sshAuthMode === 'password'}
                                icon={Lock}
                                label="Password"
                                onClick={() => setSshAuthMode('password')}
                              />
                            </div>
                          </div>

                          {sshAuthMode === 'config' && (
                            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border/60 bg-card/40 p-3">
                              <p className="text-[11px] text-muted-foreground/80">Upload or paste your SSH config.</p>
                              <input
                                type="file"
                                accept=".conf,.config,text/plain"
                                onChange={(event) => void handleReadTextFile(event, setSshConfigContent)}
                                className="rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-xs text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/15 file:px-2 file:py-1"
                              />
                              <textarea
                                value={sshConfigContent}
                                onChange={(event) => setSshConfigContent(event.target.value)}
                                placeholder="Host my-server&#10;  HostName example.server.com&#10;  User ubuntu"
                                className="min-h-28 rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
                              />
                            </div>
                          )}

                          {sshAuthMode === 'key' && (
                            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border/60 bg-card/40 p-3">
                              <p className="text-[11px] text-muted-foreground/80">Upload or paste a private key.</p>
                              <input
                                type="file"
                                accept=".pem,.key,text/plain"
                                onChange={(event) => void handleReadTextFile(event, setSshKeyContent)}
                                className="rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-xs text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/15 file:px-2 file:py-1"
                              />
                              <textarea
                                value={sshKeyContent}
                                onChange={(event) => setSshKeyContent(event.target.value)}
                                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                                className="min-h-28 rounded-lg border border-border/50 bg-card/60 px-3 py-2 font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
                              />
                              <InputField
                                label="Optional passphrase"
                                value={sshPassphrase}
                                onChange={setSshPassphrase}
                                placeholder="Passphrase"
                                type="password"
                              />
                            </div>
                          )}

                          {sshAuthMode === 'password' && (
                            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border/60 bg-card/40 p-3">
                              <p className="text-[11px] text-muted-foreground/80">
                                Enter the server password for reachability checks.
                              </p>
                              <input
                                type="password"
                                value={sshPassword}
                                onChange={(event) => setSshPassword(event.target.value)}
                                placeholder="SSH password"
                                className="h-10 rounded-lg border border-border/50 bg-card/60 px-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40"
                              />
                            </div>
                          )}

                          {sshError && <p className="text-[11px] text-red-400">{sshError}</p>}
                          {sshStatus && <p className="text-[11px] text-emerald-400">SSH status: {sshStatus}</p>}

                          {sshLogs.length > 0 && (
                            <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 bg-black/20 p-2">
                              {sshLogs.map((log, index) => (
                                <p
                                  key={`${log}-${index}`}
                                  className="text-[11px] leading-relaxed text-muted-foreground/80"
                                >
                                  {log}
                                </p>
                              ))}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={handleConnectSsh}
                            disabled={isConnectingSsh}
                            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                          >
                            <Server className="size-3.5" />
                            {isConnectingSsh ? 'Connecting...' : 'Connect with SSH'}
                          </button>
                        </>
                      )}

                      {subView === 'zip' && (
                        <ZipImportCard
                          zipFile={zipFile}
                          setZipFile={setZipFile}
                          zipImportError={zipImportError}
                          zipArchiveName={zipArchiveName}
                          zipExtractedPath={zipExtractedPath}
                          zipTree={zipTree}
                          isImportingZip={isImportingZip}
                          onImport={handleZipImport}
                          onBack={closeZipImportCard}
                          onOpenPreview={() => setIsZipPreviewOpen(true)}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground/80">Folder name</span>
              <input
                type="text"
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="my-new-workspace"
                className="h-10 rounded-lg border border-border/50 bg-card/60 px-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground/80">Space</span>
              <select
                value={newFolderSpace}
                onChange={(event) => setNewFolderSpace(event.target.value as FolderSpace)}
                className="h-10 rounded-lg border border-border/50 bg-card/60 px-3 text-xs text-foreground outline-none focus:border-primary/40"
              >
                {SPACE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {localFolderError && <p className="text-[11px] text-red-400">{localFolderError}</p>}

            <button
              type="button"
              onClick={handleCreateLocalFolder}
              disabled={isCreatingFolder}
              className="flex h-10 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <FolderPlus className="size-3.5" />
              {isCreatingFolder ? 'Creating...' : 'Create Folder'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isZipPreviewOpen} onOpenChange={setIsZipPreviewOpen}>
        <DialogContent className="!h-[92vh] !w-[98vw] !max-w-[1820px] overflow-hidden rounded-[40px] border border-border/60 bg-background/96 p-0 shadow-[0_40px_140px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:rounded-[44px]">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_24%),radial-gradient(circle_at_top_right,hsl(var(--accent)/0.10),transparent_24%)]" />
          <DialogHeader className="relative border-b border-border/60 bg-card/70 px-5 py-4 sm:px-8 sm:py-5">
            <DialogTitle className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              Extracted Files
            </DialogTitle>
          </DialogHeader>
          <div className="relative grid h-[calc(92vh-69px)] gap-0 md:grid-cols-[minmax(340px,0.78fr)_minmax(0,1.22fr)]">
            <div className="border-b border-border/60 bg-card/35 p-4 sm:p-5 md:border-r md:border-b-0 md:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="rounded-full border border-border/60 bg-background/80 px-3 py-1.5">
                  <p className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-foreground/80 sm:text-xs">
                    {zipArchiveName || 'ZIP Import'}
                  </p>
                </div>
              </div>
              <div className="h-[36vh] overflow-y-auto rounded-[24px] border border-border/60 bg-background/80 p-3 shadow-inner scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent sm:h-[38vh] sm:rounded-[28px] sm:p-4 md:h-[calc(92vh-9.5rem)]">
                {zipTree.length > 0 ? (
                  <ZipTree
                    nodes={zipTree}
                    depth={0}
                    expandedFolders={expandedZipFolders}
                    selectedFile={selectedZipFile}
                    onToggleFolder={handleToggleZipFolder}
                    onSelectFile={handleSelectZipFile}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-[18px] border border-dashed border-border/50 bg-card/30">
                    <p className="text-[11px] text-muted-foreground">Import a ZIP file to view its structure.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="bg-card/20 p-4 sm:p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-medium tracking-[0.02em] text-foreground">File Preview</p>
                {selectedZipFile ? (
                  <div className="max-w-[68%] rounded-full border border-border/60 bg-background/80 px-3 py-1.5">
                    <p className="truncate text-[11px] text-muted-foreground">{selectedZipFile}</p>
                  </div>
                ) : null}
              </div>
              <div className="flex h-[36vh] flex-col rounded-[24px] border border-border/60 bg-background/85 p-3 shadow-inner sm:h-[38vh] sm:rounded-[28px] sm:p-4 md:h-[calc(92vh-9.5rem)]">
                {!selectedZipFile && (
                  <div className="flex h-full items-center justify-center rounded-[18px] border border-dashed border-border/50 bg-card/30 sm:rounded-[22px]">
                    <div className="rounded-full border border-border/60 bg-background/80 px-4 py-2">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Select a file</p>
                    </div>
                  </div>
                )}
                {selectedZipFile && isLoadingZipFile && (
                  <div className="flex h-full items-center justify-center rounded-[18px] border border-dashed border-border/50 bg-card/30 sm:rounded-[22px]">
                    <div className="rounded-full border border-border/60 bg-background/80 px-4 py-2">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Loading preview</p>
                    </div>
                  </div>
                )}
                {selectedZipFile && !isLoadingZipFile && (
                  <pre className="min-h-0 flex-1 overflow-auto rounded-[18px] border border-border/60 bg-card/50 p-4 font-mono text-[12px] leading-6 text-foreground shadow-[inset_0_1px_0_hsl(var(--background)/0.4)] scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent sm:rounded-[22px] sm:p-5">
                    {selectedZipFileContent || 'Empty file'}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModeButton({ icon: Icon, label, onClick }: { icon: typeof HardDrive; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 items-center justify-center gap-2 rounded-lg border border-border/50 bg-card/60 px-3 text-sm text-foreground transition-colors hover:bg-muted/40"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: typeof HardDrive; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border/50 bg-card/60 px-3 text-xs text-foreground transition-colors hover:bg-muted/40"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  className,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  type?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[11px] text-muted-foreground/80">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-lg border border-border/50 bg-card/60 px-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40"
      />
    </label>
  );
}

function AuthButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof HardDrive;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs transition-colors',
        active
          ? 'border-primary/30 bg-primary/15 text-foreground'
          : 'border-border/50 bg-card/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function GitCloneCard({
  sessionUser,
  githubConnected,
  isLoadingRepos,
  repoLoadError,
  githubRepos,
  selectedRepoId,
  onSelectRepo,
  repoUrl,
  onRepoUrlChange,
  cloneError,
  cloneTargetDir,
  cloneLogs,
  isCloning,
  onClone,
  onBack,
}: {
  sessionUser: boolean;
  githubConnected: boolean;
  isLoadingRepos: boolean;
  repoLoadError: string | null;
  githubRepos: GitHubRepo[];
  selectedRepoId: number | null;
  onSelectRepo: (repo: GitHubRepo) => Promise<void>;
  repoUrl: string;
  onRepoUrlChange: (value: string) => void;
  cloneError: string | null;
  cloneTargetDir: string | null;
  cloneLogs: string[];
  isCloning: boolean;
  onClone: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border/60 bg-card/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md border border-border/50 bg-card/60">
            <GitBranch className="size-4 text-foreground" />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">Clone Git Repo</p>
            <p className="text-[11px] text-muted-foreground/70">
              Enter the repository URL and choose a connected repo if available.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 items-center justify-center rounded-lg border border-border/50 bg-card/60 px-3 text-[11px] text-foreground transition-colors hover:bg-muted/40"
        >
          Back
        </button>
      </div>

      {(!sessionUser || !githubConnected) && (
        <button
          type="button"
          onClick={() => signIn.social({ provider: 'github', callbackURL: '/builder' })}
          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <GitBranch className="size-3.5" />
          Connect GitHub
        </button>
      )}

      {sessionUser && githubConnected && (
        <>
          <p className="text-[11px] text-muted-foreground/80">Select a connected GitHub repository.</p>
          {isLoadingRepos && <p className="text-[11px] text-muted-foreground/80">Loading repositories...</p>}
          {repoLoadError && <p className="text-[11px] text-red-400">{repoLoadError}</p>}
          {githubRepos.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border/50 bg-card/40 p-2">
              {githubRepos.map((repo) => (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => void onSelectRepo(repo)}
                  className={cn(
                    'mb-2 flex w-full items-start justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors last:mb-0',
                    selectedRepoId === repo.id
                      ? 'border-primary/30 bg-primary/15 text-foreground'
                      : 'border-border/40 bg-card/50 text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                  )}
                >
                  <span>{repo.fullName}</span>
                  <span>{repo.private ? 'Private' : 'Public'}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground/80">Repository URL</span>
        <input
          type="text"
          placeholder="https://github.com/user/repo.git"
          value={repoUrl}
          onChange={(event) => onRepoUrlChange(event.target.value)}
          className="h-10 rounded-lg border border-border/50 bg-card/60 px-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40"
        />
      </label>

      {cloneError && <p className="text-[11px] text-red-400">{cloneError}</p>}
      {cloneTargetDir && <p className="text-[11px] text-emerald-400">Cloned into: {cloneTargetDir}</p>}

      {cloneLogs.length > 0 && (
        <div className="max-h-36 overflow-y-auto rounded-lg border border-border/50 bg-black/20 p-2">
          {cloneLogs.map((log, index) => (
            <p key={`${log}-${index}`} className="text-[11px] leading-relaxed text-muted-foreground/80">
              {log}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onClone}
        disabled={isCloning || !repoUrl}
        className="flex h-10 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <GitBranch className="size-3.5" />
        {isCloning ? 'Cloning...' : 'Clone Repository'}
      </button>
    </div>
  );
}

function TemplateCard({
  mode,
  selectedTemplateId,
  onSelectTemplate,
  templateError,
  isCreatingTemplate,
  templateCreatedPath,
  onCreate,
  onBack,
}: {
  mode: BuilderMode;
  selectedTemplateId: TemplateId;
  onSelectTemplate: (value: TemplateId) => void;
  templateError: string | null;
  isCreatingTemplate: boolean;
  templateCreatedPath: string | null;
  onCreate: () => void;
  onBack: () => void;
}) {
  const filteredTemplates = getBuilderTemplateOptions({
    mode,
    runtimeProvider:
      mode === 'web' || mode === 'local'
        ? (DEFAULT_WEB_RUNTIME_PROVIDER as 'e2b' | 'local' | 'codesandbox' | 'webcontainers')
        : mode === 'apps'
          ? 'e2b'
          : null,
  });
  const hasSelectedTemplate = filteredTemplates.some((template) => template.id === selectedTemplateId);

  useEffect(() => {
    if (hasSelectedTemplate || filteredTemplates.length === 0) return;
    onSelectTemplate(filteredTemplates[0]!.id);
  }, [filteredTemplates, hasSelectedTemplate, onSelectTemplate]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border/60 bg-card/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md border border-border/50 bg-card/60">
            <Shapes className="size-4 text-foreground" />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">Templates</p>
            <p className="text-[11px] text-muted-foreground/70">
              {mode === 'apps'
                ? 'Create a starter workspace from a mobile app template.'
                : `Create a starter workspace from a ${mode === 'local' ? 'local' : 'web'} template card.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 items-center justify-center rounded-lg border border-border/50 bg-card/60 px-3 text-[11px] text-foreground transition-colors hover:bg-muted/40"
        >
          Back
        </button>
      </div>

      <div className="max-h-52 overflow-y-auto rounded-lg border border-border/50 bg-card/40 p-2">
        {(mode === 'web' || mode === 'local') && (
          <div className="mb-2 rounded-lg border border-border/40 bg-card/60 px-3 py-2 text-[11px] text-muted-foreground">
            Runtime provider:{' '}
            <span className="font-medium uppercase text-foreground">{DEFAULT_WEB_RUNTIME_PROVIDER}</span>
          </div>
        )}
        {filteredTemplates.length === 0 ? (
          <div className="rounded-lg border border-border/40 bg-card/50 px-3 py-4 text-[11px] leading-relaxed text-muted-foreground">
            No templates are available for the current mode and runtime provider yet.
          </div>
        ) : (
          filteredTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelectTemplate(template.id)}
              className={cn(
                'mb-2 flex w-full flex-col rounded-lg border px-3 py-2 text-left transition-colors last:mb-0',
                selectedTemplateId === template.id
                  ? 'border-primary/30 bg-primary/15 text-foreground'
                  : 'border-border/40 bg-card/50 text-muted-foreground hover:bg-muted/30 hover:text-foreground',
              )}
            >
              <span className="text-xs font-medium">{template.name}</span>
              <span className="mt-1 text-[11px] leading-relaxed opacity-80">{template.description}</span>
              {template.sourceUrl ? (
                <span className="mt-1 text-[10px] uppercase tracking-[0.16em] opacity-50">
                  Source {new URL(template.sourceUrl).hostname.replace(/^www\./, '')}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>

      {templateError && <p className="text-[11px] text-red-400">{templateError}</p>}
      {templateCreatedPath && <p className="text-[11px] text-emerald-400">Created in: {templateCreatedPath}</p>}

      <button
        type="button"
        onClick={onCreate}
        disabled={isCreatingTemplate}
        className="flex h-10 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <Shapes className="size-3.5" />
        {isCreatingTemplate ? 'Creating Template...' : 'Create Template Workspace'}
      </button>
    </div>
  );
}

function ZipImportCard({
  zipFile,
  setZipFile,
  zipImportError,
  zipArchiveName,
  zipExtractedPath,
  zipTree,
  isImportingZip,
  onImport,
  onBack,
  onOpenPreview,
}: {
  zipFile: File | null;
  setZipFile: (file: File | null) => void;
  zipImportError: string | null;
  zipArchiveName: string | null;
  zipExtractedPath: string | null;
  zipTree: ZipTreeNode[];
  isImportingZip: boolean;
  onImport: () => void;
  onBack: () => void;
  onOpenPreview: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border/60 bg-card/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md border border-border/50 bg-card/60">
            <FileArchive className="size-4 text-foreground" />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">Import ZIP</p>
            <p className="text-[11px] text-muted-foreground/70">
              Upload a ZIP file, extract it, and inspect it in a popup.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 items-center justify-center rounded-lg border border-border/50 bg-card/60 px-3 text-[11px] text-foreground transition-colors hover:bg-muted/40"
        >
          Back
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground/80">ZIP File</span>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => setZipFile(event.target.files?.[0] ?? null)}
          className="rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-xs text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/15 file:px-2 file:py-1 file:text-xs file:text-foreground"
        />
      </label>

      {zipImportError && <p className="text-[11px] text-red-400">{zipImportError}</p>}

      {zipArchiveName && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
          <p className="text-[11px] text-emerald-300">Imported `{zipArchiveName}`</p>
          <p className="mt-1 text-[11px] text-emerald-200/75">{zipExtractedPath}</p>
        </div>
      )}

      {zipTree.length > 0 && (
        <button
          type="button"
          onClick={onOpenPreview}
          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-white transition-colors hover:bg-white/[0.08]"
        >
          <FolderOpen className="size-3.5" />
          Open Extracted Files
        </button>
      )}

      <button
        type="button"
        onClick={onImport}
        disabled={isImportingZip || !zipFile}
        className="flex h-10 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <Upload className="size-3.5" />
        {isImportingZip ? 'Importing ZIP...' : 'Import ZIP'}
      </button>
    </div>
  );
}

function ZipTree({
  nodes,
  depth,
  expandedFolders,
  selectedFile,
  onToggleFolder,
  onSelectFile,
}: {
  nodes: ZipTreeNode[];
  depth: number;
  expandedFolders: Record<string, boolean>;
  selectedFile: string | null;
  onToggleFolder: (folderPath: string) => void;
  onSelectFile: (filePath: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {nodes.map((node) => (
        <div key={node.path}>
          {node.type === 'folder' ? (
            <>
              <button
                type="button"
                onClick={() => onToggleFolder(node.path)}
                className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-[11px] text-foreground/80 transition-colors hover:bg-muted/20"
                style={{ paddingLeft: `${depth * 14 + 4}px` }}
              >
                {expandedFolders[node.path] ? (
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground/70" />
                ) : (
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground/70" />
                )}
                <FolderOpen className="size-3.5 shrink-0 text-primary" />
                <span className="truncate">{node.name}</span>
              </button>
              {expandedFolders[node.path] && node.children?.length ? (
                <ZipTree
                  nodes={node.children}
                  depth={depth + 1}
                  expandedFolders={expandedFolders}
                  selectedFile={selectedFile}
                  onToggleFolder={onToggleFolder}
                  onSelectFile={onSelectFile}
                />
              ) : null}
            </>
          ) : (
            <button
              type="button"
              onClick={() => onSelectFile(node.path)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-[11px] transition-colors hover:bg-muted/20',
                selectedFile === node.path ? 'bg-primary/10 text-foreground' : 'text-foreground/80',
              )}
              style={{ paddingLeft: `${depth * 14 + 20}px` }}
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{node.name}</span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
