'use client';

import { DefaultChatTransport } from 'ai';
import { useChat } from '@ai-sdk/react';
import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  FilePlus2,
  FolderPlus,
  ExternalLink,
  File,
  FileAudio2,
  FileImage,
  FileVideo2,
  Folder,
  FolderOpen,
  Loader2,
  LayoutTemplate,
  Maximize2,
  Minimize2,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Square,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react';
import {
  BuilderAppToolPanel,
  BUILDER_APP_TOOL_TABS,
  isBuilderAppToolTabId,
  type BuilderAppToolTabDefinition,
  type BuilderAppToolTabId,
} from '@/components/builder-app-panels';
import { Button } from '@/components/ui/button';
import { BuilderCanvas } from '@/components/builder-canvas';
import { BuilderMobilePreview } from '@/components/builder-mobile-preview';
import { BuilderTerminalSurface } from '@/components/builder-terminal-surface';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import type { BuilderCanvasState } from '@/lib/builder/canvas';
import { BUILDER_BOX_ROOT, BUILDER_REMOTE_PROJECT_PATH } from '@/lib/builder/paths';
import {
  getBuilderProjectRuntimeProvider,
  getBuilderProjectMode as deriveBuilderProjectMode,
  getBuilderProjectRemoteWorkspaceRoot,
  isAppBuilderProject as isAppBuilderWorkspaceProject,
  type BuilderProjectLiveSession,
  type BuilderProjectMetadata,
} from '@/lib/builder/project-metadata';
import type { ChatMessage, DataBuildSearchPart } from '@/lib/types';
import { cn, normalizeError } from '@/lib/utils';
import { BuilderWebContainerPreview } from '@/components/builder-webcontainer-preview';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type BuilderProjectRecord = {
  id: string;
  chatId: string;
  name: string;
  sourceType: string;
  workspacePath: string | null;
  theme: string | null;
  metadata: BuilderProjectMetadata | null;
  buildStatus?: string | null;
  buildRuntime?: string | null;
  boxId?: string | null;
};

type BuilderWorkspaceNode = {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: BuilderWorkspaceNode[];
};

type FileRecord = {
  content: string | null;
  kind: 'text' | 'image' | 'audio' | 'video' | 'pdf' | 'binary';
  isLoading: boolean;
  error: string | null;
  mimeType: string | null;
  size: number;
};

type BuildConsoleEntry = {
  id: string;
  source: 'exec' | 'agent' | 'preview' | 'code' | 'fs' | 'search';
  title: string;
  detail: string;
  status: 'running' | 'completed' | 'error' | 'info';
  level: 'default' | 'success' | 'warning' | 'error';
  timestamp: number;
};

type ExplorerEntryDraft = {
  mode: 'create' | 'rename';
  type: 'file' | 'folder';
  parentPath: string;
  path: string | null;
  value: string;
};

type ManualTerminalStreamEvent =
  | {
      type: 'started';
      boxId: string;
      providerTerminalId?: string;
      cwd: string;
      command: string;
      isNewBox: boolean;
    }
  | {
      type: 'preview';
      port: number;
      url: string;
    }
  | {
      type: 'output';
      chunk: string;
    }
  | {
      type: 'exit';
      exitCode: number;
      cwd: string;
    }
  | {
      type: 'error' | 'cancelled';
      message: string;
    };

type TerminalSession = {
  id: string;
  title: string;
  cwd: string;
  input: string;
  draftInput: string;
  history: string[];
  historyIndex: number | null;
  output: string;
  commandError: string | null;
  boxId: string;
  providerTerminalId?: string;
  isRunning: boolean;
};

type ViewTab = 'code' | 'preview' | 'canvas' | BuilderAppToolTabId;

const WEB_WORKSPACE_TOOL_TABS: BuilderAppToolTabId[] = ['push-to-github'];
type BottomTab = 'logs' | 'terminal' | 'errors';
type MobileTab = 'chat' | 'workbench';

const QUICK_PROMPTS = [
  'Build a polished landing page with hero, pricing, and testimonials.',
  'Create a dashboard layout with sidebar, top bar, and analytics cards.',
  'Refactor the current app UI to feel more premium and production-ready.',
];
const APP_QUICK_PROMPTS = [
  'Build a basic note-taking mobile app with polished onboarding and home tabs.',
  'Create a premium wellness app UI with cards, charts, and mobile-first navigation.',
  'Refactor this mobile app to feel more native, tactile, and production-ready.',
];

const DEFAULT_CHAT_WIDTH = 30;
const MIN_CHAT_WIDTH = 24;
const MAX_CHAT_WIDTH = 42;
const MIN_TERMINAL_HEIGHT = 110;
const MAX_TERMINAL_HEIGHT = 420;
const PREVIEWABLE_EXTENSIONS = new Set(['html', 'htm']);
const IMAGE_FILE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg']);
const AUDIO_FILE_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'weba']);
const VIDEO_FILE_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mpeg', 'mpg']);
const PDF_FILE_EXTENSIONS = new Set(['pdf']);
const EDITABLE_FILE_EXTENSIONS = new Set([
  'txt',
  'md',
  'json',
  'js',
  'ts',
  'tsx',
  'jsx',
  'css',
  'html',
  'xml',
  'yml',
  'yaml',
  'env',
  'sh',
  'py',
  'java',
  'c',
  'cpp',
  'h',
  'go',
  'rs',
  'php',
  'sql',
  'toml',
  'ini',
  'gitignore',
  'mjs',
  'cjs',
  'svg',
  'dockerfile',
  'conf',
  'config',
  'log',
  'csv',
]);
const DEFAULT_REMOTE_TERMINAL_ROOT = BUILDER_BOX_ROOT;
const DEFAULT_REMOTE_PROJECT_ROOT = BUILDER_REMOTE_PROJECT_PATH;
const MAX_TERMINAL_HISTORY = 80;
const MAX_TERMINAL_TABS = 6;
const CORE_WORKSPACE_TABS: Array<{
  id: Extract<ViewTab, 'code' | 'preview' | 'canvas'>;
  label: string;
  icon: typeof Code2;
}> = [
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'preview', label: 'Preview', icon: Play },
  { id: 'canvas', label: 'Canvas', icon: LayoutTemplate },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getFileExtension(path: string) {
  const extension = path.split('.').pop();
  return extension ? extension.toLowerCase() : '';
}

function isEditableFile(path: string) {
  const extension = getFileExtension(path);
  const basename = path.split('/').pop() ?? '';
  return (
    EDITABLE_FILE_EXTENSIONS.has(extension) ||
    basename.startsWith('.') ||
    ['Dockerfile', 'Makefile', 'Procfile', 'Gemfile', 'Podfile', 'Brewfile', 'Rakefile', 'Jenkinsfile'].includes(
      basename,
    )
  );
}

function getEditorLanguage(path: string | null) {
  if (!path) return 'plaintext';
  const extension = getFileExtension(path);
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    html: 'html',
    css: 'css',
    scss: 'scss',
    md: 'markdown',
    py: 'python',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
    sql: 'sql',
    sh: 'shell',
    env: 'shell',
    toml: 'ini',
    ini: 'ini',
    rs: 'rust',
    go: 'go',
    php: 'php',
    java: 'java',
  };

  return languageMap[extension] || 'plaintext';
}

function getDefaultTerminalCwd(project: BuilderProjectRecord) {
  return getBuilderProjectRemoteWorkspaceRoot(project);
}

function formatTerminalPrompt(cwd: string) {
  return `indexblue:${cwd}$`;
}

function getProjectBuilderMode(project: BuilderProjectRecord): 'local' | 'web' | 'apps' | 'ssh' {
  return deriveBuilderProjectMode(project);
}

function isAppBuilderProject(project: BuilderProjectRecord) {
  return isAppBuilderWorkspaceProject(project);
}

function createTerminalSession(index: number, cwd: string, boxId = ''): TerminalSession {
  return {
    id: `terminal-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    title: `Terminal ${index}`,
    cwd,
    input: '',
    draftInput: '',
    history: [],
    historyIndex: null,
    output: '',
    commandError: null,
    boxId,
    providerTerminalId: '',
    isRunning: false,
  };
}

function appendTerminalText(buffer: string, chunk: string, limit = 180_000) {
  const next = `${buffer}${chunk}`;
  return next.length > limit ? next.slice(next.length - limit) : next;
}

function formatRuntimeTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatRuntimeLogBuffer(consoleEntries: BuildConsoleEntry[]) {
  if (consoleEntries.length === 0) {
    return 'Runtime logs will appear here as the builder starts previews, runs commands, edits files, and reports errors.\n';
  }

  return [...consoleEntries]
    .reverse()
    .map((entry) => {
      const status =
        entry.status === 'running'
          ? 'RUNNING'
          : entry.status === 'completed'
            ? 'DONE'
            : entry.status === 'error'
              ? 'ERROR'
              : 'INFO';

      const lines = [`[${formatRuntimeTimestamp(entry.timestamp)}] ${status} ${entry.title}`];
      const detail = entry.detail.trim();
      if (detail) {
        lines.push(detail);
      }

      return lines.join('\n');
    })
    .join('\n\n');
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getWorkspaceRawAssetUrl(projectId: string, relativePath: string) {
  return `/api/builder/projects/${projectId}/file?path=${encodeURIComponent(relativePath)}&raw=1`;
}

function getFilePreviewKind(selectedFilePath: string | null, fileRecord: FileRecord | undefined) {
  if (!selectedFilePath || !fileRecord) return 'empty';
  if (fileRecord.kind !== 'text') return fileRecord.kind;

  const extension = getFileExtension(selectedFilePath);
  if (IMAGE_FILE_EXTENSIONS.has(extension)) return 'image';
  if (AUDIO_FILE_EXTENSIONS.has(extension)) return 'audio';
  if (VIDEO_FILE_EXTENSIONS.has(extension)) return 'video';
  if (PDF_FILE_EXTENSIONS.has(extension)) return 'pdf';
  return fileRecord.kind;
}

function flattenWorkspaceTree(nodes: BuilderWorkspaceNode[]): BuilderWorkspaceNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenWorkspaceTree(node.children) : [])]);
}

function pickInitialFile(nodes: BuilderWorkspaceNode[]) {
  const files = flattenWorkspaceTree(nodes).filter((node) => node.type === 'file');
  const preferred = [
    'app/index.tsx',
    'app/_layout.tsx',
    'src/app/index.tsx',
    'app/page.tsx',
    'src/app/page.tsx',
    'pages/index.tsx',
    'src/pages/index.tsx',
    'index.html',
    'package.json',
    'README.md',
  ];

  for (const candidate of preferred) {
    const found = files.find((node) => node.path === candidate);
    if (found) return found.path;
  }

  return files[0]?.path ?? null;
}

function createDefaultExpandedFolders(nodes: BuilderWorkspaceNode[], selectedFilePath: string | null) {
  const expanded: Record<string, boolean> = {};

  for (const node of nodes) {
    if (node.type === 'folder') expanded[node.path] = true;
  }

  if (selectedFilePath) {
    const segments = selectedFilePath.split('/');
    let current = '';
    for (const segment of segments.slice(0, -1)) {
      current = current ? `${current}/${segment}` : segment;
      expanded[current] = true;
    }
  }

  return expanded;
}

function getMessageText(message: ChatMessage) {
  return (message.parts ?? [])
    .filter((part) => part.type === 'text' || part.type === 'reasoning')
    .map((part) => ('text' in part ? part.text : ''))
    .join('\n\n')
    .trim();
}

function getToolLabels(message: ChatMessage) {
  return (message.parts ?? [])
    .filter((part) => typeof part.type === 'string' && part.type.startsWith('tool-'))
    .map((part) => part.type.replace('tool-', '').replaceAll('_', ' '));
}

function trimText(value: string, max = 2200) {
  return value.length > max ? `${value.slice(0, max)}\n...` : value;
}

function getConsoleEntryId(data: DataBuildSearchPart['data']) {
  switch (data.kind) {
    case 'exec':
      return `exec:${data.execId}`;
    case 'exec_output':
      return `exec:${data.execId}`;
    case 'write':
      return `write:${data.writeId}`;
    case 'read':
      return `read:${data.readId}`;
    case 'list':
      return `list:${data.listId}`;
    case 'download':
      return `download:${data.downloadId}`;
    case 'preview':
      return `preview:${data.previewId}`;
    case 'agent':
      return `agent:${data.agentId}`;
    case 'code':
      return `code:${data.codeId}`;
    case 'search_query':
      return `search_query:${data.searchId}:${data.queryId}`;
    case 'search_source':
      return `search_source:${data.searchId}:${data.queryId}:${data.source.url}`;
    case 'search_content':
      return `search_content:${data.searchId}:${data.queryId}:${data.content.url}`;
  }
}

function buildConsoleEntry(data: DataBuildSearchPart['data'], previous?: BuildConsoleEntry): BuildConsoleEntry {
  const now = Date.now();

  switch (data.kind) {
    case 'exec':
      return {
        id: getConsoleEntryId(data),
        source: 'exec',
        title: data.command,
        detail: trimText(data.status === 'error' ? data.stderr || '' : data.stdout || ''),
        status: data.status === 'running' ? 'running' : data.status === 'error' ? 'error' : 'completed',
        level: data.status === 'error' ? 'error' : data.status === 'running' ? 'warning' : 'success',
        timestamp: now,
      };
    case 'write':
      return {
        id: getConsoleEntryId(data),
        source: 'fs',
        title: `Wrote ${data.path}`,
        detail: trimText(data.contentPreview || ''),
        status: 'completed',
        level: 'success',
        timestamp: now,
      };
    case 'read':
      return {
        id: getConsoleEntryId(data),
        source: 'fs',
        title: `Read ${data.path}`,
        detail: trimText(data.content || ''),
        status: 'completed',
        level: 'default',
        timestamp: now,
      };
    case 'list':
      return {
        id: getConsoleEntryId(data),
        source: 'fs',
        title: `Listed ${data.path}`,
        detail: trimText(data.files.map((file) => `${file.isDir ? 'dir' : 'file'}  ${file.name}`).join('\n')),
        status: 'completed',
        level: 'default',
        timestamp: now,
      };
    case 'download':
      return {
        id: getConsoleEntryId(data),
        source: 'fs',
        title: `Prepared download ${data.filename}`,
        detail: data.url,
        status: 'completed',
        level: 'success',
        timestamp: now,
      };
    case 'preview':
      return {
        id: getConsoleEntryId(data),
        source: 'preview',
        title: `Preview ready on port ${data.port}`,
        detail: data.url,
        status: 'completed',
        level: 'success',
        timestamp: now,
      };
    case 'agent':
      return {
        id: getConsoleEntryId(data),
        source: 'agent',
        title:
          data.event?.type === 'tool_call'
            ? `Agent used ${data.event.toolName}`
            : data.status === 'completed'
              ? 'Builder agent completed'
              : data.status === 'error'
                ? 'Builder agent failed'
                : 'Builder agent',
        detail: trimText(
          data.event?.type === 'text_delta'
            ? `${previous?.detail || ''}${data.event.text}`
            : data.result || previous?.detail || data.prompt,
        ),
        status: data.status === 'streaming' || data.status === 'running' ? 'running' : data.status,
        level: data.status === 'error' ? 'error' : data.status === 'completed' ? 'success' : 'warning',
        timestamp: now,
      };
    case 'code':
      return {
        id: getConsoleEntryId(data),
        source: 'code',
        title: data.status === 'error' ? `Code run failed (${data.lang})` : `Ran ${data.lang} snippet`,
        detail: trimText(data.result || data.code),
        status: data.status === 'running' ? 'running' : data.status === 'error' ? 'error' : 'completed',
        level: data.status === 'error' ? 'error' : data.status === 'running' ? 'warning' : 'success',
        timestamp: now,
      };
    case 'search_query':
      return {
        id: getConsoleEntryId(data),
        source: 'search',
        title: `${data.actionTitle || 'Research'}: ${data.query}`,
        detail: `Step ${data.index} of ${data.total}`,
        status:
          data.status === 'reading_content' || data.status === 'started'
            ? 'running'
            : data.status === 'error'
              ? 'error'
              : 'completed',
        level: data.status === 'error' ? 'error' : data.status === 'completed' ? 'success' : 'warning',
        timestamp: now,
      };
    case 'search_source':
      return {
        id: getConsoleEntryId(data),
        source: 'search',
        title: `Source: ${data.source.title}`,
        detail: data.source.url,
        status: 'completed',
        level: 'default',
        timestamp: now,
      };
    case 'search_content':
      return {
        id: getConsoleEntryId(data),
        source: 'search',
        title: `Opened source content: ${data.content.title}`,
        detail: trimText(data.content.text || data.content.url),
        status: 'completed',
        level: 'default',
        timestamp: now,
      };
    case 'exec_output':
      return {
        id: getConsoleEntryId(data),
        source: 'exec',
        title: 'Streaming command output',
        detail: trimText(data.chunk),
        status: 'running',
        level: 'warning',
        timestamp: now,
      };
  }
}

function formatConsoleTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

function replacePathPrefix(value: string, fromPath: string, toPath: string) {
  if (value === fromPath) return toPath;
  if (value.startsWith(`${fromPath}/`)) return `${toPath}${value.slice(fromPath.length)}`;
  return value;
}

function buildPreviewSource(selectedFilePath: string | null, fileRecord: FileRecord | undefined) {
  if (!selectedFilePath || fileRecord?.kind !== 'text' || !fileRecord.content) return null;
  return PREVIEWABLE_EXTENSIONS.has(getFileExtension(selectedFilePath)) ? fileRecord.content : null;
}

function filterWorkspaceTree(nodes: BuilderWorkspaceNode[], query: string): BuilderWorkspaceNode[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return nodes;

  return nodes
    .map((node) => {
      if (node.type === 'folder') {
        const children = filterWorkspaceTree(node.children ?? [], query);
        if (children.length > 0 || node.name.toLowerCase().includes(trimmed)) {
          return {
            ...node,
            children,
          };
        }
        return null;
      }

      return node.name.toLowerCase().includes(trimmed) || node.path.toLowerCase().includes(trimmed) ? node : null;
    })
    .filter((node): node is BuilderWorkspaceNode => node !== null);
}

export function BuilderProjectWorkspace({
  project,
  initialMessages,
  initialTree,
}: {
  project: BuilderProjectRecord;
  initialMessages: ChatMessage[];
  initialTree: BuilderWorkspaceNode[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAppWorkspace = isAppBuilderProject(project);
  const runtimeProvider = useMemo(() => getBuilderProjectRuntimeProvider(project), [project]);
  const availableWorkspaceToolTabs = useMemo<BuilderAppToolTabId[]>(
    () => (isAppWorkspace ? BUILDER_APP_TOOL_TABS.map((tab) => tab.id) : WEB_WORKSPACE_TOOL_TABS),
    [isAppWorkspace],
  );
  const [viewTab, setViewTab] = useState<ViewTab>('canvas');
  const [openAppTabs, setOpenAppTabs] = useState<BuilderAppToolTabId[]>([]);
  const [bottomTab, setBottomTab] = useState<BottomTab>('logs');
  const [mobileTab, setMobileTab] = useState<MobileTab>('workbench');
  const [chatInput, setChatInput] = useState('');
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [tree, setTree] = useState(initialTree);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [isRefreshingTree, setIsRefreshingTree] = useState(false);
  const [isRestartingRuntime, setIsRestartingRuntime] = useState(false);
  const [consoleEntries, setConsoleEntries] = useState<BuildConsoleEntry[]>([]);
  const [runtimeLogOutput, setRuntimeLogOutput] = useState('');
  const [appLiveSession, setAppLiveSession] = useState<BuilderProjectLiveSession | null>(
    project.metadata?.liveSession ?? null,
  );
  const defaultTerminalCwd = useMemo(
    () => appLiveSession?.remoteWorkspaceRoot || getDefaultTerminalCwd(project),
    [appLiveSession?.remoteWorkspaceRoot, project],
  );
  const [terminals, setTerminals] = useState<TerminalSession[]>([
    createTerminalSession(1, defaultTerminalCwd, project.boxId ?? ''),
  ]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState(project.metadata?.liveSession?.previewUrl ?? '');
  const [previewPath, setPreviewPath] = useState('/');
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const initialFilePath = useMemo(() => pickInitialFile(initialTree), [initialTree]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(initialFilePath);
  const [openFiles, setOpenFiles] = useState<string[]>(initialFilePath ? [initialFilePath] : []);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(
    createDefaultExpandedFolders(initialTree, initialFilePath),
  );
  const [fileRecords, setFileRecords] = useState<Record<string, FileRecord>>({});
  const [draftContents, setDraftContents] = useState<Record<string, string>>({});
  const [dirtyFiles, setDirtyFiles] = useState<Record<string, boolean>>({});
  const [savingFiles, setSavingFiles] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string | null>>({});
  const [entryDraft, setEntryDraft] = useState<ExplorerEntryDraft | null>(null);
  const [isBootstrappingAppSession, setIsBootstrappingAppSession] = useState(false);
  const dirtyFilesRef = useRef<Record<string, boolean>>({});
  const appSessionBootstrapAttemptedRef = useRef(false);
  const terminalAbortControllersRef = useRef<Record<string, AbortController | null>>({});
  const activeTerminal = useMemo(
    () => terminals.find((terminal) => terminal.id === activeTerminalId) ?? terminals[0] ?? null,
    [activeTerminalId, terminals],
  );

  useEffect(() => {
    dirtyFilesRef.current = dirtyFiles;
  }, [dirtyFiles]);

  useEffect(() => {
    setAppLiveSession(project.metadata?.liveSession ?? null);
    setPreviewUrl(project.metadata?.liveSession?.previewUrl ?? '');
    appSessionBootstrapAttemptedRef.current = false;
  }, [project.id, project.metadata?.liveSession]);

  useEffect(() => {
    if (!activeTerminalId && terminals[0]) {
      setActiveTerminalId(terminals[0].id);
    }
  }, [activeTerminalId, terminals]);

  useEffect(() => {
    if (!appLiveSession) return;

    if (appLiveSession.previewUrl) {
      setPreviewUrl((current) => current || appLiveSession.previewUrl || '');
    }

    setTerminals((current) =>
      current.map((terminal) => ({
        ...terminal,
        cwd: terminal.cwd || appLiveSession.remoteWorkspaceRoot || defaultTerminalCwd,
        boxId: appLiveSession.sandboxId || terminal.boxId,
      })),
    );
  }, [appLiveSession, defaultTerminalCwd]);

  useEffect(() => {
    if (
      !isAppWorkspace ||
      isBootstrappingAppSession ||
      appSessionBootstrapAttemptedRef.current ||
      (appLiveSession?.status === 'ready' && appLiveSession.previewUrl)
    ) {
      return;
    }

    let cancelled = false;

    const bootstrapSession = async () => {
      appSessionBootstrapAttemptedRef.current = true;
      setIsBootstrappingAppSession(true);

      try {
        const response = await fetch(`/api/builder/projects/${project.id}/app-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          boxId?: string;
          liveSession?: BuilderProjectLiveSession;
        } | null;

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to start the mobile app session.');
        }

        if (cancelled) return;

        const liveSession = payload?.liveSession ?? null;
        if (liveSession) {
          setAppLiveSession(liveSession);
          if (liveSession.previewUrl) {
            setPreviewUrl(liveSession.previewUrl);
          }
          if (payload?.boxId) {
            setTerminals((current) =>
              current.map((terminal) => ({
                ...terminal,
                boxId: payload.boxId || terminal.boxId,
                cwd: terminal.cwd || liveSession.remoteWorkspaceRoot || defaultTerminalCwd,
              })),
            );
          }
        }
      } catch (error) {
        if (cancelled) return;
        setConsoleEntries((current) => [
          {
            id: `app-session-${Date.now()}`,
            source: 'preview',
            title: 'App session bootstrap',
            detail: normalizeError(error),
            status: 'error',
            level: 'error',
            timestamp: Date.now(),
          },
          ...current.slice(0, 99),
        ]);
      } finally {
        if (!cancelled) {
          setIsBootstrappingAppSession(false);
        }
      }
    };

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [
    appLiveSession?.previewUrl,
    appLiveSession?.status,
    defaultTerminalCwd,
    isAppWorkspace,
    isBootstrappingAppSession,
    project.id,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(`builder-layout:${project.id}`);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        chatWidth?: number;
        terminalHeight?: number;
        isChatOpen?: boolean;
        showTerminal?: boolean;
        viewTab?: string;
        openAppTabs?: string[];
        bottomTab?: BottomTab;
      };

      if (typeof parsed.chatWidth === 'number') setChatWidth(clamp(parsed.chatWidth, MIN_CHAT_WIDTH, MAX_CHAT_WIDTH));
      if (typeof parsed.terminalHeight === 'number')
        setTerminalHeight(clamp(parsed.terminalHeight, MIN_TERMINAL_HEIGHT, MAX_TERMINAL_HEIGHT));
      if (typeof parsed.isChatOpen === 'boolean') setIsChatOpen(parsed.isChatOpen);
      if (typeof parsed.showTerminal === 'boolean') setShowTerminal(parsed.showTerminal);
      if (
        parsed.viewTab === 'code' ||
        parsed.viewTab === 'preview' ||
        parsed.viewTab === 'canvas' ||
        (parsed.viewTab && isBuilderAppToolTabId(parsed.viewTab) && availableWorkspaceToolTabs.includes(parsed.viewTab))
      ) {
        setViewTab(parsed.viewTab);
      }
      if (Array.isArray(parsed.openAppTabs)) {
        setOpenAppTabs(
          parsed.openAppTabs.filter(
            (tabId): tabId is BuilderAppToolTabId =>
              isBuilderAppToolTabId(tabId) && availableWorkspaceToolTabs.includes(tabId),
          ),
        );
      }
      if (parsed.bottomTab) setBottomTab(parsed.bottomTab);
    } catch {
      window.localStorage.removeItem(`builder-layout:${project.id}`);
    }
  }, [availableWorkspaceToolTabs, project.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(`builder-terminal:${project.id}`);
    if (!raw) {
      const initialTerminal = createTerminalSession(1, defaultTerminalCwd, project.boxId ?? '');
      setTerminals([initialTerminal]);
      setActiveTerminalId(initialTerminal.id);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        activeTerminalId?: string | null;
        terminals?: Array<Partial<TerminalSession>>;
      };
      const savedTerminals = Array.isArray(parsed.terminals)
        ? parsed.terminals.slice(0, MAX_TERMINAL_TABS).map((terminal, index) => ({
            id: typeof terminal.id === 'string' ? terminal.id : createTerminalSession(index + 1, defaultTerminalCwd).id,
            title: typeof terminal.title === 'string' ? terminal.title : `Terminal ${index + 1}`,
            cwd: typeof terminal.cwd === 'string' && terminal.cwd.startsWith('/') ? terminal.cwd : defaultTerminalCwd,
            input: '',
            draftInput: '',
            history: Array.isArray(terminal.history)
              ? terminal.history
                  .filter((entry): entry is string => typeof entry === 'string')
                  .slice(-MAX_TERMINAL_HISTORY)
              : [],
            historyIndex: null,
            output: '',
            commandError: null,
            boxId: typeof terminal.boxId === 'string' ? terminal.boxId : (project.boxId ?? ''),
            providerTerminalId: typeof terminal.providerTerminalId === 'string' ? terminal.providerTerminalId : '',
            isRunning: false,
          }))
        : [];
      const nextTerminals =
        savedTerminals.length > 0
          ? savedTerminals
          : [createTerminalSession(1, defaultTerminalCwd, project.boxId ?? '')];
      setTerminals(nextTerminals);
      setActiveTerminalId(
        nextTerminals.some((terminal) => terminal.id === parsed.activeTerminalId)
          ? (parsed.activeTerminalId ?? nextTerminals[0]?.id ?? null)
          : (nextTerminals[0]?.id ?? null),
      );
    } catch {
      window.localStorage.removeItem(`builder-terminal:${project.id}`);
      const initialTerminal = createTerminalSession(1, defaultTerminalCwd, project.boxId ?? '');
      setTerminals([initialTerminal]);
      setActiveTerminalId(initialTerminal.id);
    }
  }, [defaultTerminalCwd, project.boxId, project.id]);

  useEffect(() => {
    if (isBuilderAppToolTabId(viewTab) && !availableWorkspaceToolTabs.includes(viewTab)) {
      setViewTab('canvas');
    }

    setOpenAppTabs((current) => {
      const next = current.filter((tabId) => availableWorkspaceToolTabs.includes(tabId));
      return next.length === current.length ? current : next;
    });
  }, [availableWorkspaceToolTabs, viewTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      `builder-layout:${project.id}`,
      JSON.stringify({
        chatWidth,
        terminalHeight,
        isChatOpen,
        showTerminal,
        viewTab,
        openAppTabs,
        bottomTab,
      }),
    );
  }, [bottomTab, chatWidth, isChatOpen, openAppTabs, project.id, showTerminal, terminalHeight, viewTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      `builder-terminal:${project.id}`,
      JSON.stringify({
        activeTerminalId: activeTerminal?.id ?? null,
        terminals: terminals.map((terminal) => ({
          id: terminal.id,
          title: terminal.title,
          cwd: terminal.cwd,
          history: terminal.history.slice(-MAX_TERMINAL_HISTORY),
          boxId: terminal.boxId,
          providerTerminalId: terminal.providerTerminalId,
        })),
      }),
    );
  }, [activeTerminal, project.id, terminals]);

  useEffect(
    () => () => {
      for (const controller of Object.values(terminalAbortControllersRef.current)) {
        controller?.abort();
      }
    },
    [],
  );

  const refreshTree = useCallback(async () => {
    setIsRefreshingTree(true);
    setTreeError(null);

    try {
      const response = await fetch(`/api/builder/projects/${project.id}/tree`, { cache: 'no-store' });
      const payload = (await response.json()) as { error?: string; tree?: BuilderWorkspaceNode[] };

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load workspace tree.');
      }

      const nextTree = payload.tree ?? [];
      setTree(nextTree);
      setExpandedFolders((current) => ({
        ...createDefaultExpandedFolders(nextTree, selectedFilePath),
        ...current,
      }));
    } catch (error) {
      setTreeError(normalizeError(error));
    } finally {
      setIsRefreshingTree(false);
    }
  }, [project.id, selectedFilePath]);

  const restartRuntime = useCallback(async () => {
    if (isRestartingRuntime) return;

    setIsRestartingRuntime(true);
    setConsoleEntries((current) => {
      const nextEntry: BuildConsoleEntry = {
        id: `runtime-rerun:${Date.now()}`,
        source: 'preview',
        title: runtimeProvider === 'codesandbox' ? 'Restarting CodeSandbox runtime' : 'Restarting runtime',
        detail: project.name,
        status: 'running',
        level: 'default',
        timestamp: Date.now(),
      };
      return [nextEntry, ...current].slice(0, 250);
    });

    try {
      const response = await fetch(`/api/builder/projects/${project.id}/runtime`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'rerun' }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        boxId?: string | null;
        previewUrl?: string | null;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to restart the runtime.');
      }

      if (payload?.previewUrl) {
        setPreviewUrl(payload.previewUrl);
        setViewTab('preview');
      }

      setTerminals((current) =>
        current.map((terminal) => ({
          ...terminal,
          boxId: payload?.boxId ?? terminal.boxId,
          providerTerminalId: runtimeProvider === 'codesandbox' ? '' : terminal.providerTerminalId,
          isRunning: false,
          commandError: null,
          output: appendTerminalText(
            terminal.output,
            `${
              terminal.output.length === 0 || terminal.output.endsWith('\n') ? '' : '\n'
            }[runtime restarted${payload?.previewUrl ? ` • preview ready ${payload.previewUrl}` : ''}]\n`,
          ),
        })),
      );

      setConsoleEntries((current) => {
        const nextEntry: BuildConsoleEntry = {
          id: `runtime-rerun:done:${Date.now()}`,
          source: 'preview',
          title: runtimeProvider === 'codesandbox' ? 'CodeSandbox restarted' : 'Runtime restarted',
          detail: payload?.previewUrl ?? project.name,
          status: 'completed',
          level: 'success',
          timestamp: Date.now(),
        };
        return [nextEntry, ...current].slice(0, 250);
      });

      await refreshTree();
    } catch (error) {
      const message = normalizeError(error);
      setConsoleEntries((current) => {
        const nextEntry: BuildConsoleEntry = {
          id: `runtime-rerun:error:${Date.now()}`,
          source: 'preview',
          title: runtimeProvider === 'codesandbox' ? 'CodeSandbox restart failed' : 'Runtime restart failed',
          detail: message,
          status: 'error',
          level: 'error',
          timestamp: Date.now(),
        };
        return [nextEntry, ...current].slice(0, 250);
      });
      setTerminals((current) =>
        current.map((terminal) => ({
          ...terminal,
          isRunning: false,
          commandError: message,
          output: appendTerminalText(terminal.output, `[runtime restart failed] ${message}\n`),
        })),
      );
    } finally {
      setIsRestartingRuntime(false);
    }
  }, [isRestartingRuntime, project.id, project.name, refreshTree, runtimeProvider]);

  const loadFile = useCallback(
    async (path: string, force = false) => {
      setFileRecords((current) => {
        if (!force && (current[path]?.content != null || current[path]?.isLoading)) return current;
        return {
          ...current,
          [path]: {
            content: null,
            error: null,
            isLoading: true,
            kind: 'text',
            mimeType: null,
            size: 0,
          },
        };
      });

      try {
        const response = await fetch(`/api/builder/projects/${project.id}/file?path=${encodeURIComponent(path)}`, {
          cache: 'no-store',
        });
        const payload = (await response.json()) as {
          error?: string;
          content?: string | null;
          kind?: FileRecord['kind'];
          mimeType?: string;
          size?: number;
        };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load file.');
        }

        setFileRecords((current) => ({
          ...current,
          [path]: {
            content: payload.content ?? null,
            error: null,
            isLoading: false,
            kind: payload.kind ?? 'text',
            mimeType: payload.mimeType ?? null,
            size: typeof payload.size === 'number' ? payload.size : 0,
          },
        }));
        setDraftContents((current) =>
          dirtyFilesRef.current[path] || payload.kind !== 'text'
            ? current
            : { ...current, [path]: payload.content ?? '' },
        );
        setSaveErrors((current) => ({ ...current, [path]: null }));
      } catch (error) {
        setFileRecords((current) => ({
          ...current,
          [path]: {
            content: null,
            error: normalizeError(error),
            isLoading: false,
            kind: 'binary',
            mimeType: null,
            size: 0,
          },
        }));
      }
    },
    [project.id],
  );

  const openFile = useCallback(
    (path: string) => {
      setSelectedFilePath(path);
      setOpenFiles((current) => (current.includes(path) ? current : [...current, path]));
      void loadFile(path);
    },
    [loadFile],
  );

  const closeFile = useCallback(
    (path: string) => {
      setOpenFiles((current) => {
        const next = current.filter((entry) => entry !== path);
        if (selectedFilePath === path) {
          setSelectedFilePath(next[next.length - 1] ?? pickInitialFile(tree));
        }
        return next;
      });
    },
    [selectedFilePath, tree],
  );

  useEffect(() => {
    if (!selectedFilePath) return;
    void loadFile(selectedFilePath);
  }, [loadFile, selectedFilePath]);

  const updateDraftContent = useCallback(
    (path: string, value: string) => {
      setDraftContents((current) => ({ ...current, [path]: value }));
      setDirtyFiles((current) => ({
        ...current,
        [path]: (fileRecords[path]?.content ?? '') !== value,
      }));
      setSaveErrors((current) => ({ ...current, [path]: null }));
    },
    [fileRecords],
  );

  const saveFile = useCallback(
    async (path: string) => {
      const content = draftContents[path];
      if (content == null || savingFiles[path]) return;

      setSavingFiles((current) => ({ ...current, [path]: true }));
      setSaveErrors((current) => ({ ...current, [path]: null }));

      try {
        const response = await fetch(`/api/builder/projects/${project.id}/file`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            path,
            content,
          }),
        });
        const payload = (await response.json()) as { error?: string; ok?: boolean };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to save file.');
        }

        setFileRecords((current) => ({
          ...current,
          [path]: {
            content,
            error: null,
            isLoading: false,
            kind: current[path]?.kind ?? 'text',
            mimeType: current[path]?.mimeType ?? 'text/plain; charset=utf-8',
            size: content.length,
          },
        }));
        setDirtyFiles((current) => ({ ...current, [path]: false }));
        setConsoleEntries((current) => {
          const nextEntry: BuildConsoleEntry = {
            id: `manual-save:${path}:${Date.now()}`,
            source: 'fs',
            title: `Saved ${path}`,
            detail: trimText(content),
            status: 'completed',
            level: 'success',
            timestamp: Date.now(),
          };
          return [nextEntry, ...current].slice(0, 250);
        });
      } catch (error) {
        const message = normalizeError(error);
        setSaveErrors((current) => ({ ...current, [path]: message }));
        setConsoleEntries((current) => {
          const nextEntry: BuildConsoleEntry = {
            id: `manual-save-error:${path}:${Date.now()}`,
            source: 'fs',
            title: `Failed to save ${path}`,
            detail: message,
            status: 'error',
            level: 'error',
            timestamp: Date.now(),
          };
          return [nextEntry, ...current].slice(0, 250);
        });
      } finally {
        setSavingFiles((current) => ({ ...current, [path]: false }));
      }
    },
    [draftContents, project.id, savingFiles],
  );

  const createEntry = useCallback(
    async (relativePath: string, type: 'file' | 'folder') => {
      try {
        const response = await fetch(`/api/builder/projects/${project.id}/file`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'create',
            path: relativePath,
            type,
            content: type === 'file' ? '' : undefined,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to create workspace entry.');
        }

        await refreshTree();
        setEntryDraft(null);

        if (type === 'file') {
          openFile(relativePath);
        }
      } catch (error) {
        setTreeError(normalizeError(error));
      }
    },
    [openFile, project.id, refreshTree],
  );

  const renameEntry = useCallback(
    async (fromPath: string, nextPath: string) => {
      try {
        const response = await fetch(`/api/builder/projects/${project.id}/file`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'rename',
            path: fromPath,
            nextPath,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to rename workspace entry.');
        }

        setOpenFiles((current) => current.map((item) => replacePathPrefix(item, fromPath, nextPath)));
        setSelectedFilePath((current) => (current ? replacePathPrefix(current, fromPath, nextPath) : current));
        setDraftContents((current) =>
          Object.fromEntries(
            Object.entries(current).map(([key, value]) => [replacePathPrefix(key, fromPath, nextPath), value]),
          ),
        );
        setDirtyFiles((current) =>
          Object.fromEntries(
            Object.entries(current).map(([key, value]) => [replacePathPrefix(key, fromPath, nextPath), value]),
          ),
        );
        setSavingFiles((current) =>
          Object.fromEntries(
            Object.entries(current).map(([key, value]) => [replacePathPrefix(key, fromPath, nextPath), value]),
          ),
        );
        setSaveErrors((current) =>
          Object.fromEntries(
            Object.entries(current).map(([key, value]) => [replacePathPrefix(key, fromPath, nextPath), value]),
          ),
        );
        setFileRecords((current) =>
          Object.fromEntries(
            Object.entries(current).map(([key, value]) => [replacePathPrefix(key, fromPath, nextPath), value]),
          ),
        );
        setEntryDraft(null);
        await refreshTree();
      } catch (error) {
        setTreeError(normalizeError(error));
      }
    },
    [project.id, refreshTree],
  );

  const deleteEntry = useCallback(
    async (path: string) => {
      try {
        const response = await fetch(`/api/builder/projects/${project.id}/file?path=${encodeURIComponent(path)}`, {
          method: 'DELETE',
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to delete workspace entry.');
        }

        setOpenFiles((current) => current.filter((item) => item !== path && !item.startsWith(`${path}/`)));
        setSelectedFilePath((current) => {
          if (!current) return current;
          if (current === path || current.startsWith(`${path}/`)) return null;
          return current;
        });
        setDraftContents((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => key !== path && !key.startsWith(`${path}/`))),
        );
        setDirtyFiles((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => key !== path && !key.startsWith(`${path}/`))),
        );
        setSavingFiles((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => key !== path && !key.startsWith(`${path}/`))),
        );
        setSaveErrors((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => key !== path && !key.startsWith(`${path}/`))),
        );
        setFileRecords((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => key !== path && !key.startsWith(`${path}/`))),
        );
        await refreshTree();
      } catch (error) {
        setTreeError(normalizeError(error));
      }
    },
    [project.id, refreshTree],
  );

  const persistCanvas = useCallback(
    async (canvas: BuilderCanvasState) => {
      const response = await fetch(`/api/builder/projects/${project.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          theme: project.theme ?? null,
          metadata: {
            ...(project.metadata ?? {}),
            canvas,
            panelState: {
              ...(project.metadata?.panelState ?? {}),
              activeTab: 'canvas',
            },
          },
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save canvas.');
      }
    },
    [project.id, project.metadata, project.theme],
  );

  const updateTerminal = useCallback((terminalId: string, updater: (terminal: TerminalSession) => TerminalSession) => {
    setTerminals((current) => current.map((terminal) => (terminal.id === terminalId ? updater(terminal) : terminal)));
  }, []);

  const clearActiveTerminal = useCallback(() => {
    if (!activeTerminal) return;
    updateTerminal(activeTerminal.id, (terminal) => ({
      ...terminal,
      output: '',
      commandError: null,
    }));
  }, [activeTerminal, updateTerminal]);

  const createNewTerminal = useCallback(() => {
    let createdId = '';
    setTerminals((current) => {
      if (current.length >= MAX_TERMINAL_TABS) return current;
      const next = createTerminalSession(
        current.length + 1,
        defaultTerminalCwd,
        activeTerminal?.boxId ?? project.boxId ?? '',
      );
      createdId = next.id;
      return [...current, next];
    });
    if (createdId) {
      setActiveTerminalId(createdId);
      setBottomTab('terminal');
      setShowTerminal(true);
    }
  }, [activeTerminal?.boxId, defaultTerminalCwd, project.boxId]);

  const closeTerminal = useCallback(
    (terminalId: string) => {
      const controller = terminalAbortControllersRef.current[terminalId];
      controller?.abort();
      delete terminalAbortControllersRef.current[terminalId];

      setTerminals((current) => {
        if (current.length <= 1) {
          const resetTerminal = createTerminalSession(1, defaultTerminalCwd, project.boxId ?? '');
          setActiveTerminalId(resetTerminal.id);
          return [resetTerminal];
        }

        const index = current.findIndex((terminal) => terminal.id === terminalId);
        const next = current
          .filter((terminal) => terminal.id !== terminalId)
          .map((terminal, nextIndex) => ({
            ...terminal,
            title: `Terminal ${nextIndex + 1}`,
          }));

        if (activeTerminalId === terminalId) {
          const fallback = next[Math.max(index - 1, 0)] ?? next[0] ?? null;
          setActiveTerminalId(fallback?.id ?? null);
        }

        return next;
      });
    },
    [activeTerminalId, defaultTerminalCwd, project.boxId],
  );

  const runTerminalCommand = useCallback(
    async (input?: string, terminalId?: string) => {
      const terminal = terminals.find((entry) => entry.id === (terminalId ?? activeTerminal?.id));
      if (!terminal) return;

      const rawCommand = (input ?? terminal.input).replace(/\r\n?/g, '\n');
      const trimmedCommand = rawCommand.trim();
      if (!trimmedCommand || terminal.isRunning) return;

      if (trimmedCommand === 'clear' || trimmedCommand === 'reset') {
        updateTerminal(terminal.id, (current) => ({
          ...current,
          output: '',
          commandError: null,
          input: '',
          draftInput: '',
          historyIndex: null,
        }));
        setBottomTab('terminal');
        setShowTerminal(true);
        return;
      }

      const command = rawCommand;

      setBottomTab('terminal');
      setShowTerminal(true);
      updateTerminal(terminal.id, (current) => ({
        ...current,
        commandError: null,
        input: '',
        draftInput: '',
        history: [...current.history, command].slice(-MAX_TERMINAL_HISTORY),
        historyIndex: null,
        isRunning: true,
        output: appendTerminalText(
          current.output,
          `${current.output.length === 0 || current.output.endsWith('\n') ? '' : '\n'}${formatTerminalPrompt(current.cwd)} ${command}\n`,
        ),
      }));

      setConsoleEntries((current) => {
        const nextEntry: BuildConsoleEntry = {
          id: `manual-terminal:${terminal.id}:${Date.now()}`,
          source: 'exec',
          title: `Terminal command: ${command}`,
          detail: terminal.cwd,
          status: 'running',
          level: 'default',
          timestamp: Date.now(),
        };
        return [nextEntry, ...current].slice(0, 250);
      });

      const abortController = new AbortController();
      terminalAbortControllersRef.current[terminal.id] = abortController;

      try {
        const response = await fetch(`/api/builder/projects/${project.id}/terminal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            command,
            cwd: terminal.cwd,
            terminalId: terminal.id,
            providerTerminalId: terminal.providerTerminalId ?? null,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || 'Failed to run terminal command.');
        }

        if (!response.body) {
          throw new Error('Terminal stream was not available.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const handleStreamEvent = (event: ManualTerminalStreamEvent) => {
          switch (event.type) {
            case 'started':
              updateTerminal(terminal.id, (current) => ({
                ...current,
                boxId: event.boxId,
                providerTerminalId: event.providerTerminalId || current.providerTerminalId,
                output: event.isNewBox
                  ? appendTerminalText(current.output, `[connected to sandbox ${event.boxId}]\n`)
                  : current.output,
              }));
              break;
            case 'output':
              updateTerminal(terminal.id, (current) => ({
                ...current,
                output: appendTerminalText(current.output, event.chunk),
              }));
              break;
            case 'preview':
              setPreviewUrl(event.url);
              updateTerminal(terminal.id, (current) => ({
                ...current,
                output: appendTerminalText(
                  current.output,
                  `${current.output.length === 0 || current.output.endsWith('\n') ? '' : '\n'}[preview ready] ${event.url}\n`,
                ),
              }));
              break;
            case 'exit':
              updateTerminal(terminal.id, (current) => ({
                ...current,
                cwd: event.cwd,
                isRunning: false,
                output: appendTerminalText(
                  current.output,
                  `${current.output.length === 0 || current.output.endsWith('\n') ? '' : '\n'}[process exited ${event.exitCode}]\n`,
                ),
              }));
              setConsoleEntries((current) => {
                const nextEntry: BuildConsoleEntry = {
                  id: `manual-terminal:done:${terminal.id}:${Date.now()}`,
                  source: 'exec',
                  title: `Completed: ${command}`,
                  detail: event.cwd,
                  status: event.exitCode === 0 ? 'completed' : 'error',
                  level: event.exitCode === 0 ? 'success' : 'error',
                  timestamp: Date.now(),
                };
                return [nextEntry, ...current].slice(0, 250);
              });
              break;
            case 'error':
              updateTerminal(terminal.id, (current) => ({
                ...current,
                isRunning: false,
                commandError: event.message,
                output: appendTerminalText(current.output, `[terminal error] ${event.message}\n`),
              }));
              setConsoleEntries((current) => {
                const nextEntry: BuildConsoleEntry = {
                  id: `manual-terminal:error:${terminal.id}:${Date.now()}`,
                  source: 'exec',
                  title: `Terminal failed: ${command}`,
                  detail: event.message,
                  status: 'error',
                  level: 'error',
                  timestamp: Date.now(),
                };
                return [nextEntry, ...current].slice(0, 250);
              });
              break;
            case 'cancelled':
              updateTerminal(terminal.id, (current) => ({
                ...current,
                isRunning: false,
                output: appendTerminalText(current.output, '[command cancelled]\n'),
              }));
              break;
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const boundary = buffer.indexOf('\n');
            if (boundary === -1) break;

            const line = buffer.slice(0, boundary).trim();
            buffer = buffer.slice(boundary + 1);

            if (!line) continue;
            handleStreamEvent(JSON.parse(line) as ManualTerminalStreamEvent);
          }
        }

        const finalLine = buffer.trim();
        if (finalLine) {
          handleStreamEvent(JSON.parse(finalLine) as ManualTerminalStreamEvent);
        }

        if (runtimeProvider === 'codesandbox') {
          void refreshTree();
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          updateTerminal(terminal.id, (current) => ({
            ...current,
            isRunning: false,
            output: appendTerminalText(current.output, '[command cancelled]\n'),
          }));
        } else {
          const message = normalizeError(error);
          updateTerminal(terminal.id, (current) => ({
            ...current,
            isRunning: false,
            commandError: message,
            output: appendTerminalText(current.output, `[terminal error] ${message}\n`),
          }));
          setConsoleEntries((current) => {
            const nextEntry: BuildConsoleEntry = {
              id: `manual-terminal:request-error:${terminal.id}:${Date.now()}`,
              source: 'exec',
              title: `Terminal request failed: ${command}`,
              detail: message,
              status: 'error',
              level: 'error',
              timestamp: Date.now(),
            };
            return [nextEntry, ...current].slice(0, 250);
          });
        }
      } finally {
        delete terminalAbortControllersRef.current[terminal.id];
        updateTerminal(terminal.id, (current) => ({
          ...current,
          isRunning: false,
        }));
      }
    },
    [activeTerminal, project.id, refreshTree, runtimeProvider, terminals, updateTerminal],
  );

  const stopTerminalCommand = useCallback(
    (terminalId?: string) => {
      const targetId = terminalId ?? activeTerminal?.id;
      if (!targetId) return;
      terminalAbortControllersRef.current[targetId]?.abort();
    },
    [activeTerminal?.id],
  );

  const cycleTerminalHistory = useCallback(
    (direction: 'up' | 'down', terminalId?: string) => {
      const target = terminals.find((entry) => entry.id === (terminalId ?? activeTerminal?.id));
      if (!target || target.history.length === 0) return;

      updateTerminal(target.id, (current) => {
        if (direction === 'up') {
          const nextIndex =
            current.historyIndex == null ? current.history.length - 1 : Math.max(current.historyIndex - 1, 0);
          return {
            ...current,
            draftInput: current.historyIndex == null ? current.input : current.draftInput,
            historyIndex: nextIndex,
            input: current.history[nextIndex] ?? '',
          };
        }

        if (current.historyIndex == null) return current;

        const nextIndex = current.historyIndex + 1;
        if (nextIndex >= current.history.length) {
          return {
            ...current,
            historyIndex: null,
            input: current.draftInput,
          };
        }

        return {
          ...current,
          historyIndex: nextIndex,
          input: current.history[nextIndex] ?? '',
        };
      });
    },
    [activeTerminal?.id, terminals, updateTerminal],
  );

  const setPromptSuggestion = useCallback((prompt: string) => {
    setChatInput(prompt);
    setIsChatOpen(true);

    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setMobileTab('chat');
    }
  }, []);

  const openAppWorkspaceTab = useCallback(
    (tabId: BuilderAppToolTabId) => {
      if (!availableWorkspaceToolTabs.includes(tabId)) return;
      setOpenAppTabs((current) => (current.includes(tabId) ? current : [...current, tabId]));
      setViewTab(tabId);
    },
    [availableWorkspaceToolTabs],
  );

  const closeAppWorkspaceTab = useCallback((tabId: BuilderAppToolTabId) => {
    setOpenAppTabs((current) => current.filter((entry) => entry !== tabId));
    setViewTab((current) => (current === tabId ? 'canvas' : current));
  }, []);

  const { messages, sendMessage, status, error, stop } = useChat<ChatMessage>({
    id: project.chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/search',
      prepareSendMessagesRequest({ messages: nextMessages, body }) {
        return {
          body: {
            id: project.chatId,
            messages: nextMessages,
            model: 'scira-default',
            group: 'chat',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            selectedVisibilityType: 'private',
            isCustomInstructionsEnabled: true,
            searchProvider: 'firecrawl',
            extremeSearchModel: 'scira-ext-1',
            selectedConnectors: [],
            isTemporaryChat: false,
            builderProjectId: project.id,
            ...body,
          },
        };
      },
    }),
    experimental_throttle: 100,
    onData: (dataPart) => {
      if (dataPart.type !== 'data-build_search') return;
      const activity = dataPart.data as DataBuildSearchPart['data'];

      if (activity.kind === 'exec_output') {
        setRuntimeLogOutput((current) => appendTerminalText(current, activity.chunk, 240_000));
        return;
      }

      if (activity.kind === 'exec' && activity.status === 'running') {
        setRuntimeLogOutput((current) =>
          appendTerminalText(
            current,
            `${current.endsWith('\n') || current.length === 0 ? '' : '\n'}$ ${activity.command}\n`,
            240_000,
          ),
        );
      }

      setConsoleEntries((current) => {
        const entryId = getConsoleEntryId(activity);
        const previous = current.find((item) => item.id === entryId);
        const nextEntry = buildConsoleEntry(activity, previous);
        const next = [nextEntry, ...current.filter((item) => item.id !== entryId)];
        return next.slice(0, 250);
      });

      if (activity.kind === 'exec' && activity.status !== 'running') {
        const footer =
          activity.status === 'error'
            ? `\n[process exited with error${activity.exitCode != null ? ` ${activity.exitCode}` : ''}]\n`
            : activity.exitCode != null
              ? `\n[process exited ${activity.exitCode}]\n`
              : '\n';
        setRuntimeLogOutput((current) => appendTerminalText(current, footer, 240_000));
      }

      if (activity.kind === 'preview') {
        setPreviewUrl(activity.url);
        setViewTab('preview');
        setRuntimeLogOutput((current) =>
          appendTerminalText(
            current,
            `${current.endsWith('\n') || current.length === 0 ? '' : '\n'}[preview ready] ${activity.url}\n`,
            240_000,
          ),
        );
      }
    },
    onFinish: async () => {
      await refreshTree();
    },
  });

  const submitMessage = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || status === 'submitted' || status === 'streaming') return;

      sendMessage({
        role: 'user',
        parts: [{ type: 'text', text: value }],
      });

      setChatInput('');
    },
    [sendMessage, status],
  );

  const stopGeneration = useCallback(async () => {
    await Promise.allSettled([stop(), fetch(`/api/search/${project.chatId}/stop`, { method: 'DELETE' })]);
  }, [project.chatId, stop]);

  const selectedFileRecord = selectedFilePath ? fileRecords[selectedFilePath] : undefined;
  const selectedEditorValue = selectedFilePath
    ? selectedFileRecord?.kind === 'text'
      ? (draftContents[selectedFilePath] ?? selectedFileRecord?.content ?? '')
      : ''
    : '';
  const selectedFileLines = useMemo(
    () => (selectedEditorValue ? selectedEditorValue.split('\n') : []),
    [selectedEditorValue],
  );
  const runtimeLogBuffer = useMemo(() => {
    const formattedEntries = formatRuntimeLogBuffer(consoleEntries);
    return runtimeLogOutput.trim().length > 0 ? `${formattedEntries}\n\n${runtimeLogOutput}` : formattedEntries;
  }, [consoleEntries, runtimeLogOutput]);
  const previewSource = buildPreviewSource(selectedFilePath, {
    content: selectedEditorValue,
    error: selectedFileRecord?.error ?? null,
    isLoading: selectedFileRecord?.isLoading ?? false,
    kind: selectedFileRecord?.kind ?? 'text',
    mimeType: selectedFileRecord?.mimeType ?? null,
    size: selectedFileRecord?.size ?? 0,
  });
  const errorItems = useMemo(() => {
    const items: string[] = [];

    for (const file of Object.values(fileRecords)) {
      if (file.error) items.push(file.error);
    }

    for (const entry of consoleEntries) {
      if (entry.level === 'error') items.push(`${entry.title}${entry.detail ? `\n${entry.detail}` : ''}`);
    }

    return Array.from(new Set(items)).slice(-100);
  }, [consoleEntries, fileRecords]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's' || !selectedFilePath) return;
      if (!dirtyFiles[selectedFilePath] || savingFiles[selectedFilePath]) return;
      event.preventDefault();
      void saveFile(selectedFilePath);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dirtyFiles, saveFile, savingFiles, selectedFilePath]);

  const startChatResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    event.preventDefault();
    const rect = container.getBoundingClientRect();

    const handleMove = (moveEvent: PointerEvent) => {
      const nextWidth = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      setChatWidth(clamp(nextWidth, MIN_CHAT_WIDTH, MAX_CHAT_WIDTH));
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, []);

  const startTerminalResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = terminalHeight;

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = startY - moveEvent.clientY;
        setTerminalHeight(clamp(startHeight + delta, MIN_TERMINAL_HEIGHT, MAX_TERMINAL_HEIGHT));
      };

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [terminalHeight],
  );

  const previewIframeSrc = previewUrl ? `${previewUrl.replace(/\/$/, '')}${previewPath}` : undefined;

  return (
    <div className={project.theme ?? undefined}>
      <div className="h-screen w-full overflow-hidden bg-[#101010] text-white">
        <div className="flex h-full flex-col overflow-hidden">
          <div className="border-b border-white/8 px-4 py-2.5 lg:hidden">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setMobileTab('chat')}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition',
                  mobileTab === 'chat' ? 'bg-white text-black' : 'text-white/65',
                )}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('workbench')}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition',
                  mobileTab === 'workbench' ? 'bg-white text-black' : 'text-white/65',
                )}
              >
                Workbench
              </button>
            </div>
          </div>

          <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden">
            <div className="hidden h-full lg:flex">
              {isChatOpen ? (
                <>
                  <ChatPane
                    chatInput={chatInput}
                    error={error}
                    messages={messages}
                    onInputChange={setChatInput}
                    onQuickPrompt={submitMessage}
                    quickPrompts={isAppWorkspace ? APP_QUICK_PROMPTS : QUICK_PROMPTS}
                    onStop={stopGeneration}
                    onSubmit={() => submitMessage(chatInput)}
                    project={project}
                    isAppWorkspace={isAppWorkspace}
                    status={status}
                    width={chatWidth}
                  />
                  <VerticalResizeHandle onPointerDown={startChatResize} />
                </>
              ) : null}

              <WorkbenchPane
                bottomTab={bottomTab}
                consoleEntries={consoleEntries}
                runtimeLogBuffer={runtimeLogBuffer}
                dirtyFiles={dirtyFiles}
                errorItems={errorItems}
                draftContents={draftContents}
                openFiles={openFiles}
                onClearConsole={() => {
                  setConsoleEntries([]);
                  setRuntimeLogOutput('');
                  clearActiveTerminal();
                }}
                onCloseFile={closeFile}
                onCreateEntry={createEntry}
                onDraftChange={updateDraftContent}
                onDeleteEntry={deleteEntry}
                onOpenFile={openFile}
                onRenameEntry={renameEntry}
                onSaveFile={saveFile}
                entryDraft={entryDraft}
                previewIframeSrc={previewIframeSrc}
                previewPath={previewPath}
                previewRefreshKey={previewRefreshKey}
                previewSource={previewSource}
                previewUrl={previewUrl}
                setPreviewUrl={setPreviewUrl}
                selectedFileLines={selectedFileLines}
                selectedFilePath={selectedFilePath}
                selectedFileRecord={selectedFileRecord}
                setBottomTab={setBottomTab}
                setExpandedFolders={setExpandedFolders}
                setIsPreviewFullscreen={setIsPreviewFullscreen}
                setPreviewPath={setPreviewPath}
                setPreviewRefreshKey={setPreviewRefreshKey}
                setSelectedFilePath={setSelectedFilePath}
                setEntryDraft={setEntryDraft}
                setShowTerminal={setShowTerminal}
                onRunTerminalCommand={runTerminalCommand}
                onStopTerminalCommand={stopTerminalCommand}
                onTerminalHistoryNavigate={cycleTerminalHistory}
                onTerminalInputChange={(value) => {
                  if (!activeTerminal) return;
                  updateTerminal(activeTerminal.id, (current) => ({
                    ...current,
                    input: value,
                    historyIndex: null,
                  }));
                }}
                setViewTab={setViewTab}
                saveErrors={saveErrors}
                showTerminal={showTerminal}
                savingFiles={savingFiles}
                startTerminalResize={startTerminalResize}
                terminals={terminals}
                activeTerminalId={activeTerminal?.id ?? null}
                onCreateTerminal={createNewTerminal}
                onCloseTerminal={closeTerminal}
                setActiveTerminalId={setActiveTerminalId}
                terminalHeight={terminalHeight}
                canvasState={project.metadata?.canvas}
                onPersistCanvas={persistCanvas}
                runtimeProvider={runtimeProvider}
                tree={tree}
                treeError={treeError}
                expandedFolders={expandedFolders}
                viewTab={viewTab}
                openAppTabs={openAppTabs}
                isAppWorkspace={isAppWorkspace}
                isChatOpen={isChatOpen}
                setIsChatOpen={setIsChatOpen}
                onOpenAppTab={openAppWorkspaceTab}
                onCloseAppTab={closeAppWorkspaceTab}
                onRequestPrompt={setPromptSuggestion}
                onRefreshTree={() => void refreshTree()}
                isRefreshingTree={isRefreshingTree}
                onRestartRuntime={() => void restartRuntime()}
                isRestartingRuntime={isRestartingRuntime}
                isPreviewFullscreen={isPreviewFullscreen}
                sourceUrl={project.metadata?.sourceUrl || ''}
                projectId={project.id}
                projectName={project.name}
              />
            </div>

            <div className="h-full lg:hidden">
              {mobileTab === 'chat' ? (
                <ChatPane
                  chatInput={chatInput}
                  error={error}
                  messages={messages}
                  onInputChange={setChatInput}
                  onQuickPrompt={submitMessage}
                  quickPrompts={isAppWorkspace ? APP_QUICK_PROMPTS : QUICK_PROMPTS}
                  onStop={stopGeneration}
                  onSubmit={() => submitMessage(chatInput)}
                  project={project}
                  isAppWorkspace={isAppWorkspace}
                  status={status}
                  width={100}
                />
              ) : (
                <WorkbenchPane
                  bottomTab={bottomTab}
                  consoleEntries={consoleEntries}
                  runtimeLogBuffer={runtimeLogBuffer}
                  dirtyFiles={dirtyFiles}
                  errorItems={errorItems}
                  draftContents={draftContents}
                  openFiles={openFiles}
                  onClearConsole={() => {
                    setConsoleEntries([]);
                    setRuntimeLogOutput('');
                    clearActiveTerminal();
                  }}
                  onCloseFile={closeFile}
                  onCreateEntry={createEntry}
                  onDraftChange={updateDraftContent}
                  onDeleteEntry={deleteEntry}
                  onOpenFile={openFile}
                  onRenameEntry={renameEntry}
                  onSaveFile={saveFile}
                  entryDraft={entryDraft}
                  previewIframeSrc={previewIframeSrc}
                  previewPath={previewPath}
                  previewRefreshKey={previewRefreshKey}
                  previewSource={previewSource}
                  previewUrl={previewUrl}
                  setPreviewUrl={setPreviewUrl}
                  selectedFileLines={selectedFileLines}
                  selectedFilePath={selectedFilePath}
                  selectedFileRecord={selectedFileRecord}
                  setBottomTab={setBottomTab}
                  setExpandedFolders={setExpandedFolders}
                  setIsPreviewFullscreen={setIsPreviewFullscreen}
                  setPreviewPath={setPreviewPath}
                  setPreviewRefreshKey={setPreviewRefreshKey}
                  setSelectedFilePath={setSelectedFilePath}
                  setEntryDraft={setEntryDraft}
                  setShowTerminal={setShowTerminal}
                  onRunTerminalCommand={runTerminalCommand}
                  onStopTerminalCommand={stopTerminalCommand}
                  onTerminalHistoryNavigate={cycleTerminalHistory}
                  onTerminalInputChange={(value) => {
                    if (!activeTerminal) return;
                    updateTerminal(activeTerminal.id, (current) => ({
                      ...current,
                      input: value,
                      historyIndex: null,
                    }));
                  }}
                  setViewTab={setViewTab}
                  saveErrors={saveErrors}
                  showTerminal={showTerminal}
                  savingFiles={savingFiles}
                  startTerminalResize={startTerminalResize}
                  terminals={terminals}
                  activeTerminalId={activeTerminal?.id ?? null}
                  onCreateTerminal={createNewTerminal}
                  onCloseTerminal={closeTerminal}
                  setActiveTerminalId={setActiveTerminalId}
                  terminalHeight={terminalHeight}
                  canvasState={project.metadata?.canvas}
                  onPersistCanvas={persistCanvas}
                  runtimeProvider={runtimeProvider}
                  tree={tree}
                  treeError={treeError}
                  expandedFolders={expandedFolders}
                  viewTab={viewTab}
                  openAppTabs={openAppTabs}
                  isAppWorkspace={isAppWorkspace}
                  isChatOpen={isChatOpen}
                  setIsChatOpen={setIsChatOpen}
                  onOpenAppTab={openAppWorkspaceTab}
                  onCloseAppTab={closeAppWorkspaceTab}
                  onRequestPrompt={setPromptSuggestion}
                  onRefreshTree={() => void refreshTree()}
                  isRefreshingTree={isRefreshingTree}
                  onRestartRuntime={() => void restartRuntime()}
                  isRestartingRuntime={isRestartingRuntime}
                  isPreviewFullscreen={isPreviewFullscreen}
                  sourceUrl={project.metadata?.sourceUrl || ''}
                  projectId={project.id}
                  projectName={project.name}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatPane({
  project,
  messages,
  chatInput,
  quickPrompts,
  onInputChange,
  onQuickPrompt,
  onSubmit,
  onStop,
  status,
  error,
  isAppWorkspace,
  width,
}: {
  project: BuilderProjectRecord;
  messages: ChatMessage[];
  chatInput: string;
  quickPrompts: string[];
  onInputChange: (value: string) => void;
  onQuickPrompt: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  status: string;
  error: Error | undefined;
  isAppWorkspace: boolean;
  width: number;
}) {
  const isStreaming = status === 'submitted' || status === 'streaming';

  return (
    <div
      className="flex h-full shrink-0 flex-col gap-1.5 bg-[#101010] p-2"
      style={{ width: `${width}%`, minWidth: width === 100 ? '100%' : 280, maxWidth: width === 100 ? '100%' : 520 }}
    >
      <div className="flex h-8 items-center gap-2 px-1">
        <button className="flex items-center gap-2 rounded-lg px-2 py-1 text-white/75 transition hover:bg-white/6">
          <div className="flex size-5 items-center justify-center rounded-md bg-sky-500/15">
            <Sparkles className="size-3.5 text-sky-400" />
          </div>
          <span className="max-w-[180px] truncate text-sm font-medium">{project.name}</span>
          <ChevronDown className="size-4 text-white/40" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-white/8 px-4 py-3 text-xs text-white/45">
            {isAppWorkspace
              ? 'Ask the AI to build screens, flows, APIs, and native behavior for your mobile app.'
              : 'Ask the AI to build, edit, refactor, debug, or generate app screens.'}
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 p-4">
              {messages.length === 0 ? (
                <>
                  <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                    <div className="text-sm font-medium text-white">Start with a builder prompt</div>
                    <p className="mt-2 text-sm leading-6 text-white/55">
                      {isAppWorkspace
                        ? 'This mobile workspace is project-aware, so the model can inspect files, shape app flows, and operate in builder mode.'
                        : 'This workspace is project-aware, so the model can inspect files and operate in builder mode.'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => onQuickPrompt(prompt)}
                        className="w-full rounded-xl border border-white/8 bg-white/3 px-3 py-3 text-left text-sm text-white/85 transition hover:bg-white/6"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {messages.map((message) => {
                const isUser = message.role === 'user';
                const text = getMessageText(message);
                const tools = getToolLabels(message);

                return (
                  <div key={message.id} className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
                    {!isUser ? (
                      <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/12">
                        <Bot className="size-4 text-sky-400" />
                      </div>
                    ) : null}

                    <div
                      className={cn(
                        'max-w-[90%] rounded-2xl px-4 py-3 text-sm',
                        isUser ? 'bg-white text-black' : 'border border-white/8 bg-white/4 text-white',
                      )}
                    >
                      {text ? <div className="whitespace-pre-wrap leading-6">{text}</div> : null}
                      {!text && tools.length > 0 ? (
                        <div className="text-xs text-white/55">Tools: {tools.join(', ')}</div>
                      ) : null}

                      {tools.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {tools.map((tool) => (
                            <span
                              key={`${message.id}-${tool}`}
                              className={cn(
                                'rounded-full px-1.5 py-0.5 text-[10px]',
                                isUser ? 'bg-black/10 text-black/60' : 'bg-white/6 text-white/50',
                              )}
                            >
                              {tool}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="border-t border-white/8 p-3">
            {error ? (
              <div className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {normalizeError(error)}
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.24)]">
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/28">Prompt</div>
                <div className="rounded-full border border-white/8 bg-black/20 px-2 py-0.5 text-[11px] text-white/30">
                  Builder mode
                </div>
              </div>
              <Textarea
                value={chatInput}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    onSubmit();
                  }
                }}
                placeholder="What do you want to build?"
                className="min-h-20 resize-none rounded-xl border border-white/6 bg-black/10 px-3 py-3 text-[15px] leading-6 text-white placeholder:text-white/24 shadow-none focus-visible:ring-0"
              />

              <div className="mt-2 flex items-center justify-between gap-2 px-1">
                <div className="text-xs text-white/30">Enter to send</div>
                {isStreaming ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-white/10 bg-white/5 text-white hover:bg-white/10"
                    onClick={onStop}
                  >
                    <Square className="size-4" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 bg-white text-black hover:bg-white/90"
                    onClick={onSubmit}
                    disabled={!chatInput.trim()}
                  >
                    <Send className="size-4" />
                    Send
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkbenchPane({
  viewTab,
  setViewTab,
  openAppTabs,
  tree,
  expandedFolders,
  setExpandedFolders,
  selectedFilePath,
  setSelectedFilePath,
  onOpenFile,
  openFiles,
  onCloseFile,
  draftContents,
  entryDraft,
  onClearConsole,
  onDraftChange,
  dirtyFiles,
  onCreateEntry,
  onDeleteEntry,
  onSaveFile,
  savingFiles,
  saveErrors,
  onRenameEntry,
  selectedFileRecord,
  selectedFileLines,
  treeError,
  previewUrl,
  setPreviewUrl,
  previewPath,
  setPreviewPath,
  previewIframeSrc,
  previewSource,
  previewRefreshKey,
  setPreviewRefreshKey,
  consoleEntries,
  runtimeLogBuffer,
  errorItems,
  bottomTab,
  setBottomTab,
  showTerminal,
  setShowTerminal,
  terminals,
  activeTerminalId,
  onCreateTerminal,
  onCloseTerminal,
  terminalHeight,
  isAppWorkspace,
  isChatOpen,
  setIsChatOpen,
  onOpenAppTab,
  onCloseAppTab,
  onRequestPrompt,
  onRefreshTree,
  isRefreshingTree,
  onRestartRuntime,
  isRestartingRuntime,
  onTerminalInputChange,
  onTerminalHistoryNavigate,
  onRunTerminalCommand,
  onStopTerminalCommand,
  setActiveTerminalId,
  canvasState,
  onPersistCanvas,
  runtimeProvider,
  startTerminalResize,
  isPreviewFullscreen,
  setIsPreviewFullscreen,
  setEntryDraft,
  sourceUrl,
  projectId,
  projectName,
}: {
  viewTab: ViewTab;
  setViewTab: React.Dispatch<React.SetStateAction<ViewTab>>;
  openAppTabs: BuilderAppToolTabId[];
  tree: BuilderWorkspaceNode[];
  expandedFolders: Record<string, boolean>;
  setExpandedFolders: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  selectedFilePath: string | null;
  setSelectedFilePath: React.Dispatch<React.SetStateAction<string | null>>;
  onOpenFile: (path: string) => void;
  openFiles: string[];
  entryDraft: ExplorerEntryDraft | null;
  onClearConsole: () => void;
  onCloseFile: (path: string) => void;
  onCreateEntry: (relativePath: string, type: 'file' | 'folder') => Promise<void>;
  draftContents: Record<string, string>;
  onDraftChange: (path: string, value: string) => void;
  dirtyFiles: Record<string, boolean>;
  onDeleteEntry: (path: string) => Promise<void>;
  onSaveFile: (path: string) => Promise<void>;
  savingFiles: Record<string, boolean>;
  saveErrors: Record<string, string | null>;
  onRenameEntry: (fromPath: string, nextPath: string) => Promise<void>;
  selectedFileRecord: FileRecord | undefined;
  selectedFileLines: string[];
  treeError: string | null;
  previewUrl: string;
  setPreviewUrl: React.Dispatch<React.SetStateAction<string>>;
  previewPath: string;
  setPreviewPath: React.Dispatch<React.SetStateAction<string>>;
  previewIframeSrc: string | undefined;
  previewSource: string | null;
  previewRefreshKey: number;
  setPreviewRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  consoleEntries: BuildConsoleEntry[];
  runtimeLogBuffer: string;
  errorItems: string[];
  bottomTab: BottomTab;
  setBottomTab: React.Dispatch<React.SetStateAction<BottomTab>>;
  showTerminal: boolean;
  setShowTerminal: React.Dispatch<React.SetStateAction<boolean>>;
  terminals: TerminalSession[];
  activeTerminalId: string | null;
  onCreateTerminal: () => void;
  onCloseTerminal: (terminalId: string) => void;
  terminalHeight: number;
  isAppWorkspace: boolean;
  isChatOpen: boolean;
  setIsChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenAppTab: (tabId: BuilderAppToolTabId) => void;
  onCloseAppTab: (tabId: BuilderAppToolTabId) => void;
  onRequestPrompt: (prompt: string) => void;
  onRefreshTree: () => void;
  isRefreshingTree: boolean;
  onRestartRuntime: () => void;
  isRestartingRuntime: boolean;
  onTerminalInputChange: (value: string) => void;
  onTerminalHistoryNavigate: (direction: 'up' | 'down', terminalId?: string) => void;
  onRunTerminalCommand: (value?: string, terminalId?: string) => Promise<void>;
  onStopTerminalCommand: (terminalId?: string) => void;
  setActiveTerminalId: React.Dispatch<React.SetStateAction<string | null>>;
  canvasState?: BuilderCanvasState | null;
  onPersistCanvas: (state: BuilderCanvasState) => Promise<void>;
  runtimeProvider: 'e2b' | 'local' | 'codesandbox' | 'webcontainers';
  startTerminalResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  isPreviewFullscreen: boolean;
  setIsPreviewFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
  setEntryDraft: React.Dispatch<React.SetStateAction<ExplorerEntryDraft | null>>;
  sourceUrl: string;
  projectId: string;
  projectName: string;
}) {
  const [fileQuery, setFileQuery] = useState('');
  const activeTerminal = useMemo(
    () => terminals.find((terminal) => terminal.id === activeTerminalId) ?? terminals[0] ?? null,
    [activeTerminalId, terminals],
  );
  const filteredTree = useMemo(() => filterWorkspaceTree(tree, fileQuery), [fileQuery, tree]);
  const selectedEditorValue = selectedFilePath
    ? selectedFileRecord?.kind === 'text'
      ? (draftContents[selectedFilePath] ?? selectedFileRecord?.content ?? '')
      : ''
    : '';
  const isSelectedFileEditable =
    selectedFilePath && selectedFileRecord?.kind === 'text' ? isEditableFile(selectedFilePath) : false;
  const isSelectedFileDirty = selectedFilePath ? Boolean(dirtyFiles[selectedFilePath]) : false;
  const isSelectedFileSaving = selectedFilePath ? Boolean(savingFiles[selectedFilePath]) : false;
  const selectedSaveError = selectedFilePath ? saveErrors[selectedFilePath] : null;
  const selectedFilePreviewKind = getFilePreviewKind(selectedFilePath, selectedFileRecord);
  const selectedFileAssetUrl = selectedFilePath ? getWorkspaceRawAssetUrl(projectId, selectedFilePath) : null;
  const availableWorkspaceToolTabs = useMemo<BuilderAppToolTabId[]>(
    () => (isAppWorkspace ? BUILDER_APP_TOOL_TABS.map((tab) => tab.id) : WEB_WORKSPACE_TOOL_TABS),
    [isAppWorkspace],
  );
  const appToolTabs = useMemo(
    () =>
      openAppTabs
        .map((tabId) => BUILDER_APP_TOOL_TABS.find((tab) => tab.id === tabId) ?? null)
        .filter((tab): tab is BuilderAppToolTabDefinition => tab !== null),
    [openAppTabs],
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2 pl-0">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setIsChatOpen((current) => !current)}
            className={cn(
              'hidden items-center justify-center rounded-lg border border-white/8 bg-[#181818] p-2 text-white/45 transition hover:text-white lg:inline-flex',
              isChatOpen && 'bg-[#202020] text-white',
            )}
            title={isChatOpen ? 'Close chat' : 'Open chat'}
          >
            {isChatOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </button>

          <div className="flex min-w-0 items-center rounded-lg bg-[#181818] p-0.5">
            {CORE_WORKSPACE_TABS.map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setViewTab(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
                    viewTab === tab.id ? 'bg-[#2a2a2a] text-white' : 'text-white/40 hover:text-white/70',
                  )}
                >
                  <Icon className="size-3.5" />
                  {tab.label}
                </button>
              );
            })}

            {appToolTabs.map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setViewTab(tab.id)}
                  className={cn(
                    'group inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
                    viewTab === tab.id ? 'bg-[#2a2a2a] text-white' : 'text-white/40 hover:text-white/70',
                  )}
                >
                  <Icon className={cn('size-3.5', viewTab === tab.id ? 'text-white' : tab.accentClass)} />
                  <span>{tab.shortLabel}</span>
                  <span
                    className="text-white/22 transition group-hover:text-white/55"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseAppTab(tab.id);
                    }}
                  >
                    <X className="size-3" />
                  </span>
                </button>
              );
            })}

            {availableWorkspaceToolTabs.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-white/42 transition hover:text-white/78"
                    title="Open builder tool"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[280px] border-white/10 bg-[#161616] p-1.5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.42)]"
                >
                  <DropdownMenuLabel className="px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-white/35">
                    {isAppWorkspace ? 'Mobile app tools' : 'Builder tools'}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/8" />
                  {BUILDER_APP_TOOL_TABS.filter((tab) => availableWorkspaceToolTabs.includes(tab.id)).map((tab) => {
                    const Icon = tab.icon;

                    return (
                      <DropdownMenuItem
                        key={tab.id}
                        onClick={() => onOpenAppTab(tab.id)}
                        className="gap-3 rounded-xl px-3 py-2.5 text-white focus:bg-white/8 focus:text-white"
                      >
                        <div className="flex size-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04]">
                          <Icon className={cn('size-4', tab.accentClass)} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{tab.label}</div>
                          <div className="truncate text-xs text-white/40">{tab.description}</div>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg p-2 text-white/40 transition hover:bg-[#181818] hover:text-white"
              title="Open source"
            >
              <ExternalLink className="size-4" />
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClearConsole}
            className="rounded-lg p-2 text-white/40 transition hover:bg-[#181818] hover:text-white"
            title="Clear terminal output"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={onRefreshTree}
            disabled={isRefreshingTree}
            className="rounded-lg p-2 text-white/40 transition hover:bg-[#181818] hover:text-white disabled:pointer-events-none disabled:opacity-60"
            title="Refresh workspace"
          >
            {isRefreshingTree ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        {isAppWorkspace ? (
          <div className="hidden w-[52px] shrink-0 overflow-hidden rounded-[18px] border border-white/8 bg-[#0f1116] shadow-[0_0_0_1px_rgba(255,255,255,0.02)] lg:flex">
            <ScrollArea className="h-full w-full">
              <div className="flex flex-col items-center gap-2 px-2 py-3">
                {BUILDER_APP_TOOL_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = viewTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => onOpenAppTab(tab.id)}
                      title={tab.label}
                      className={cn(
                        'flex size-9 items-center justify-center rounded-xl border transition',
                        isActive
                          ? 'border-white/16 bg-white/[0.08] text-white'
                          : 'border-transparent bg-transparent text-white/38 hover:bg-white/[0.05] hover:text-white/78',
                      )}
                    >
                      <Icon className={cn('size-4', isActive ? 'text-white' : tab.accentClass)} />
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-white/8 bg-[#141414] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="min-h-0 flex-1 overflow-hidden">
            {viewTab === 'code' ? (
              <div className="flex h-full overflow-hidden">
                <div className="flex w-60 shrink-0 flex-col overflow-hidden border-r border-white/8 bg-[#111111]">
                  <div className="border-b border-white/8 px-3 py-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-xs uppercase tracking-[0.22em] text-white/35">Files</div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setEntryDraft({ mode: 'create', type: 'file', parentPath: '', path: null, value: '' })
                          }
                          className="rounded-md p-1.5 text-white/35 transition hover:bg-white/6 hover:text-white"
                          title="New file"
                        >
                          <FilePlus2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEntryDraft({ mode: 'create', type: 'folder', parentPath: '', path: null, value: '' })
                          }
                          className="rounded-md p-1.5 text-white/35 transition hover:bg-white/6 hover:text-white"
                          title="New folder"
                        >
                          <FolderPlus className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-[#181818] px-2.5 py-2">
                      <Search className="size-4 text-white/30" />
                      <input
                        value={fileQuery}
                        onChange={(event) => setFileQuery(event.target.value)}
                        placeholder="Search files"
                        className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                      />
                    </div>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="p-2">
                      {entryDraft?.mode === 'create' && entryDraft.parentPath === '' ? (
                        <ExplorerInlineInput
                          kind={entryDraft.type}
                          value={entryDraft.value}
                          onChange={(value) => setEntryDraft((current) => (current ? { ...current, value } : current))}
                          onCancel={() => setEntryDraft(null)}
                          onSubmit={async () => {
                            const nextPath = entryDraft.value.trim();
                            if (!nextPath) {
                              setEntryDraft(null);
                              return;
                            }
                            await onCreateEntry(nextPath, entryDraft.type);
                          }}
                        />
                      ) : null}
                      {treeError ? (
                        <div className="mb-2 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-xs text-red-200">
                          {treeError}
                        </div>
                      ) : null}
                      {filteredTree.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/35">
                          {fileQuery.trim() ? 'No files match that search' : 'No files found'}
                        </div>
                      ) : (
                        filteredTree.map((node) => (
                          <TreeNode
                            key={node.path}
                            expandedFolders={expandedFolders}
                            entryDraft={entryDraft}
                            node={node}
                            onCreateEntry={onCreateEntry}
                            onDeleteEntry={onDeleteEntry}
                            onOpenFile={onOpenFile}
                            onRenameEntry={onRenameEntry}
                            selectedFilePath={selectedFilePath}
                            setEntryDraft={setEntryDraft}
                            setExpandedFolders={setExpandedFolders}
                          />
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2 overflow-x-auto border-b border-white/8 px-3 py-2">
                    {openFiles.length === 0 ? (
                      <div className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/35">Open a file</div>
                    ) : null}
                    {openFiles.map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => setSelectedFilePath(path)}
                        className={cn(
                          'group inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition',
                          selectedFilePath === path
                            ? 'border-white/12 bg-[#2a2a2a] text-white'
                            : 'border-transparent bg-white/4 text-white/45',
                        )}
                      >
                        <File className="size-3.5" />
                        <span className="max-w-40 truncate">{path.split('/').pop()}</span>
                        {dirtyFiles[path] ? <span className="size-1.5 rounded-full bg-amber-300" /> : null}
                        <span
                          className="text-white/30 transition group-hover:text-white/60"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCloseFile(path);
                          }}
                        >
                          x
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="min-h-0 flex-1 overflow-hidden">
                    {!selectedFilePath ? (
                      <div className="flex h-full items-center justify-center text-white/35">
                        Select a file to inspect
                      </div>
                    ) : selectedFileRecord?.isLoading ? (
                      <div className="flex h-full items-center justify-center gap-2 text-white/50">
                        <Loader2 className="size-4 animate-spin" />
                        Loading file...
                      </div>
                    ) : selectedFileRecord?.error ? (
                      <div className="p-4">
                        <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-3 text-sm text-red-200">
                          {selectedFileRecord.error}
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col">
                        <div className="flex items-center justify-between gap-3 border-b border-white/8 bg-[#151515] px-4 py-2.5">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white/90">{selectedFilePath}</div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/35">
                              <span>{getFileExtension(selectedFilePath) || 'file'}</span>
                              <span>•</span>
                              <span>{formatFileSize(selectedFileRecord?.size ?? 0)}</span>
                              {selectedFileRecord?.mimeType ? (
                                <>
                                  <span>•</span>
                                  <span className="truncate">
                                    {selectedFileRecord.mimeType.replace('; charset=utf-8', '')}
                                  </span>
                                </>
                              ) : null}
                              <span>•</span>
                              <span>{isSelectedFileEditable ? 'Editable' : 'Preview only'}</span>
                              {isSelectedFileDirty ? (
                                <>
                                  <span>•</span>
                                  <span className="text-amber-300">Unsaved changes</span>
                                </>
                              ) : isSelectedFileEditable ? (
                                <>
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1 text-emerald-300">
                                    <CheckCircle2 className="size-3" />
                                    Saved
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {selectedSaveError ? (
                              <span className="max-w-52 truncate text-xs text-red-300">{selectedSaveError}</span>
                            ) : null}
                            {isSelectedFileEditable ? (
                              <Button
                                size="sm"
                                className="h-8 bg-white text-black hover:bg-white/90"
                                disabled={!isSelectedFileDirty || isSelectedFileSaving}
                                onClick={() => void onSaveFile(selectedFilePath)}
                              >
                                {isSelectedFileSaving ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Save className="size-4" />
                                )}
                                Save
                              </Button>
                            ) : (
                              <span className="rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-[11px] text-white/45">
                                Read only
                              </span>
                            )}
                          </div>
                        </div>

                        {isSelectedFileEditable ? (
                          <div className="min-h-0 flex-1 overflow-hidden bg-[#141414]">
                            <MonacoEditor
                              path={selectedFilePath}
                              language={getEditorLanguage(selectedFilePath)}
                              value={selectedEditorValue}
                              onChange={(value) => onDraftChange(selectedFilePath, value ?? '')}
                              theme="vs-dark"
                              options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                lineHeight: 22,
                                padding: { top: 12 },
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                tabSize: 2,
                                wordWrap: 'on',
                                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                                renderLineHighlight: 'gutter',
                                overviewRulerBorder: false,
                                hideCursorInOverviewRuler: true,
                                scrollbar: {
                                  verticalScrollbarSize: 10,
                                  horizontalScrollbarSize: 10,
                                },
                              }}
                            />
                          </div>
                        ) : (
                          <>
                            {selectedFileRecord?.kind === 'text' ? (
                              <ScrollArea className="h-full">
                                <div className="min-w-full font-mono text-[12px]">
                                  {selectedFileLines.length === 0 ? (
                                    <div className="px-4 py-6 text-white/35">This file is empty.</div>
                                  ) : (
                                    selectedFileLines.map((line, index) => (
                                      <div
                                        key={`${selectedFilePath}-${index + 1}`}
                                        className="grid grid-cols-[64px_minmax(0,1fr)]"
                                      >
                                        <div className="select-none border-r border-white/6 px-4 py-1.5 text-right text-white/25">
                                          {index + 1}
                                        </div>
                                        <pre className="overflow-x-auto px-4 py-1.5 text-white/85">
                                          <code>{line || ' '}</code>
                                        </pre>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </ScrollArea>
                            ) : selectedFilePreviewKind === 'image' && selectedFileAssetUrl ? (
                              <ScrollArea className="h-full">
                                <div className="flex min-h-full items-center justify-center p-6">
                                  <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/8 bg-[#101010] p-4">
                                    <img
                                      src={selectedFileAssetUrl}
                                      alt={selectedFilePath}
                                      className="mx-auto max-h-[70vh] w-auto max-w-full rounded-xl object-contain"
                                    />
                                  </div>
                                </div>
                              </ScrollArea>
                            ) : selectedFilePreviewKind === 'video' && selectedFileAssetUrl ? (
                              <div className="flex h-full items-center justify-center p-6">
                                <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/8 bg-[#101010] p-4">
                                  <video
                                    controls
                                    className="mx-auto max-h-[72vh] w-full rounded-xl bg-black"
                                    src={selectedFileAssetUrl}
                                  />
                                </div>
                              </div>
                            ) : selectedFilePreviewKind === 'audio' && selectedFileAssetUrl ? (
                              <div className="flex h-full items-center justify-center p-6">
                                <div className="w-full max-w-2xl rounded-2xl border border-white/8 bg-[#101010] p-6">
                                  <div className="mb-4 flex items-center gap-3 text-white/75">
                                    <FileAudio2 className="size-5 text-sky-300" />
                                    <div>
                                      <div className="text-sm font-medium text-white">
                                        {selectedFilePath.split('/').pop()}
                                      </div>
                                      <div className="text-xs text-white/40">
                                        {selectedFileRecord?.mimeType ?? 'audio file'}
                                      </div>
                                    </div>
                                  </div>
                                  <audio controls className="w-full" src={selectedFileAssetUrl} />
                                </div>
                              </div>
                            ) : selectedFilePreviewKind === 'pdf' && selectedFileAssetUrl ? (
                              <iframe
                                title={selectedFilePath}
                                src={selectedFileAssetUrl}
                                className="h-full w-full bg-white"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center p-6">
                                <div className="max-w-lg rounded-2xl border border-white/8 bg-white/[0.03] p-6 text-center">
                                  <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                                    {selectedFilePreviewKind === 'image' ? (
                                      <FileImage className="size-6 text-sky-300" />
                                    ) : selectedFilePreviewKind === 'video' ? (
                                      <FileVideo2 className="size-6 text-violet-300" />
                                    ) : selectedFilePreviewKind === 'audio' ? (
                                      <FileAudio2 className="size-6 text-emerald-300" />
                                    ) : (
                                      <File className="size-6 text-white/55" />
                                    )}
                                  </div>
                                  <div className="text-base font-semibold text-white">Preview not available inline</div>
                                  <p className="mt-2 text-sm leading-6 text-white/45">
                                    This file is stored as binary data. You can still open it directly in a new tab.
                                  </p>
                                  <div className="mt-4 flex items-center justify-center gap-2 text-xs text-white/35">
                                    <span>{selectedFileRecord?.mimeType ?? 'application/octet-stream'}</span>
                                    <span>•</span>
                                    <span>{formatFileSize(selectedFileRecord?.size ?? 0)}</span>
                                  </div>
                                  {selectedFileAssetUrl ? (
                                    <a
                                      href={selectedFileAssetUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white transition hover:bg-white/[0.08]"
                                    >
                                      <ExternalLink className="size-4" />
                                      Open file
                                    </a>
                                  ) : null}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : viewTab === 'preview' ? (
              isAppWorkspace ? (
                <BuilderMobilePreview
                  projectName={projectName}
                  previewIframeSrc={previewIframeSrc}
                  previewSource={previewSource}
                  previewRefreshKey={previewRefreshKey}
                  isFullscreen={isPreviewFullscreen}
                  onRefresh={() => setPreviewRefreshKey((current) => current + 1)}
                  onToggleFullscreen={() => setIsPreviewFullscreen((current) => !current)}
                />
              ) : (
                <div className="flex h-full flex-col">
                  <div className="flex h-9 items-center gap-2 border-b border-white/8 px-3">
                    <button
                      type="button"
                      onClick={() => setPreviewRefreshKey((current) => current + 1)}
                      className="rounded-md p-1.5 text-white/45 transition hover:bg-white/6 hover:text-white"
                      title="Reload"
                    >
                      <RefreshCw className="size-3.5" />
                    </button>
                    <Input
                      value={previewPath}
                      onChange={(event) =>
                        setPreviewPath(
                          event.target.value.startsWith('/') ? event.target.value : `/${event.target.value}`,
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          setPreviewRefreshKey((current) => current + 1);
                        }
                      }}
                      className="h-7 border-white/10 bg-[#1a1a1a] text-xs text-white placeholder:text-white/25"
                      placeholder={previewUrl ? '/ route path' : 'Preview path'}
                    />
                    {previewUrl ? (
                      <a
                        href={previewIframeSrc}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md p-1.5 text-white/45 transition hover:bg-white/6 hover:text-white"
                        title="Open preview in new tab"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setIsPreviewFullscreen((current) => !current)}
                      className="rounded-md p-1.5 text-white/45 transition hover:bg-white/6 hover:text-white"
                      title={isPreviewFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    >
                      {isPreviewFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-white/45 transition hover:bg-white/6 hover:text-white"
                      title="Element picker"
                    >
                      <MousePointer2 className="size-3.5" />
                    </button>
                  </div>

                  <div className={cn('flex-1 p-3', isPreviewFullscreen && 'p-0')}>
                    <div className="h-full overflow-hidden rounded-xl border border-white/8 bg-white">
                      {runtimeProvider === 'webcontainers' ? (
                        <BuilderWebContainerPreview
                          projectId={projectId}
                          previewPath={previewPath}
                          previewRefreshKey={previewRefreshKey}
                          fallbackSource={previewSource}
                          isFullscreen={isPreviewFullscreen}
                          onPreviewUrlChange={setPreviewUrl}
                        />
                      ) : previewIframeSrc ? (
                        <iframe
                          key={`${previewIframeSrc}-${previewRefreshKey}`}
                          title="Builder preview"
                          className="h-full w-full"
                          src={previewIframeSrc}
                        />
                      ) : previewSource ? (
                        <iframe
                          key={`srcdoc-${previewRefreshKey}`}
                          title="HTML preview"
                          className="h-full w-full"
                          sandbox="allow-scripts allow-same-origin"
                          srcDoc={previewSource}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center p-6 text-center text-gray-600">
                          <div>
                            <Play className="mx-auto size-10 text-gray-400" />
                            <h3 className="mt-4 text-lg font-semibold text-gray-900">Preview not running yet</h3>
                            <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                              Once the builder starts a preview server, or when you open an HTML file, it will appear
                              here.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            ) : viewTab === 'canvas' ? (
              <BuilderCanvas
                projectId={projectId}
                projectName={projectName}
                initialState={canvasState}
                livePreviewUrl={previewIframeSrc}
                selectedFilePath={selectedFilePath}
                selectedFileContent={selectedEditorValue}
                onPersist={onPersistCanvas}
              />
            ) : (
              <BuilderAppToolPanel
                activeTool={viewTab}
                projectId={projectId}
                projectName={projectName}
                sourceType={isAppWorkspace ? 'apps' : 'web'}
                sourceUrl={sourceUrl}
                previewUrl={previewIframeSrc ?? previewUrl}
                tree={tree}
                consoleEntries={consoleEntries}
                activeTerminal={activeTerminal}
                onOpenFile={onOpenFile}
                onRequestPrompt={onRequestPrompt}
                onRunCommand={(command) => void onRunTerminalCommand(command, activeTerminal?.id ?? undefined)}
              />
            )}
          </div>

          {showTerminal ? (
            <>
              <HorizontalResizeHandle onPointerDown={startTerminalResize} />
              <div
                style={{ height: terminalHeight }}
                className="flex shrink-0 flex-col border-t border-white/8 bg-[#0f0f0f]"
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-1 rounded-lg bg-[#181818] p-0.5">
                    <button
                      type="button"
                      onClick={() => setBottomTab('logs')}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-medium transition',
                        bottomTab === 'logs' ? 'bg-[#2a2a2a] text-white' : 'text-white/40 hover:text-white/70',
                      )}
                    >
                      <Activity className="mr-1 inline size-3.5" />
                      Runtime
                    </button>
                    <button
                      type="button"
                      onClick={() => setBottomTab('terminal')}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-medium transition',
                        bottomTab === 'terminal' ? 'bg-[#2a2a2a] text-white' : 'text-white/40 hover:text-white/70',
                      )}
                    >
                      <TerminalSquare className="mr-1 inline size-3.5" />
                      Terminal
                    </button>
                    <button
                      type="button"
                      onClick={() => setBottomTab('errors')}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-medium transition',
                        bottomTab === 'errors' ? 'bg-[#2a2a2a] text-white' : 'text-white/40 hover:text-white/70',
                      )}
                    >
                      <AlertTriangle className="mr-1 inline size-3.5" />
                      Errors
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {bottomTab === 'terminal' && activeTerminal ? (
                      <div className="hidden rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/35 md:inline-flex">
                        {activeTerminal.cwd}
                      </div>
                    ) : null}
                    {bottomTab === 'terminal' && runtimeProvider === 'codesandbox' ? (
                      <button
                        type="button"
                        onClick={onRestartRuntime}
                        disabled={isRestartingRuntime}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-55"
                        title="Restart CodeSandbox runtime"
                      >
                        {isRestartingRuntime ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3" />
                        )}
                        Restart CodeSandbox
                      </button>
                    ) : null}
                    {bottomTab === 'logs' ? (
                      <div className="hidden rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/35 md:inline-flex">
                        Live builder activity
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setShowTerminal(false)}
                      className="rounded-md p-1.5 text-white/35 transition hover:bg-white/6 hover:text-white"
                      title="Collapse bottom panel"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1">
                  {bottomTab === 'logs' ? (
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between border-b border-white/8 px-3 py-2 text-[11px] text-white/35">
                        <div className="uppercase tracking-[0.22em]">Runtime Logs</div>
                        <div className="truncate">{runtimeProvider}</div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-hidden bg-[#09090d]">
                        <BuilderTerminalSurface active buffer={runtimeLogBuffer} className="px-2 py-2" readOnly />
                      </div>
                    </div>
                  ) : bottomTab === 'terminal' ? (
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-2 py-2">
                        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                          {terminals.map((terminal) => (
                            <button
                              key={terminal.id}
                              type="button"
                              onClick={() => setActiveTerminalId(terminal.id)}
                              className={cn(
                                'group flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition',
                                activeTerminal?.id === terminal.id
                                  ? 'border-white/12 bg-[#262626] text-white'
                                  : 'border-transparent bg-white/4 text-white/45 hover:bg-white/7 hover:text-white/75',
                              )}
                            >
                              <TerminalSquare className="size-3.5" />
                              <span>{terminal.title}</span>
                              {terminal.isRunning ? <span className="size-1.5 rounded-full bg-emerald-300" /> : null}
                              {terminals.length > 1 ? (
                                <span
                                  className="text-white/25 transition group-hover:text-white/55"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onCloseTerminal(terminal.id);
                                  }}
                                >
                                  x
                                </span>
                              ) : null}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={onCreateTerminal}
                            disabled={terminals.length >= MAX_TERMINAL_TABS}
                            className="rounded-lg border border-dashed border-white/10 px-3 py-1.5 text-xs text-white/35 transition hover:border-white/20 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40"
                            title="New terminal"
                          >
                            + New
                          </button>
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 overflow-hidden">
                        {activeTerminal ? (
                          <div className="flex h-full flex-col bg-[#09090d]">
                            {activeTerminal.commandError ? (
                              <div className="border-b border-red-400/15 bg-red-500/8 px-3 py-2 text-xs text-red-200">
                                {activeTerminal.commandError}
                              </div>
                            ) : null}
                            <div className="min-h-0 flex-1 overflow-hidden">
                              <BuilderTerminalSurface
                                active
                                buffer={activeTerminal.output}
                                className="px-2 py-2"
                                cwd={activeTerminal.cwd}
                                input={activeTerminal.input}
                                isBusy={activeTerminal.isRunning}
                                onHistoryNavigate={(direction) =>
                                  onTerminalHistoryNavigate(direction, activeTerminal.id)
                                }
                                onInputChange={onTerminalInputChange}
                                onStop={() => onStopTerminalCommand(activeTerminal.id)}
                                onSubmit={() => void onRunTerminalCommand(undefined, activeTerminal.id)}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-white/35">
                            No terminal session selected.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <ScrollArea className="h-full">
                      <div className="space-y-2 p-3">
                        {errorItems.length === 0 ? (
                          <div className="rounded-lg border border-white/8 bg-white/4 px-3 py-4 text-sm text-white/35">
                            No errors detected yet.
                          </div>
                        ) : (
                          errorItems.map((item, index) => (
                            <div
                              key={`error-${index}`}
                              className="rounded-lg border border-red-400/15 bg-red-500/10 px-3 py-3 text-sm text-red-200"
                            >
                              {item}
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between border-t border-white/8 px-2.5 py-1.5">
              <div className="text-[11px] text-white/32">Bottom panel collapsed</div>
              <button
                type="button"
                onClick={() => setShowTerminal(true)}
                className="rounded-md p-1 text-white/35 transition hover:bg-white/6 hover:text-white"
                title="Expand bottom panel"
              >
                <ChevronRight className="size-3.5 -rotate-90" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TreeNode({
  node,
  expandedFolders,
  entryDraft,
  setExpandedFolders,
  selectedFilePath,
  setEntryDraft,
  onCreateEntry,
  onRenameEntry,
  onDeleteEntry,
  onOpenFile,
}: {
  node: BuilderWorkspaceNode;
  expandedFolders: Record<string, boolean>;
  entryDraft: ExplorerEntryDraft | null;
  setExpandedFolders: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  selectedFilePath: string | null;
  setEntryDraft: React.Dispatch<React.SetStateAction<ExplorerEntryDraft | null>>;
  onCreateEntry: (relativePath: string, type: 'file' | 'folder') => Promise<void>;
  onRenameEntry: (fromPath: string, nextPath: string) => Promise<void>;
  onDeleteEntry: (path: string) => Promise<void>;
  onOpenFile: (path: string) => void;
}) {
  const isExpanded = expandedFolders[node.path] ?? true;
  const isRenaming = entryDraft?.mode === 'rename' && entryDraft.path === node.path;
  const isCreatingHere = entryDraft?.mode === 'create' && entryDraft.parentPath === node.path;
  const parentPath = node.path.includes('/') ? node.path.split('/').slice(0, -1).join('/') : '';

  if (node.type === 'folder') {
    return (
      <div>
        <div className="group flex items-center gap-1 rounded-lg px-2 py-1.5 text-left text-sm text-white/70 transition hover:bg-white/6 hover:text-white">
          <button
            type="button"
            onClick={() => setExpandedFolders((current) => ({ ...current, [node.path]: !isExpanded }))}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {isExpanded ? <FolderOpen className="size-4 text-sky-400" /> : <Folder className="size-4 text-sky-400" />}
            {isRenaming ? (
              <ExplorerInlineInput
                compact
                kind="folder"
                value={entryDraft.value}
                onChange={(value) => setEntryDraft((current) => (current ? { ...current, value } : current))}
                onCancel={() => setEntryDraft(null)}
                onSubmit={async () => {
                  const nextName = entryDraft.value.trim();
                  if (!nextName) {
                    setEntryDraft(null);
                    return;
                  }
                  const nextPath = parentPath ? `${parentPath}/${nextName}` : nextName;
                  await onRenameEntry(node.path, nextPath);
                }}
              />
            ) : (
              <span className="truncate">{node.name}</span>
            )}
          </button>

          {!isRenaming ? (
            <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
              <button
                type="button"
                onClick={() =>
                  setEntryDraft({ mode: 'create', type: 'file', parentPath: node.path, path: null, value: '' })
                }
                className="rounded p-1 text-white/35 hover:bg-white/8 hover:text-white"
                title="New file"
              >
                <FilePlus2 className="size-3" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setEntryDraft({ mode: 'create', type: 'folder', parentPath: node.path, path: null, value: '' })
                }
                className="rounded p-1 text-white/35 hover:bg-white/8 hover:text-white"
                title="New folder"
              >
                <FolderPlus className="size-3" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setEntryDraft({ mode: 'rename', type: 'folder', parentPath, path: node.path, value: node.name })
                }
                className="rounded p-1 text-white/35 hover:bg-white/8 hover:text-white"
                title="Rename folder"
              >
                <Pencil className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => void onDeleteEntry(node.path)}
                className="rounded p-1 text-white/35 hover:bg-red-500/15 hover:text-red-200"
                title="Delete folder"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ) : null}
        </div>

        {isExpanded && node.children?.length ? (
          <div className="ml-4 border-l border-white/6 pl-1">
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                expandedFolders={expandedFolders}
                entryDraft={entryDraft}
                node={child}
                onCreateEntry={onCreateEntry}
                onDeleteEntry={onDeleteEntry}
                onOpenFile={onOpenFile}
                onRenameEntry={onRenameEntry}
                selectedFilePath={selectedFilePath}
                setEntryDraft={setEntryDraft}
                setExpandedFolders={setExpandedFolders}
              />
            ))}
            {isCreatingHere ? (
              <ExplorerInlineInput
                kind={entryDraft.type}
                value={entryDraft.value}
                onChange={(value) => setEntryDraft((current) => (current ? { ...current, value } : current))}
                onCancel={() => setEntryDraft(null)}
                onSubmit={async () => {
                  const nextName = entryDraft.value.trim();
                  if (!nextName) {
                    setEntryDraft(null);
                    return;
                  }
                  const nextPath = `${node.path}/${nextName}`;
                  await onCreateEntry(nextPath, entryDraft.type);
                }}
              />
            ) : null}
          </div>
        ) : isCreatingHere ? (
          <div className="ml-4 border-l border-white/6 pl-1">
            <ExplorerInlineInput
              kind={entryDraft.type}
              value={entryDraft.value}
              onChange={(value) => setEntryDraft((current) => (current ? { ...current, value } : current))}
              onCancel={() => setEntryDraft(null)}
              onSubmit={async () => {
                const nextName = entryDraft.value.trim();
                if (!nextName) {
                  setEntryDraft(null);
                  return;
                }
                const nextPath = `${node.path}/${nextName}`;
                await onCreateEntry(nextPath, entryDraft.type);
              }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-lg px-2 py-1.5 text-left text-sm transition',
        selectedFilePath === node.path ? 'bg-[#262626] text-white' : 'text-white/60 hover:bg-white/6 hover:text-white',
      )}
    >
      <button type="button" onClick={() => onOpenFile(node.path)} className="flex min-w-0 flex-1 items-center gap-2">
        <File className="ml-5 size-4" />
        {isRenaming ? (
          <ExplorerInlineInput
            compact
            kind="file"
            value={entryDraft.value}
            onChange={(value) => setEntryDraft((current) => (current ? { ...current, value } : current))}
            onCancel={() => setEntryDraft(null)}
            onSubmit={async () => {
              const nextName = entryDraft.value.trim();
              if (!nextName) {
                setEntryDraft(null);
                return;
              }
              const nextPath = parentPath ? `${parentPath}/${nextName}` : nextName;
              await onRenameEntry(node.path, nextPath);
            }}
          />
        ) : (
          <span className="truncate">{node.name}</span>
        )}
      </button>

      {!isRenaming ? (
        <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={() =>
              setEntryDraft({ mode: 'rename', type: 'file', parentPath, path: node.path, value: node.name })
            }
            className="rounded p-1 text-white/35 hover:bg-white/8 hover:text-white"
            title="Rename file"
          >
            <Pencil className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => void onDeleteEntry(node.path)}
            className="rounded p-1 text-white/35 hover:bg-red-500/15 hover:text-red-200"
            title="Delete file"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ExplorerInlineInput({
  kind,
  value,
  onChange,
  onSubmit,
  onCancel,
  compact = false,
}: {
  kind: 'file' | 'folder';
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => Promise<void> | void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      className={cn(
        'mt-1 flex items-center gap-1 rounded-lg border border-white/10 bg-[#181818] p-1',
        compact && 'mt-0 flex-1',
      )}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void onSubmit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          if (!value.trim()) onCancel();
        }}
        placeholder={kind === 'file' ? 'new-file.tsx' : 'new-folder'}
        className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-white/25"
      />
      <button
        type="button"
        onClick={() => void onSubmit()}
        className="rounded p-1 text-white/35 hover:bg-white/8 hover:text-emerald-200"
        title="Confirm"
      >
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded p-1 text-white/35 hover:bg-white/8 hover:text-red-200"
        title="Cancel"
      >
        <Square className="size-3.5" />
      </button>
    </div>
  );
}

function VerticalResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="group relative z-10 hidden w-3 shrink-0 cursor-col-resize items-center justify-center lg:flex"
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
    >
      <div className="h-20 w-px bg-white/10 transition group-hover:bg-white/30" />
    </div>
  );
}

function HorizontalResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="group relative z-10 flex h-3 shrink-0 cursor-row-resize items-center justify-center"
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="horizontal"
    >
      <div className="h-px w-20 bg-white/10 transition group-hover:bg-white/30" />
    </div>
  );
}
