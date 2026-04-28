'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  Apple,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  CreditCard,
  Database,
  DollarSign,
  ExternalLink,
  Github,
  Globe,
  ImageIcon,
  Info,
  Loader2,
  Lock,
  Music4,
  Pause,
  Pencil,
  Play,
  PlugZap,
  Plus,
  RefreshCw,
  Rocket,
  RotateCw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  TerminalSquare,
  Trash2,
  Upload,
  Vibrate,
  Video,
  Wallet,
  Wand2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { signIn } from '@/lib/auth-client';
import { cn, normalizeError } from '@/lib/utils';

type TreeNode = {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
};

type ConsoleEntry = {
  id: string;
  source: 'exec' | 'agent' | 'preview' | 'code' | 'fs' | 'search';
  title: string;
  detail: string;
  status: 'running' | 'completed' | 'error' | 'info';
  level: 'default' | 'success' | 'warning' | 'error';
  timestamp: number;
};

type TerminalSnapshot = {
  id: string;
  title: string;
  cwd: string;
  output: string;
  isRunning: boolean;
  commandError: string | null;
};

type ProjectIntegrationRecord = {
  id: string;
  type: string;
  provider: string;
  status: string;
  dashboardUrl: string | null;
  webhookStatus: string | null;
  metadata: Record<string, unknown>;
  credentials: Record<string, string>;
  lastCheckedAt: string | null;
  lastCheckStatus: string | null;
  lastError: string | null;
};

type ProjectEnvVarRecord = {
  key: string;
  value: string;
  source: string;
  isSecret: boolean;
};

type ProjectAssetRecord = {
  id: string;
  kind: 'image' | 'audio' | 'video';
  sourceType: 'generated' | 'uploaded' | 'workspace' | 'imported';
  status: 'queued' | 'running' | 'completed' | 'error';
  name: string;
  prompt: string | null;
  storageUrl: string | null;
  storageKey: string | null;
  mimeType: string | null;
  metadata: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type ProjectJobRecord = {
  id: string;
  kind: string;
  title: string;
  provider: string | null;
  status: 'queued' | 'running' | 'completed' | 'error';
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  logs: Array<{ message: string; level: 'info' | 'success' | 'warning' | 'error'; at: string }>;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type ProjectToolStateRecord = {
  toolId: string;
  state: Record<string, unknown>;
  updatedAt: string;
};

type ProjectEventRecord = {
  id: string;
  channel: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type GitHubProjectState = {
  connected: boolean;
  account: {
    login: string;
    name: string | null;
    avatarUrl: string | null;
    htmlUrl: string;
    email: string | null;
  } | null;
  repos: Array<{
    id: number;
    name: string;
    fullName: string;
    htmlUrl: string;
    cloneUrl: string;
    private: boolean;
    defaultBranch: string;
  }>;
  selectedRepoId: number | null;
  selectedRepoFullName: string | null;
  selectedBranch: string;
  remoteUrl: string | null;
  isGitRepo: boolean;
  changes: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'typechange' | 'untracked';
    staged: boolean;
    unstaged: boolean;
    originalPath: string | null;
  }>;
  error?: string;
};

type MediaItem = {
  id: string;
  name: string;
  path?: string;
  prompt?: string;
  kind: 'workspace' | 'generated' | 'uploaded';
};

type ProviderField = {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
};

type ProviderConfig = {
  id: string;
  label: string;
  docsUrl: string;
  description: string;
  supportsWeb: boolean;
  supportsMobile: boolean;
  prompt: string;
  fields: ProviderField[];
};

type ApiCategory = 'text' | 'image' | 'audio' | 'video' | 'data';

type ApiModel = {
  id: string;
  label: string;
  provider: string;
  category: ApiCategory;
};

type HapticOption = {
  id: string;
  label: string;
  kind: 'impact' | 'notification' | 'selection';
  vibration: number | number[];
};

type AppStealerInputType = 'name' | 'appstore' | 'playstore' | 'website';

export type BuilderAppToolTabId =
  | 'database'
  | 'environment'
  | 'expo-logs'
  | 'haptics'
  | 'api-models'
  | 'images'
  | 'audio'
  | 'video'
  | 'app-stealer'
  | 'payments'
  | 'push-to-github'
  | 'publish'
  | 'restart-dev-server';

export type BuilderAppToolTabDefinition = {
  id: BuilderAppToolTabId;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  accentClass: string;
};

export const BUILDER_APP_TOOL_TABS: BuilderAppToolTabDefinition[] = [
  {
    id: 'database',
    label: 'Database',
    shortLabel: 'DB',
    description: 'Inspect data files, schemas, and storage patterns.',
    icon: Database,
    accentClass: 'text-violet-300',
  },
  {
    id: 'environment',
    label: 'Environment',
    shortLabel: 'Env',
    description: 'Manage app secrets, env files, and runtime config.',
    icon: Settings2,
    accentClass: 'text-slate-300',
  },
  {
    id: 'expo-logs',
    label: 'Expo Logs',
    shortLabel: 'Logs',
    description: 'Watch build output, preview events, and terminal logs.',
    icon: TerminalSquare,
    accentClass: 'text-emerald-300',
  },
  {
    id: 'haptics',
    label: 'Haptics',
    shortLabel: 'Haptics',
    description: 'Plan tactile feedback for gestures, success, and errors.',
    icon: Vibrate,
    accentClass: 'text-amber-300',
  },
  {
    id: 'api-models',
    label: 'API Models',
    shortLabel: 'API',
    description: 'Wire API clients, model providers, and server helpers.',
    icon: Sparkles,
    accentClass: 'text-sky-300',
  },
  {
    id: 'images',
    label: 'Images',
    shortLabel: 'Images',
    description: 'Review image assets and prompt the AI for art direction.',
    icon: ImageIcon,
    accentClass: 'text-fuchsia-300',
  },
  {
    id: 'audio',
    label: 'Audio',
    shortLabel: 'Audio',
    description: 'Organize sound cues, music, and voice interactions.',
    icon: Music4,
    accentClass: 'text-purple-300',
  },
  {
    id: 'video',
    label: 'Video',
    shortLabel: 'Video',
    description: 'Track reels, onboarding clips, and camera flows.',
    icon: Video,
    accentClass: 'text-blue-300',
  },
  {
    id: 'app-stealer',
    label: 'App Stealer',
    shortLabel: 'Stealer',
    description: 'Bring a reference app into the chat as inspiration context.',
    icon: Wand2,
    accentClass: 'text-rose-300',
  },
  {
    id: 'payments',
    label: 'Payments',
    shortLabel: 'Payments',
    description: 'Map purchase flows, subscriptions, and provider setup.',
    icon: DollarSign,
    accentClass: 'text-emerald-300',
  },
  {
    id: 'push-to-github',
    label: 'Push to GitHub',
    shortLabel: 'GitHub',
    description: 'Push the current builder workspace to a real GitHub repository.',
    icon: Github,
    accentClass: 'text-white',
  },
  {
    id: 'publish',
    label: 'Publish to App Store',
    shortLabel: 'Publish',
    description: 'Prepare release metadata, icons, and launch checklists.',
    icon: Rocket,
    accentClass: 'text-orange-300',
  },
  {
    id: 'restart-dev-server',
    label: 'Restart Dev Server',
    shortLabel: 'Restart',
    description: 'Rerun the local mobile preview loop without leaving the workspace.',
    icon: RotateCw,
    accentClass: 'text-cyan-300',
  },
];

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv'];

const DATABASE_PROVIDERS: ProviderConfig[] = [
  {
    id: 'prisma-postgres',
    label: 'Prisma Postgres',
    docsUrl: 'https://www.prisma.io/postgres',
    description: 'Managed Postgres with Prisma workflow and migrations.',
    supportsWeb: true,
    supportsMobile: true,
    prompt:
      'Add Prisma with PostgreSQL to this project. Create schema, client setup, migrations, sample models, and environment variables. Include the database workflow in the current app.',
    fields: [
      { key: 'databaseUrl', label: 'Database URL', placeholder: 'postgresql://...' },
      { key: 'directUrl', label: 'Direct URL', placeholder: 'postgresql://...' },
    ],
  },
  {
    id: 'convex',
    label: 'Convex',
    docsUrl: 'https://dashboard.convex.dev',
    description: 'Realtime backend with functions, queries, and auth.',
    supportsWeb: true,
    supportsMobile: true,
    prompt:
      'Add Convex to this project with schema, queries, mutations, client wiring, and a starter data model integrated into the current product.',
    fields: [
      { key: 'deploymentUrl', label: 'Deployment URL', placeholder: 'https://curious-fox-123.convex.cloud' },
      { key: 'adminKey', label: 'Admin key', placeholder: 'convex_admin_...', secret: true },
    ],
  },
  {
    id: 'supabase',
    label: 'Supabase',
    docsUrl: 'https://supabase.com/dashboard',
    description: 'Auth, Postgres, storage, and realtime services.',
    supportsWeb: true,
    supportsMobile: true,
    prompt:
      'Add Supabase to this project with auth, database client, environment variables, and starter CRUD wiring inside the current app.',
    fields: [
      { key: 'projectUrl', label: 'Project URL', placeholder: 'https://xyzcompany.supabase.co' },
      { key: 'anonKey', label: 'Anon key', placeholder: 'sb_publishable_...' },
    ],
  },
  {
    id: 'sqlite',
    label: 'SQLite',
    docsUrl: 'https://docs.expo.dev/versions/latest/sdk/sqlite/',
    description: 'Local-first persistence for offline-friendly app flows.',
    supportsWeb: false,
    supportsMobile: true,
    prompt: 'Add SQLite to this project with local database wiring, schema setup, and starter data access in the app.',
    fields: [{ key: 'dbName', label: 'Database name', placeholder: 'app.db' }],
  },
  {
    id: 'firebase',
    label: 'Firebase',
    docsUrl: 'https://console.firebase.google.com',
    description: 'Cloud auth, Firestore, storage, and notifications.',
    supportsWeb: true,
    supportsMobile: true,
    prompt:
      'Add Firebase to this project with auth, Firestore or Realtime Database, storage, and starter integration inside the current app.',
    fields: [
      { key: 'projectId', label: 'Project ID', placeholder: 'my-mobile-app' },
      { key: 'apiKey', label: 'API key', placeholder: 'AIza...', secret: true },
    ],
  },
];

const PAYMENT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'stripe',
    label: 'Stripe',
    docsUrl: 'https://dashboard.stripe.com',
    description: 'Subscriptions, checkout, customer portal, and webhooks.',
    supportsWeb: true,
    supportsMobile: true,
    prompt: 'Add Stripe checkout, webhook handling, server actions, and subscription/payment UI to this project.',
    fields: [
      { key: 'publishableKey', label: 'Publishable key', placeholder: 'pk_live_...' },
      { key: 'secretKey', label: 'Secret key', placeholder: 'sk_live_...', secret: true },
    ],
  },
  {
    id: 'razorpay',
    label: 'Razorpay',
    docsUrl: 'https://dashboard.razorpay.com',
    description: 'Order creation, signatures, and India-focused checkout.',
    supportsWeb: true,
    supportsMobile: true,
    prompt: 'Add Razorpay payment flow, order creation, signature verification, and checkout UI to this project.',
    fields: [
      { key: 'keyId', label: 'Key ID', placeholder: 'rzp_live_...' },
      { key: 'keySecret', label: 'Key secret', placeholder: '...', secret: true },
    ],
  },
  {
    id: 'paypal',
    label: 'PayPal',
    docsUrl: 'https://developer.paypal.com/dashboard',
    description: 'Capture flow and wallet payments across regions.',
    supportsWeb: true,
    supportsMobile: true,
    prompt: 'Add PayPal checkout, capture flow, and payment status handling to this project.',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'AY...' },
      { key: 'clientSecret', label: 'Client secret', placeholder: '...', secret: true },
    ],
  },
  {
    id: 'phonepe',
    label: 'PhonePe',
    docsUrl: 'https://business.phonepe.com',
    description: 'Mobile-friendly payment flows and verification hooks.',
    supportsWeb: true,
    supportsMobile: true,
    prompt: 'Add PhonePe payment integration with server-side verification and client checkout flow.',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', placeholder: 'M123456789' },
      { key: 'saltKey', label: 'Salt key', placeholder: '...', secret: true },
    ],
  },
  {
    id: 'google-pay',
    label: 'Google Pay',
    docsUrl: 'https://pay.google.com/business/console',
    description: 'Express wallet flows where supported by the runtime.',
    supportsWeb: true,
    supportsMobile: true,
    prompt: 'Add Google Pay button integration and payment confirmation flow where supported.',
    fields: [
      { key: 'merchantName', label: 'Merchant name', placeholder: 'Indexblue Labs' },
      { key: 'merchantId', label: 'Merchant ID', placeholder: '0123456789' },
    ],
  },
];

const API_CATEGORY_LABELS: Record<ApiCategory, string> = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  data: 'Data',
};

const API_MODELS: ApiModel[] = [
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'OpenAI', category: 'text' },
  { id: 'claude-3.7-sonnet', label: 'Claude 3.7 Sonnet', provider: 'Anthropic', category: 'text' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google', category: 'text' },
  { id: 'dall-e-3', label: 'DALL·E 3', provider: 'OpenAI', category: 'image' },
  { id: 'imagen-3', label: 'Imagen 3', provider: 'Google', category: 'image' },
  { id: 'whisper-large-v3', label: 'Whisper Large v3', provider: 'OpenAI', category: 'audio' },
  { id: 'tts-1-hd', label: 'TTS-1 HD', provider: 'OpenAI', category: 'audio' },
  { id: 'runway-gen-3', label: 'Runway Gen-3', provider: 'Runway', category: 'video' },
  { id: 'pika-2.1', label: 'Pika 2.1', provider: 'Pika', category: 'video' },
  { id: 'xata-data-plane', label: 'Xata Data Plane', provider: 'Xata', category: 'data' },
  { id: 'turso-libsql', label: 'Turso libSQL', provider: 'Turso', category: 'data' },
];

const HAPTIC_OPTIONS: HapticOption[] = [
  { id: 'error', label: 'Error Notification', kind: 'notification', vibration: [50, 30, 50, 30, 100] },
  { id: 'heavy', label: 'Heavy Impact', kind: 'impact', vibration: 100 },
  { id: 'light', label: 'Light Impact', kind: 'impact', vibration: 20 },
  { id: 'medium', label: 'Medium Impact', kind: 'impact', vibration: 50 },
  { id: 'rigid', label: 'Rigid Impact', kind: 'impact', vibration: 80 },
  { id: 'selection', label: 'Selection Change', kind: 'selection', vibration: 40 },
  { id: 'soft', label: 'Soft Impact', kind: 'impact', vibration: 30 },
  { id: 'success', label: 'Success Notification', kind: 'notification', vibration: [30, 20, 80] },
  { id: 'warning', label: 'Warning Notification', kind: 'notification', vibration: [50, 30, 50] },
];

const APP_STEALER_INPUT_CONFIG: Record<
  AppStealerInputType,
  {
    icon: LucideIcon;
    label: string;
    placeholder: string;
    description: string;
    colorClass: string;
  }
> = {
  name: {
    icon: Search,
    label: 'App Name',
    placeholder: 'e.g., Duolingo, Spotify, Instagram',
    description: 'Search by app name across stores',
    colorClass: 'text-blue-400',
  },
  appstore: {
    icon: Apple,
    label: 'App Store',
    placeholder: 'https://apps.apple.com/app/...',
    description: 'Paste an iOS App Store URL',
    colorClass: 'text-slate-300',
  },
  playstore: {
    icon: Store,
    label: 'Play Store',
    placeholder: 'https://play.google.com/store/apps/...',
    description: 'Paste a Google Play Store URL',
    colorClass: 'text-green-400',
  },
  website: {
    icon: Globe,
    label: 'Website',
    placeholder: 'https://example.com',
    description: 'Paste any website or landing page',
    colorClass: 'text-purple-400',
  },
};

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenTree(node.children) : [])]);
}

function getExtension(path: string) {
  const extension = path.split('.').pop();
  return extension ? extension.toLowerCase() : '';
}

function uniqueMatches(paths: string[]) {
  return Array.from(new Set(paths)).slice(0, 12);
}

function mediaItemsFromPaths(paths: string[]): MediaItem[] {
  return paths.map((path) => ({
    id: `workspace:${path}`,
    name: path.split('/').pop() ?? path,
    path,
    kind: 'workspace',
  }));
}

function deriveConnectedState(paths: string[], providerId: string) {
  const joined = paths.join(' ');

  switch (providerId) {
    case 'prisma-postgres':
      return /prisma|schema\.prisma|postgres/i.test(joined);
    case 'convex':
      return /convex/i.test(joined);
    case 'supabase':
      return /supabase/i.test(joined);
    case 'sqlite':
      return /sqlite|\.db\b/i.test(joined);
    case 'firebase':
      return /firebase/i.test(joined);
    case 'stripe':
      return /stripe/i.test(joined);
    case 'razorpay':
      return /razorpay/i.test(joined);
    case 'paypal':
      return /paypal/i.test(joined);
    case 'phonepe':
      return /phonepe/i.test(joined);
    case 'google-pay':
      return /google.?pay/i.test(joined);
    default:
      return false;
  }
}

function formatUpdatedLabel(updatedAt: Date | null) {
  if (!updatedAt) return 'Not loaded';
  const seconds = Math.floor((Date.now() - updatedAt.getTime()) / 1000);
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  return `Updated ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export function isBuilderAppToolTabId(value: string): value is BuilderAppToolTabId {
  return BUILDER_APP_TOOL_TABS.some((tab) => tab.id === value);
}

export function BuilderAppToolPanel({
  activeTool,
  projectId,
  projectName,
  sourceType,
  sourceUrl,
  previewUrl,
  tree,
  consoleEntries,
  activeTerminal,
  onOpenFile,
  onRequestPrompt,
  onRunCommand,
}: {
  activeTool: BuilderAppToolTabId;
  projectId: string;
  projectName: string;
  sourceType: string;
  sourceUrl: string;
  previewUrl: string;
  tree: TreeNode[];
  consoleEntries: ConsoleEntry[];
  activeTerminal: TerminalSnapshot | null;
  onOpenFile: (path: string) => void;
  onRequestPrompt: (prompt: string) => void;
  onRunCommand: (command: string) => void;
}) {
  const filePaths = useMemo(
    () =>
      flattenTree(tree)
        .filter((node) => node.type === 'file')
        .map((node) => node.path),
    [tree],
  );

  const envFiles = useMemo(
    () => uniqueMatches(filePaths.filter((path) => path.includes('.env') || /app\.config|app\.json/i.test(path))),
    [filePaths],
  );
  const databaseFiles = useMemo(
    () =>
      uniqueMatches(
        filePaths.filter((path) =>
          /(prisma|schema\.prisma|drizzle|sqlite|supabase|firebase|database|db\/|queries|migrations)/i.test(path),
        ),
      ),
    [filePaths],
  );
  const paymentFiles = useMemo(
    () =>
      uniqueMatches(
        filePaths.filter((path) => /(stripe|revenuecat|payment|checkout|billing|paywall|paypal|razorpay)/i.test(path)),
      ),
    [filePaths],
  );
  const imageItems = useMemo(
    () => mediaItemsFromPaths(uniqueMatches(filePaths.filter((path) => IMAGE_EXTENSIONS.includes(getExtension(path))))),
    [filePaths],
  );
  const audioItems = useMemo(
    () => mediaItemsFromPaths(uniqueMatches(filePaths.filter((path) => AUDIO_EXTENSIONS.includes(getExtension(path))))),
    [filePaths],
  );
  const videoItems = useMemo(
    () => mediaItemsFromPaths(uniqueMatches(filePaths.filter((path) => VIDEO_EXTENSIONS.includes(getExtension(path))))),
    [filePaths],
  );

  const [backendState, setBackendState] = useState<{
    integrations: ProjectIntegrationRecord[];
    envVars: ProjectEnvVarRecord[];
    assets: ProjectAssetRecord[];
    jobs: ProjectJobRecord[];
    toolStates: ProjectToolStateRecord[];
    events: ProjectEventRecord[];
  }>({
    integrations: [],
    envVars: [],
    assets: [],
    jobs: [],
    toolStates: [],
    events: [],
  });
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isRefreshingState, setIsRefreshingState] = useState(false);

  const refreshProjectState = async () => {
    setIsRefreshingState(true);
    setBackendError(null);

    try {
      const response = await fetch(`/api/builder/projects/${projectId}/app-state`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        integrations?: ProjectIntegrationRecord[];
        envVars?: ProjectEnvVarRecord[];
        assets?: ProjectAssetRecord[];
        jobs?: ProjectJobRecord[];
        toolStates?: ProjectToolStateRecord[];
        events?: ProjectEventRecord[];
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load project app state.');
      }

      setBackendState({
        integrations: payload?.integrations ?? [],
        envVars: payload?.envVars ?? [],
        assets: payload?.assets ?? [],
        jobs: payload?.jobs ?? [],
        toolStates: payload?.toolStates ?? [],
        events: payload?.events ?? [],
      });
    } catch (error) {
      setBackendError(normalizeError(error));
    } finally {
      setIsRefreshingState(false);
    }
  };

  useEffect(() => {
    void refreshProjectState();

    const timer = window.setInterval(
      () => {
        void refreshProjectState();
      },
      activeTool === 'expo-logs' ? 3000 : 5000,
    );

    return () => window.clearInterval(timer);
  }, [activeTool, projectId]);

  const integrationsByType = useMemo(
    () => ({
      database: backendState.integrations.filter((integration) => integration.type === 'database'),
      payment: backendState.integrations.filter((integration) => integration.type === 'payment'),
    }),
    [backendState.integrations],
  );
  const assetLists = useMemo(
    () => ({
      image: backendState.assets.filter((asset) => asset.kind === 'image'),
      audio: backendState.assets.filter((asset) => asset.kind === 'audio'),
      video: backendState.assets.filter((asset) => asset.kind === 'video'),
    }),
    [backendState.assets],
  );
  const toolStateMap = useMemo(
    () =>
      Object.fromEntries(backendState.toolStates.map((toolState) => [toolState.toolId, toolState.state])) as Record<
        string,
        Record<string, unknown>
      >,
    [backendState.toolStates],
  );
  const latestJobByKind = useMemo(() => {
    const map = new Map<string, ProjectJobRecord>();
    for (const job of backendState.jobs) {
      if (!map.has(job.kind)) {
        map.set(job.kind, job);
      }
    }
    return map;
  }, [backendState.jobs]);

  const saveIntegration = async ({
    type,
    provider,
    credentials,
    status,
    dashboardUrl,
    webhookStatus,
    metadata,
  }: {
    type: 'database' | 'payment';
    provider: string;
    credentials: Record<string, string>;
    status?: string;
    dashboardUrl?: string | null;
    webhookStatus?: string | null;
    metadata?: Record<string, unknown>;
  }) => {
    const response = await fetch(`/api/builder/projects/${projectId}/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        provider,
        credentials,
        status,
        dashboardUrl,
        webhookStatus,
        metadata,
      }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to save integration.');
    }

    await refreshProjectState();
  };

  const checkIntegrationHealth = async ({
    type,
    provider,
    credentials,
  }: {
    type: 'database' | 'payment';
    provider: string;
    credentials: Record<string, string>;
  }) => {
    const response = await fetch(`/api/builder/projects/${projectId}/integrations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        provider,
        credentials,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      health?: { healthy: boolean; message: string };
    } | null;

    if (!response.ok && !payload?.health) {
      throw new Error(payload?.error || 'Failed to check integration health.');
    }

    await refreshProjectState();
    return payload?.health ?? { healthy: false, message: 'Health check failed.' };
  };

  const saveEnvVars = async (entries: Array<{ key: string; value: string; isSecret?: boolean }>) => {
    const response = await fetch(`/api/builder/projects/${projectId}/env`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to save environment variables.');
    }
    await refreshProjectState();
  };

  const deleteEnvVar = async (key: string) => {
    const response = await fetch(`/api/builder/projects/${projectId}/env`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to delete environment variable.');
    }
    await refreshProjectState();
  };

  const syncEnvVars = async () => {
    const response = await fetch(`/api/builder/projects/${projectId}/env`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to sync environment variables.');
    }
    await refreshProjectState();
  };

  const saveToolState = async (toolId: string, state: Record<string, unknown>) => {
    const response = await fetch(`/api/builder/projects/${projectId}/tool-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolId, state }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to save tool state.');
    }
    await refreshProjectState();
  };

  const requestMediaGeneration = async (kind: 'image' | 'audio' | 'video', payload: Record<string, unknown>) => {
    const response = await fetch(`/api/builder/projects/${projectId}/media/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generate',
        ...payload,
      }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(body?.error || `Failed to generate ${kind}.`);
    }
    await refreshProjectState();
  };

  const deleteMediaAsset = async (kind: 'image' | 'audio' | 'video', assetId: string) => {
    const response = await fetch(`/api/builder/projects/${projectId}/media/${kind}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(body?.error || `Failed to delete ${kind}.`);
    }
    await refreshProjectState();
  };

  const uploadMediaAsset = async (kind: 'image' | 'audio' | 'video', file: File) => {
    const base64 = await fileToBase64(file);
    const response = await fetch(`/api/builder/projects/${projectId}/media/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upload',
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        base64,
      }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(body?.error || `Failed to upload ${kind}.`);
    }
    await refreshProjectState();
  };

  const runAppStealer = async (input: string, inputType: AppStealerInputType) => {
    const response = await fetch(`/api/builder/projects/${projectId}/app-stealer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, inputType }),
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      result?: { summary: string; systemPrompt: string };
    } | null;
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to research the reference app.');
    }
    await refreshProjectState();
    return payload?.result ?? null;
  };

  const runPublishAction = async (action: 'prepare' | 'build-preview' | 'build-production' | 'submit-app-store') => {
    const response = await fetch(`/api/builder/projects/${projectId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to run the publish action.');
    }
    await refreshProjectState();
    return payload;
  };

  const runGitHubPush = async ({
    repository,
    commitMessage,
    createIfMissing,
    branch,
    visibility,
  }: {
    repository: string;
    commitMessage?: string;
    createIfMissing?: boolean;
    branch?: string;
    visibility?: 'private' | 'public';
  }) => {
    const response = await fetch(`/api/builder/projects/${projectId}/github/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repository,
        commitMessage,
        createIfMissing,
        branch,
        visibility,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to push this workspace to GitHub.');
    }
    await refreshProjectState();
    return payload;
  };

  const preferredRestartCommand = useMemo(() => {
    if (filePaths.some((path) => /app\.json|app\.config|expo/i.test(path))) {
      return 'npx expo start --tunnel --clear';
    }
    if (filePaths.includes('package.json')) {
      return 'npm run dev';
    }
    return 'pwd';
  }, [filePaths]);

  switch (activeTool) {
    case 'database':
      return (
        <DatabaseTool
          databaseFiles={databaseFiles}
          filePaths={filePaths}
          backendError={backendError}
          integrations={integrationsByType.database}
          isRefreshingState={isRefreshingState}
          onOpenFile={onOpenFile}
          onRequestPrompt={onRequestPrompt}
          onRefreshState={refreshProjectState}
          onSaveIntegration={(provider, credentials, status, dashboardUrl, metadata) =>
            saveIntegration({ type: 'database', provider, credentials, status, dashboardUrl, metadata })
          }
          onCheckHealth={(provider, credentials) => checkIntegrationHealth({ type: 'database', provider, credentials })}
        />
      );
    case 'environment':
      return (
        <EnvironmentTool
          backendError={backendError}
          envFiles={envFiles}
          envVars={backendState.envVars}
          isRefreshingState={isRefreshingState}
          onOpenFile={onOpenFile}
          onRequestPrompt={onRequestPrompt}
          onRefreshState={refreshProjectState}
          onSaveEnvVars={saveEnvVars}
          onDeleteEnvVar={deleteEnvVar}
          onSyncEnvVars={syncEnvVars}
          previewUrl={previewUrl}
          sourceUrl={sourceUrl}
          projectName={projectName}
          sourceType={sourceType}
        />
      );
    case 'expo-logs':
      return (
        <ExpoLogsTool
          projectName={projectName}
          previewUrl={previewUrl}
          consoleEntries={consoleEntries}
          activeTerminal={activeTerminal}
          onRequestPrompt={onRequestPrompt}
        />
      );
    case 'haptics':
      return (
        <HapticsTool
          initialSelection={(toolStateMap['haptics']?.selected as string[] | undefined) ?? []}
          onPersistSelection={(selected) => saveToolState('haptics', { selected })}
          onRequestPrompt={onRequestPrompt}
        />
      );
    case 'api-models':
      return (
        <ApiModelsTool
          initialCategory={(toolStateMap['api-models']?.selectedCategory as ApiCategory | undefined) ?? 'text'}
          initialSelection={(toolStateMap['api-models']?.selectedModels as string[] | undefined) ?? []}
          onPersistSelection={(state) => saveToolState('api-models', state)}
          onRequestPrompt={onRequestPrompt}
        />
      );
    case 'images':
      return (
        <ImageStudioTool
          generatedItems={assetLists.image}
          workspaceItems={imageItems}
          onDeleteAsset={(assetId) => deleteMediaAsset('image', assetId)}
          onGenerate={(payload) => requestMediaGeneration('image', payload)}
          onOpenFile={onOpenFile}
          onRequestPrompt={onRequestPrompt}
          onUpload={(file) => uploadMediaAsset('image', file)}
        />
      );
    case 'audio':
      return (
        <AudioStudioTool
          generatedItems={assetLists.audio}
          workspaceItems={audioItems}
          onDeleteAsset={(assetId) => deleteMediaAsset('audio', assetId)}
          onGenerate={(payload) => requestMediaGeneration('audio', payload)}
          onOpenFile={onOpenFile}
          onRequestPrompt={onRequestPrompt}
        />
      );
    case 'video':
      return (
        <VideoStudioTool
          generatedItems={assetLists.video}
          workspaceItems={videoItems}
          onDeleteAsset={(assetId) => deleteMediaAsset('video', assetId)}
          onGenerate={(payload) => requestMediaGeneration('video', payload)}
          onOpenFile={onOpenFile}
          onRequestPrompt={onRequestPrompt}
        />
      );
    case 'app-stealer':
      return (
        <AppStealerTool
          job={latestJobByKind.get('app-stealer') ?? null}
          savedState={toolStateMap['app-stealer'] ?? null}
          onRequestPrompt={onRequestPrompt}
          onRunResearch={runAppStealer}
        />
      );
    case 'payments':
      return (
        <PaymentsTool
          backendError={backendError}
          paymentFiles={paymentFiles}
          filePaths={filePaths}
          integrations={integrationsByType.payment}
          isRefreshingState={isRefreshingState}
          onOpenFile={onOpenFile}
          onRequestPrompt={onRequestPrompt}
          onRefreshState={refreshProjectState}
          onSaveIntegration={(provider, credentials, status, dashboardUrl, metadata) =>
            saveIntegration({ type: 'payment', provider, credentials, status, dashboardUrl, metadata })
          }
          onCheckHealth={(provider, credentials) => checkIntegrationHealth({ type: 'payment', provider, credentials })}
        />
      );
    case 'push-to-github':
      return (
        <PushToGitHubTool
          projectId={projectId}
          projectName={projectName}
          job={latestJobByKind.get('github-push') ?? null}
          sourceUrl={sourceUrl}
          onPush={runGitHubPush}
        />
      );
    case 'publish':
      return (
        <PublishTool
          job={latestJobByKind.get('expo-publish') ?? null}
          onRunPublishAction={runPublishAction}
          sourceUrl={sourceUrl}
          previewUrl={previewUrl}
          projectName={projectName}
          onRequestPrompt={onRequestPrompt}
        />
      );
    case 'restart-dev-server':
      return (
        <RestartDevServerTool
          preferredCommand={preferredRestartCommand}
          activeTerminal={activeTerminal}
          onRunCommand={onRunCommand}
          onRequestPrompt={onRequestPrompt}
        />
      );
    default:
      return null;
  }
}

function DatabaseTool({
  databaseFiles,
  filePaths,
  integrations,
  isRefreshingState,
  backendError,
  onOpenFile,
  onRequestPrompt,
  onRefreshState,
  onSaveIntegration,
  onCheckHealth,
}: {
  databaseFiles: string[];
  filePaths: string[];
  integrations: ProjectIntegrationRecord[];
  isRefreshingState: boolean;
  backendError: string | null;
  onOpenFile: (path: string) => void;
  onRequestPrompt: (prompt: string) => void;
  onRefreshState: () => Promise<void>;
  onSaveIntegration: (
    provider: string,
    credentials: Record<string, string>,
    status?: string,
    dashboardUrl?: string | null,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
  onCheckHealth: (
    provider: string,
    credentials: Record<string, string>,
  ) => Promise<{ healthy: boolean; message: string }>;
}) {
  const [connectionOverrides, setConnectionOverrides] = useState<Record<string, boolean>>({});
  const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>({});
  const [healthByProvider, setHealthByProvider] = useState<Record<string, { healthy: boolean; message: string }>>({});
  const [activeConfig, setActiveConfig] = useState<string | null>(null);
  const integrationMap = useMemo(
    () => new Map(integrations.map((integration) => [integration.provider, integration])),
    [integrations],
  );

  useEffect(() => {
    setCredentials((current) => {
      const next = { ...current };
      for (const integration of integrations) {
        next[integration.provider] =
          Object.keys(current[integration.provider] ?? {}).length > 0
            ? current[integration.provider]
            : integration.credentials;
      }
      return next;
    });

    setHealthByProvider((current) => {
      const next = { ...current };
      for (const integration of integrations) {
        if (integration.lastCheckStatus === 'healthy') {
          next[integration.provider] = {
            healthy: true,
            message: integration.lastError || `${integration.provider} looks healthy.`,
          };
        } else if (integration.lastCheckStatus === 'error' && integration.lastError) {
          next[integration.provider] = {
            healthy: false,
            message: integration.lastError,
          };
        }
      }
      return next;
    });
  }, [integrations]);

  return (
    <div className="flex h-full flex-col">
      <ToolHeader icon={Database} iconClassName="text-purple-400" title="Database integrations for mobile projects">
        <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => void onRefreshState()}>
          {isRefreshingState ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </ToolHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {backendError ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {backendError}
            </div>
          ) : null}
          {databaseFiles.length > 0 ? (
            <InlineFileGroup label="Detected data files" paths={databaseFiles} onOpenFile={onOpenFile} />
          ) : null}

          {DATABASE_PROVIDERS.map((provider) => {
            const savedIntegration = integrationMap.get(provider.id);
            const connected =
              connectionOverrides[provider.id] ??
              (savedIntegration
                ? savedIntegration.status !== 'disconnected'
                : deriveConnectedState(filePaths, provider.id));
            const health = healthByProvider[provider.id];
            const providerCredentials = credentials[provider.id] ?? savedIntegration?.credentials ?? {};

            return (
              <ProviderCard
                key={provider.id}
                provider={provider}
                connected={connected}
                accentClass="text-purple-400"
                connectClass={connected ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-purple-600 hover:bg-purple-700'}
                health={health}
                credentials={providerCredentials}
                activeConfig={activeConfig === provider.id}
                onToggleConnect={async () => {
                  const nextConnected = !connected;
                  setConnectionOverrides((current) => ({
                    ...current,
                    [provider.id]: nextConnected,
                  }));
                  await onSaveIntegration(
                    provider.id,
                    providerCredentials,
                    nextConnected ? 'connected' : 'disconnected',
                    provider.docsUrl,
                    savedIntegration?.metadata ?? {},
                  );
                }}
                onCredentialChange={(key, value) =>
                  setCredentials((current) => ({
                    ...current,
                    [provider.id]: {
                      ...(current[provider.id] ?? {}),
                      [key]: value,
                    },
                  }))
                }
                onAddPrompt={() => onRequestPrompt(provider.prompt)}
                onCheckHealth={async () => {
                  const nextHealth = await onCheckHealth(provider.id, providerCredentials);
                  setHealthByProvider((current) => ({
                    ...current,
                    [provider.id]: nextHealth,
                  }));
                }}
                onOpenDocs={() => window.open(provider.docsUrl, '_blank', 'noopener,noreferrer')}
                onToggleConfig={() => setActiveConfig((current) => (current === provider.id ? null : provider.id))}
              />
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function PaymentsTool({
  paymentFiles,
  filePaths,
  integrations,
  isRefreshingState,
  backendError,
  onOpenFile,
  onRequestPrompt,
  onRefreshState,
  onSaveIntegration,
  onCheckHealth,
}: {
  paymentFiles: string[];
  filePaths: string[];
  integrations: ProjectIntegrationRecord[];
  isRefreshingState: boolean;
  backendError: string | null;
  onOpenFile: (path: string) => void;
  onRequestPrompt: (prompt: string) => void;
  onRefreshState: () => Promise<void>;
  onSaveIntegration: (
    provider: string,
    credentials: Record<string, string>,
    status?: string,
    dashboardUrl?: string | null,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
  onCheckHealth: (
    provider: string,
    credentials: Record<string, string>,
  ) => Promise<{ healthy: boolean; message: string }>;
}) {
  const [connectionOverrides, setConnectionOverrides] = useState<Record<string, boolean>>({});
  const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>({});
  const [healthByProvider, setHealthByProvider] = useState<Record<string, { healthy: boolean; message: string }>>({});
  const integrationMap = useMemo(
    () => new Map(integrations.map((integration) => [integration.provider, integration])),
    [integrations],
  );

  useEffect(() => {
    setCredentials((current) => {
      const next = { ...current };
      for (const integration of integrations) {
        next[integration.provider] =
          Object.keys(current[integration.provider] ?? {}).length > 0
            ? current[integration.provider]
            : integration.credentials;
      }
      return next;
    });
  }, [integrations]);

  return (
    <div className="flex h-full flex-col">
      <ToolHeader icon={CreditCard} iconClassName="text-emerald-400" title="Payment providers for mobile projects">
        <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => void onRefreshState()}>
          {isRefreshingState ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </ToolHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {backendError ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {backendError}
            </div>
          ) : null}
          {paymentFiles.length > 0 ? (
            <InlineFileGroup label="Detected payment files" paths={paymentFiles} onOpenFile={onOpenFile} />
          ) : null}

          {PAYMENT_PROVIDERS.map((provider) => {
            const savedIntegration = integrationMap.get(provider.id);
            const connected =
              connectionOverrides[provider.id] ??
              (savedIntegration
                ? savedIntegration.status !== 'disconnected'
                : deriveConnectedState(filePaths, provider.id));
            const health = healthByProvider[provider.id];
            const providerCredentials = credentials[provider.id] ?? savedIntegration?.credentials ?? {};

            return (
              <ProviderCard
                key={provider.id}
                provider={provider}
                connected={connected}
                accentClass="text-emerald-400"
                connectClass={connected ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-emerald-600 hover:bg-emerald-700'}
                health={health}
                credentials={providerCredentials}
                activeConfig={false}
                onToggleConnect={async () => {
                  const nextConnected = !connected;
                  setConnectionOverrides((current) => ({
                    ...current,
                    [provider.id]: nextConnected,
                  }));
                  await onSaveIntegration(
                    provider.id,
                    providerCredentials,
                    nextConnected ? 'connected' : 'disconnected',
                    provider.docsUrl,
                    savedIntegration?.metadata ?? {},
                  );
                }}
                onCredentialChange={(key, value) =>
                  setCredentials((current) => ({
                    ...current,
                    [provider.id]: {
                      ...(current[provider.id] ?? {}),
                      [key]: value,
                    },
                  }))
                }
                onAddPrompt={() => onRequestPrompt(provider.prompt)}
                onCheckHealth={async () => {
                  const nextHealth = await onCheckHealth(provider.id, providerCredentials);
                  setHealthByProvider((current) => ({
                    ...current,
                    [provider.id]: nextHealth,
                  }));
                }}
                onOpenDocs={() => window.open(provider.docsUrl, '_blank', 'noopener,noreferrer')}
              />
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function EnvironmentTool({
  envFiles,
  envVars,
  backendError,
  isRefreshingState,
  onOpenFile,
  onRequestPrompt,
  onRefreshState,
  onSaveEnvVars,
  onDeleteEnvVar,
  onSyncEnvVars,
  previewUrl,
  sourceUrl,
  projectName,
  sourceType,
}: {
  envFiles: string[];
  envVars: ProjectEnvVarRecord[];
  backendError: string | null;
  isRefreshingState: boolean;
  onOpenFile: (path: string) => void;
  onRequestPrompt: (prompt: string) => void;
  onRefreshState: () => Promise<void>;
  onSaveEnvVars: (entries: Array<{ key: string; value: string; isSecret?: boolean }>) => Promise<void>;
  onDeleteEnvVar: (key: string) => Promise<void>;
  onSyncEnvVars: () => Promise<void>;
  previewUrl: string;
  sourceUrl: string;
  projectName: string;
  sourceType: string;
}) {
  const [envRows, setEnvRows] = useState<Array<{ id: string; key: string; value: string }>>([
    { id: 'env-1', key: 'EXPO_PUBLIC_API_URL', value: '' },
    { id: 'env-2', key: 'EXPO_PUBLIC_SUPABASE_URL', value: '' },
    { id: 'env-3', key: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', value: '' },
  ]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (envVars.length === 0) return;
    setEnvRows(envVars.map((row, index) => ({ id: `env-${index}-${row.key}`, key: row.key, value: row.value })));
  }, [envVars]);

  const addRow = () => {
    setEnvRows((current) => [...current, { id: `env-${Date.now()}`, key: '', value: '' }]);
  };

  const promptSummary = envRows
    .filter((row) => row.key.trim())
    .map((row) => `${row.key}=${row.value || '<value>'}`)
    .join('\n');

  return (
    <div className="flex h-full flex-col">
      <ToolHeader
        icon={Settings2}
        iconClassName="text-slate-300"
        title="Environment Variables"
        meta={envFiles.length > 0 ? `${envFiles.length} env files detected` : 'No env files yet'}
      >
        <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => void onRefreshState()}>
          {isRefreshingState ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </ToolHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {backendError ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {backendError}
            </div>
          ) : null}
          <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">Environment files</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Open the files that hold runtime secrets and app config.
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7" onClick={addRow}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            {envFiles.length > 0 ? (
              <InlineFileGroup paths={envFiles} onOpenFile={onOpenFile} />
            ) : (
              <ToolEmptyState
                icon={Settings2}
                title="No env files yet"
                description="Create a `.env` file from the code tab or ask the AI to scaffold your environment setup."
              />
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
            <div className="mb-3 text-sm font-medium text-foreground">Working values</div>
            <div className="space-y-2">
              {envRows.map((row) => (
                <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                  <Input
                    value={row.key}
                    placeholder="KEY"
                    className="h-9 bg-background/60 text-xs"
                    onChange={(event) =>
                      setEnvRows((current) =>
                        current.map((item) => (item.id === row.id ? { ...item, key: event.target.value } : item)),
                      )
                    }
                  />
                  <Input
                    value={row.value}
                    placeholder="value"
                    className="h-9 bg-background/60 text-xs"
                    onChange={(event) =>
                      setEnvRows((current) =>
                        current.map((item) => (item.id === row.id ? { ...item, value: event.target.value } : item)),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      setEnvRows((current) => current.filter((item) => item.id !== row.id));
                      if (row.key.trim()) {
                        try {
                          await onDeleteEnvVar(row.key.trim());
                        } catch (error) {
                          setSaveStatus(normalizeError(error));
                        }
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
            <div className="mb-3 text-sm font-medium text-foreground">Runtime helpers</div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div>Project: {projectName}</div>
              <div>Source type: {sourceType}</div>
              <div>Preview: {previewUrl || 'waiting for preview'}</div>
              <div>Source repo: {sourceUrl || 'not connected'}</div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="border-t p-3">
        {saveStatus ? <div className="mb-2 text-xs text-white/55">{saveStatus}</div> : null}
        <div className="grid grid-cols-3 gap-2">
          <Button
            size="sm"
            className="bg-slate-700 text-white hover:bg-slate-600"
            onClick={async () => {
              try {
                await onSaveEnvVars(
                  envRows.filter((row) => row.key.trim()).map((row) => ({ key: row.key.trim(), value: row.value })),
                );
                setSaveStatus('Environment saved');
              } catch (error) {
                setSaveStatus(normalizeError(error));
              }
            }}
          >
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await onSyncEnvVars();
                setSaveStatus('Environment synced to the builder runtime');
              } catch (error) {
                setSaveStatus(normalizeError(error));
              }
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync
          </Button>
          <Button
            size="sm"
            className="bg-slate-700 text-white hover:bg-slate-600"
            onClick={() =>
              onRequestPrompt(
                `Create or update the environment setup for this mobile app.\n\nUse these keys as a starting point:\n${promptSummary || 'EXPO_PUBLIC_API_URL=<value>'}`,
              )
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Prompt
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExpoLogsTool({
  projectName,
  previewUrl,
  consoleEntries,
  activeTerminal,
  onRequestPrompt,
}: {
  projectName: string;
  previewUrl: string;
  consoleEntries: ConsoleEntry[];
  activeTerminal: TerminalSnapshot | null;
  onRequestPrompt: (prompt: string) => void;
}) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const logLines = useMemo(() => {
    const terminalLines = activeTerminal?.output.split('\n').filter(Boolean).slice(-120) ?? [];
    const eventLines = consoleEntries
      .slice(0, 16)
      .reverse()
      .flatMap((entry) => [`[${entry.source}] ${entry.title}`, ...(entry.detail ? [entry.detail] : [])]);
    return [...eventLines, ...terminalLines].slice(-180);
  }, [activeTerminal?.output, consoleEntries]);

  useEffect(() => {
    setLastUpdated(new Date());
  }, [logLines.length]);

  return (
    <div className="flex h-full flex-col">
      <ToolHeader icon={TerminalSquare} iconClassName="text-green-500" title={formatUpdatedLabel(lastUpdated)}>
        <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => setLastUpdated(new Date())}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </ToolHeader>

      <div className="border-b bg-background/20 px-3 py-2 text-[11px] text-muted-foreground">
        <div>Project: {projectName}</div>
        <div>Preview: {previewUrl || 'pending'}</div>
        <div>Terminal: {activeTerminal?.title || 'Terminal 1'}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-black/20 p-3">
        {logLines.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">No logs available yet</p>
          </div>
        ) : (
          <div className="space-y-0">
            {logLines.map((line, index) => (
              <LogLine key={`${line}-${index}`} index={index} line={line} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t p-3">
        <Button
          onClick={() =>
            onRequestPrompt(
              `Use the latest Expo logs and builder output to debug this mobile app. Focus on the failing preview, runtime issues, and command output.`,
            )
          }
          className="w-full bg-green-600 text-white hover:bg-green-700"
          size="sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add to prompt
        </Button>
      </div>
    </div>
  );
}

function HapticsTool({
  initialSelection,
  onPersistSelection,
  onRequestPrompt,
}: {
  initialSelection: string[];
  onPersistSelection: (selected: string[]) => Promise<void>;
  onRequestPrompt: (prompt: string) => void;
}) {
  const [selectedHaptics, setSelectedHaptics] = useState<Set<string>>(new Set(initialSelection));

  useEffect(() => {
    setSelectedHaptics(new Set(initialSelection));
  }, [initialSelection]);

  const toggleHaptic = (hapticId: string) => {
    setSelectedHaptics((current) => {
      const next = new Set(current);
      if (next.has(hapticId)) next.delete(hapticId);
      else next.add(hapticId);
      void onPersistSelection(Array.from(next));
      return next;
    });
  };

  const playHaptic = (option: HapticOption) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(option.vibration);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ToolHeader
        icon={Vibrate}
        iconClassName="text-orange-500"
        title={selectedHaptics.size > 0 ? `${selectedHaptics.size} selected` : 'Select haptics'}
      />

      <div className="min-h-0 flex-1 overflow-auto p-2">
        <div className="space-y-1">
          {HAPTIC_OPTIONS.map((option) => {
            const isSelected = selectedHaptics.has(option.id);

            return (
              <div
                key={option.id}
                className={cn(
                  'flex items-center justify-between rounded-xl p-3 transition-all duration-200',
                  isSelected ? 'border border-orange-500/40 bg-orange-500/20' : 'hover:bg-muted/50',
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleHaptic(option.id)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <div
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all',
                      isSelected ? 'border-orange-500 bg-orange-500' : 'border-muted-foreground/30',
                    )}
                  >
                    {isSelected ? <Check className="h-3 w-3 text-white" /> : null}
                  </div>
                  <div className="flex flex-col">
                    <span className={cn('text-sm font-semibold', isSelected ? 'text-orange-400' : 'text-foreground')}>
                      {option.label}
                    </span>
                    <span className="text-xs capitalize text-muted-foreground">{option.kind}</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => playHaptic(option)}
                  className="rounded-full bg-muted/50 p-2.5 transition-colors hover:bg-muted"
                >
                  <Play className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t p-3">
        <Button
          onClick={() =>
            onRequestPrompt(
              `Add these haptics to the app: ${Array.from(selectedHaptics).join(', ')}. Use native-feeling feedback and map each one to the right interaction.`,
            )
          }
          disabled={selectedHaptics.size === 0}
          className={cn(
            'w-full text-white transition-all',
            selectedHaptics.size > 0 ? 'bg-orange-600 hover:bg-orange-700' : 'bg-muted text-muted-foreground',
          )}
          size="sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add to prompt
        </Button>
      </div>
    </div>
  );
}

function ApiModelsTool({
  initialCategory,
  initialSelection,
  onPersistSelection,
  onRequestPrompt,
}: {
  initialCategory: ApiCategory;
  initialSelection: string[];
  onPersistSelection: (state: { selectedCategory: ApiCategory; selectedModels: string[] }) => Promise<void>;
  onRequestPrompt: (prompt: string) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<ApiCategory>(initialCategory);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set(initialSelection));

  useEffect(() => {
    setSelectedCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    setSelectedModels(new Set(initialSelection));
  }, [initialSelection]);

  const filteredModels = useMemo(
    () => API_MODELS.filter((model) => model.category === selectedCategory),
    [selectedCategory],
  );

  const toggleModel = (modelId: string) => {
    setSelectedModels((current) => {
      const next = new Set(current);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      void onPersistSelection({
        selectedCategory,
        selectedModels: Array.from(next),
      });
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background/50 p-2">
        <div className="grid grid-cols-5 gap-1 rounded-lg bg-muted/30 p-1">
          {Object.entries(API_CATEGORY_LABELS).map(([id, label]) => {
            const isActive = selectedCategory === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  const nextCategory = id as ApiCategory;
                  setSelectedCategory(nextCategory);
                  void onPersistSelection({
                    selectedCategory: nextCategory,
                    selectedModels: Array.from(selectedModels),
                  });
                }}
                className={cn(
                  'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                  isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <ToolHeader
        icon={Sparkles}
        iconClassName="text-pink-500"
        title={selectedModels.size > 0 ? `${selectedModels.size} selected` : 'Select API models'}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-2">
          {filteredModels.map((model) => {
            const isSelected = selectedModels.has(model.id);

            return (
              <button
                type="button"
                key={model.id}
                onClick={() => toggleModel(model.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors',
                  isSelected ? 'border-pink-500/40 bg-pink-500/10' : 'border-border/50 hover:bg-muted/50',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={cn(
                      'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2',
                      isSelected ? 'border-pink-500 bg-pink-500' : 'border-muted-foreground/30',
                    )}
                  >
                    {isSelected ? <Check className="h-3 w-3 text-white" /> : null}
                  </div>
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/90 shadow">
                    <Cpu className="h-5 w-5 text-black" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-semibold', isSelected ? 'text-pink-400' : 'text-foreground')}>
                        {model.label}
                      </span>
                      <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {model.provider}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{model.id}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t p-3">
        <Button
          onClick={() => {
            const models = API_MODELS.filter((model) => selectedModels.has(model.id));
            onRequestPrompt(
              `Use these API models in the project where appropriate: ${models
                .map((model) => `${model.label} (${model.provider})`)
                .join(', ')}. Add any required environment variables and runtime wiring.`,
            );
          }}
          disabled={selectedModels.size === 0}
          className={cn(
            'w-full text-white',
            selectedModels.size > 0 ? 'bg-pink-600 hover:bg-pink-700' : 'bg-muted text-muted-foreground',
          )}
          size="sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add to prompt
        </Button>
      </div>
    </div>
  );
}

function ImageStudioTool({
  generatedItems,
  workspaceItems,
  onDeleteAsset,
  onGenerate,
  onOpenFile,
  onRequestPrompt,
  onUpload,
}: {
  generatedItems: ProjectAssetRecord[];
  workspaceItems: MediaItem[];
  onDeleteAsset: (assetId: string) => Promise<void>;
  onGenerate: (payload: { prompt: string }) => Promise<void>;
  onOpenFile: (path: string) => void;
  onRequestPrompt: (prompt: string) => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState('');
  const [referenceIds, setReferenceIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const images = useMemo(
    () => [
      ...generatedItems.map((asset) => ({
        id: asset.id,
        name: asset.name,
        prompt: asset.prompt ?? undefined,
        kind: (asset.sourceType === 'uploaded' ? 'uploaded' : 'generated') as 'uploaded' | 'generated',
        path: asset.storageUrl ?? undefined,
        storageUrl: asset.storageUrl,
        status: asset.status,
      })),
      ...workspaceItems.map((item) => ({ ...item, storageUrl: undefined, status: 'completed' as const })),
    ],
    [generatedItems, workspaceItems],
  );
  const selectedImage = images.find((image) => image.id === selectedImageId) ?? null;

  useEffect(() => {
    if (!selectedImageId && images[0]) {
      setSelectedImageId(images[0].id);
    }
  }, [images, selectedImageId]);

  const handleUpload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      await onUpload(file);
    }
  };

  const handleGenerate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = imagePrompt.trim();
    if (!prompt) return;

    const referenceText =
      referenceIds.size > 0
        ? ` Use these reference assets too: ${images
            .filter((image) => referenceIds.has(image.id))
            .map((image) => `@${image.name}`)
            .join(', ')}.`
        : '';

    await onGenerate({ prompt });
    onRequestPrompt(`Generate or source image assets for this mobile app: ${prompt}.${referenceText}`);
    setImagePrompt('');
  };

  const toggleReference = (imageId: string) => {
    setReferenceIds((current) => {
      const next = new Set(current);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (!selectedImage) return;
    setReferenceIds((current) => {
      const next = new Set(current);
      next.delete(selectedImage.id);
      return next;
    });
    if (selectedImage.kind === 'generated' || selectedImage.kind === 'uploaded') {
      void onDeleteAsset(selectedImage.id);
    }
    setSelectedImageId(null);
  };

  return (
    <div className="flex h-full flex-col">
      <ToolHeader
        icon={Sparkles}
        iconClassName="text-pink-400"
        title={`${images.filter((image) => image.kind !== 'generated' || image.prompt).length} images`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => handleUpload(event.target.files)}
        />
        <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
        </Button>
      </ToolHeader>

      <div className="min-h-0 flex-1 overflow-auto bg-black/10 p-3">
        {images.length === 0 ? (
          <ToolEmptyState
            icon={ImageIcon}
            title="No images yet"
            description="Generate or upload images to get started."
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {images.map((image) => {
              const isSelected = selectedImageId === image.id;
              const isReference = referenceIds.has(image.id);

              return (
                <div
                  key={image.id}
                  className={cn(
                    'group relative aspect-square cursor-pointer overflow-hidden rounded-lg border transition-all',
                    isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border/30 hover:border-primary/50',
                    isReference && 'border-orange-500 ring-2 ring-orange-500/40',
                  )}
                  onClick={() => setSelectedImageId(image.id)}
                >
                  <div
                    className={cn(
                      'flex h-full w-full items-center justify-center p-3 text-center',
                      image.kind === 'generated'
                        ? 'bg-gradient-to-br from-pink-500/15 via-purple-500/15 to-fuchsia-500/15'
                        : image.kind === 'uploaded'
                          ? 'bg-gradient-to-br from-sky-500/15 via-blue-500/15 to-cyan-500/15'
                          : 'bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)] bg-[length:20px_20px]',
                    )}
                  >
                    {image.storageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image.storageUrl} alt={image.name} className="h-full w-full object-cover" />
                    ) : (
                      <div>
                        {image.status === 'running' ? (
                          <Loader2 className="mx-auto h-8 w-8 animate-spin text-white/40" />
                        ) : (
                          <ImageIcon className="mx-auto h-8 w-8 text-white/40" />
                        )}
                        <p className="mt-2 text-xs text-white/75">@{image.name}</p>
                        {image.prompt ? (
                          <p className="mt-1 line-clamp-3 text-[11px] text-white/45">{image.prompt}</p>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleReference(image.id);
                    }}
                    className={cn(
                      'absolute right-2 top-2 rounded-full p-1.5 transition-all',
                      isReference
                        ? 'bg-orange-500 text-white'
                        : 'bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80',
                    )}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedImage ? (
        <div className="border-t bg-background/50 px-3 py-2">
          <div className="flex gap-2">
            <Button
              onClick={() => selectedImage.path && onOpenFile(selectedImage.path)}
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={!selectedImage.path}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Open
            </Button>
            <Button
              onClick={() =>
                onRequestPrompt(
                  `Use image asset @${selectedImage.name} as a reference while improving the next mobile screen and keep the app's visual language consistent.`,
                )
              }
              size="sm"
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Use in Chat
            </Button>
            <Button
              onClick={handleDeleteSelected}
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="border-t px-3 py-3">
        <form onSubmit={handleGenerate}>
          <div className="relative">
            <div className="pointer-events-none absolute inset-0 rounded-lg border border-border/50 bg-muted/20" />
            <textarea
              value={imagePrompt}
              onChange={(event) => setImagePrompt(event.target.value)}
              placeholder="Describe the image to generate..."
              className="relative h-20 w-full resize-none rounded-lg border-0 bg-transparent p-3 pr-12 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
            <Button
              type="submit"
              disabled={!imagePrompt.trim()}
              size="sm"
              className="absolute bottom-2 right-2 h-8 w-8 bg-gradient-to-r from-pink-600 to-purple-600 p-0 hover:from-pink-700 hover:to-purple-700"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
          {referenceIds.size > 0 ? (
            <p className="mt-2 text-xs text-orange-500">
              {referenceIds.size} reference image{referenceIds.size > 1 ? 's' : ''} selected for editing
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

function AudioStudioTool({
  generatedItems,
  workspaceItems,
  onDeleteAsset,
  onGenerate,
  onOpenFile,
  onRequestPrompt,
}: {
  generatedItems: ProjectAssetRecord[];
  workspaceItems: MediaItem[];
  onDeleteAsset: (assetId: string) => Promise<void>;
  onGenerate: (payload: { prompt: string; durationSeconds?: number }) => Promise<void>;
  onOpenFile: (path: string) => void;
  onRequestPrompt: (prompt: string) => void;
}) {
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [audioPrompt, setAudioPrompt] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const items = useMemo(
    () => [
      ...generatedItems.map((asset) => ({
        id: asset.id,
        name: asset.name,
        prompt: asset.prompt ?? undefined,
        kind: (asset.sourceType === 'uploaded' ? 'uploaded' : 'generated') as 'uploaded' | 'generated',
        path: asset.storageUrl ?? undefined,
      })),
      ...workspaceItems,
    ],
    [generatedItems, workspaceItems],
  );
  const selectedAudio = items.find((item) => item.id === selectedAudioId) ?? null;

  useEffect(() => {
    if (!selectedAudioId && items[0]) setSelectedAudioId(items[0].id);
  }, [items, selectedAudioId]);

  const handleGenerate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = audioPrompt.trim();
    if (!prompt) return;
    await onGenerate({ prompt });
    onRequestPrompt(
      `Create or source audio for this mobile app: ${prompt}. Include how it should be triggered in the product.`,
    );
    setAudioPrompt('');
  };

  const handleDeleteSelected = () => {
    if (!selectedAudio) return;
    if (selectedAudio.kind === 'generated' || selectedAudio.kind === 'uploaded') {
      void onDeleteAsset(selectedAudio.id);
    }
    if (playingId === selectedAudio.id) setPlayingId(null);
    setSelectedAudioId(null);
  };

  return (
    <div className="flex h-full flex-col">
      <ToolHeader icon={Music4} iconClassName="text-purple-400" title={`${items.length} sound effects`} />

      <div className="min-h-0 flex-1 overflow-auto bg-black/10 p-3">
        {items.length === 0 ? (
          <ToolEmptyState
            icon={Music4}
            title="No sound effects yet"
            description="Generate sound effects from text descriptions."
          />
        ) : (
          <div className="space-y-2">
            {items.map((audio) => (
              <div
                key={audio.id}
                className={cn(
                  'group cursor-pointer rounded-lg border bg-background p-3 transition-all',
                  selectedAudioId === audio.id
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border/30 hover:border-primary/50',
                )}
                onClick={() => setSelectedAudioId(audio.id)}
              >
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-8 w-8"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPlayingId((current) => (current === audio.id ? null : audio.id));
                    }}
                  >
                    {playingId === audio.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">@{audio.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {audio.prompt || audio.path || 'Workspace audio asset'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedAudio ? (
        <div className="border-t bg-background/50 px-3 py-2">
          <div className="flex gap-2">
            <Button
              onClick={() => selectedAudio.path && onOpenFile(selectedAudio.path)}
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={!selectedAudio.path}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Open
            </Button>
            <Button
              onClick={() =>
                onRequestPrompt(
                  `Use audio cue @${selectedAudio.name} in this mobile app and wire it to the right user interactions or feedback moments.`,
                )
              }
              size="sm"
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Use in Chat
            </Button>
            <Button
              onClick={handleDeleteSelected}
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="border-t px-3 py-3">
        <form onSubmit={handleGenerate}>
          <div className="relative">
            <textarea
              value={audioPrompt}
              onChange={(event) => setAudioPrompt(event.target.value)}
              placeholder="Describe the sound effect (e.g. dog barking, birds chirping, ocean waves)..."
              className="h-20 w-full resize-none rounded-lg border border-border/50 bg-muted/20 p-3 pr-12 text-sm outline-none focus:border-primary/50"
            />
            <Button
              type="submit"
              disabled={!audioPrompt.trim()}
              size="sm"
              className="absolute bottom-2 right-2 h-8 w-8 bg-gradient-to-r from-purple-600 to-pink-600 p-0 hover:from-purple-700 hover:to-pink-700"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VideoStudioTool({
  generatedItems,
  workspaceItems,
  onDeleteAsset,
  onGenerate,
  onOpenFile,
  onRequestPrompt,
}: {
  generatedItems: ProjectAssetRecord[];
  workspaceItems: MediaItem[];
  onDeleteAsset: (assetId: string) => Promise<void>;
  onGenerate: (payload: { prompt: string; size?: string }) => Promise<void>;
  onOpenFile: (path: string) => void;
  onRequestPrompt: (prompt: string) => void;
}) {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const items = useMemo(
    () => [
      ...generatedItems.map((asset) => ({
        id: asset.id,
        name: asset.name,
        prompt: asset.prompt ?? undefined,
        kind: (asset.sourceType === 'uploaded' ? 'uploaded' : 'generated') as 'uploaded' | 'generated',
        path: asset.storageUrl ?? undefined,
      })),
      ...workspaceItems,
    ],
    [generatedItems, workspaceItems],
  );
  const selectedVideo = items.find((item) => item.id === selectedVideoId) ?? null;

  useEffect(() => {
    if (!selectedVideoId && items[0]) setSelectedVideoId(items[0].id);
  }, [items, selectedVideoId]);

  const handleGenerate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = videoPrompt.trim();
    if (!prompt) return;
    await onGenerate({ prompt });
    onRequestPrompt(
      `Generate or storyboard a mobile app video for this project: ${prompt}. Keep it product-focused and build-ready.`,
    );
    setVideoPrompt('');
  };

  const handleDeleteSelected = () => {
    if (!selectedVideo) return;
    if (selectedVideo.kind === 'generated' || selectedVideo.kind === 'uploaded') {
      void onDeleteAsset(selectedVideo.id);
    }
    if (playingId === selectedVideo.id) setPlayingId(null);
    setSelectedVideoId(null);
  };

  return (
    <div className="flex h-full flex-col">
      <ToolHeader icon={Video} iconClassName="text-blue-400" title={`${items.length} videos`} />

      <div className="min-h-0 flex-1 overflow-auto bg-black/10 p-3">
        {items.length === 0 ? (
          <ToolEmptyState icon={Video} title="No videos yet" description="Generate videos from text prompts." />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {items.map((video) => (
              <div
                key={video.id}
                className={cn(
                  'group relative aspect-video cursor-pointer overflow-hidden rounded-lg border transition-all',
                  selectedVideoId === video.id
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border/30 hover:border-primary/50',
                )}
                onClick={() => setSelectedVideoId(video.id)}
              >
                <div
                  className={cn(
                    'flex h-full w-full items-center justify-center p-3 text-center',
                    video.kind === 'generated'
                      ? 'bg-gradient-to-br from-blue-500/15 via-cyan-500/15 to-purple-500/15'
                      : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
                  )}
                >
                  <div>
                    {video.kind === 'generated' ? (
                      <Loader2 className="mx-auto h-6 w-6 text-muted-foreground animate-spin" />
                    ) : (
                      <Video className="mx-auto h-6 w-6 text-white/40" />
                    )}
                    <p className="mt-2 text-xs text-white/90">@{video.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPlayingId((current) => (current === video.id ? null : video.id));
                  }}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-black/80"
                >
                  {playingId === video.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedVideo ? (
        <div className="border-t bg-background/50 px-3 py-2">
          <div className="flex gap-2">
            <Button
              onClick={() => selectedVideo.path && onOpenFile(selectedVideo.path)}
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={!selectedVideo.path}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Open
            </Button>
            <Button
              onClick={() =>
                onRequestPrompt(
                  `Use video asset @${selectedVideo.name} as inspiration for the app's motion, preview, or onboarding flow.`,
                )
              }
              size="sm"
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Use in Chat
            </Button>
            <Button
              onClick={handleDeleteSelected}
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="border-t px-3 py-3">
        <form onSubmit={handleGenerate}>
          <div className="relative">
            <textarea
              value={videoPrompt}
              onChange={(event) => setVideoPrompt(event.target.value)}
              placeholder="Describe the video to generate..."
              className="h-20 w-full resize-none rounded-lg border border-border/50 bg-muted/20 p-3 pr-12 text-sm outline-none focus:border-primary/50"
            />
            <Button
              type="submit"
              disabled={!videoPrompt.trim()}
              size="sm"
              className="absolute bottom-2 right-2 h-8 w-8 bg-gradient-to-r from-blue-600 to-cyan-600 p-0 hover:from-blue-700 hover:to-cyan-700"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AppStealerTool({
  savedState,
  job,
  onRequestPrompt,
  onRunResearch,
}: {
  savedState: Record<string, unknown> | null;
  job: ProjectJobRecord | null;
  onRequestPrompt: (prompt: string) => void;
  onRunResearch: (
    input: string,
    inputType: AppStealerInputType,
  ) => Promise<{
    summary: string;
    systemPrompt: string;
  } | null>;
}) {
  const [input, setInput] = useState('');
  const [inputType, setInputType] = useState<AppStealerInputType>('name');
  const [isLoading, setIsLoading] = useState(false);
  const config = APP_STEALER_INPUT_CONFIG[inputType];
  const ConfigIcon = config.icon;

  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.includes('apps.apple.com') || value.includes('itunes.apple.com')) {
      setInputType('appstore');
      return;
    }
    if (value.includes('play.google.com')) {
      setInputType('playstore');
      return;
    }
    if (value.startsWith('http://') || value.startsWith('https://')) {
      setInputType('website');
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setIsLoading(true);
    try {
      const result = await onRunResearch(trimmed, inputType);
      if (result) {
        onRequestPrompt(`${result.summary}\n\n${result.systemPrompt}`);
      }
      setInput('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <Wand2 className="h-5 w-5 text-rose-400" />
        <span className="text-sm font-medium">App Stealer</span>
        <span className="ml-auto rounded-full bg-rose-500/10 px-2 py-0.5 text-xs text-rose-400">Beta</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Research any app and recreate it with AI. Enter an app name or paste a link to get started.
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Source Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(APP_STEALER_INPUT_CONFIG) as AppStealerInputType[]).map((type) => {
                const item = APP_STEALER_INPUT_CONFIG[type];
                const Icon = item.icon;
                const isActive = inputType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setInputType(type)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all',
                      isActive
                        ? 'border-rose-500/50 bg-rose-500/10 text-rose-400'
                        : 'border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                    )}
                  >
                    <Icon className={cn('h-4 w-4', isActive ? 'text-rose-400' : item.colorClass)} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{config.description}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <ConfigIcon className="h-4 w-4" />
                </span>
                <Input
                  value={input}
                  onChange={(event) => handleInputChange(event.target.value)}
                  placeholder={config.placeholder}
                  className="border-border/50 bg-background/50 pl-10 focus:border-rose-500/50"
                  disabled={isLoading}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="w-full gap-2 bg-gradient-to-r from-rose-500 to-pink-500 font-medium text-white hover:from-rose-600 hover:to-pink-600"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Researching...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Steal App
                </>
              )}
            </Button>
          </form>

          <div className="space-y-3 border-t border-border/50 pt-4">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground">What happens next</h4>
            <div className="space-y-2 text-sm">
              {[
                'AI researches the app description, features, and market positioning.',
                'Key flows and UI patterns are turned into actionable builder context.',
                'The builder starts recreating the best parts directly in your project.',
              ].map((item, index) => (
                <div key={item} className="flex gap-2">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-xs text-rose-400">
                    {index + 1}
                  </div>
                  <p className="text-muted-foreground">{item}</p>
                </div>
              ))}
            </div>
          </div>

          {savedState?.summary ? (
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Latest research</div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{String(savedState.summary)}</p>
              {job ? (
                <div className="mt-3 text-xs text-muted-foreground">
                  Status: <span className="text-foreground">{job.status}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground">Try these examples</h4>
            <div className="flex flex-wrap gap-2">
              {['Duolingo', 'Notion', 'Calm', 'Strava'].map((app) => (
                <button
                  key={app}
                  type="button"
                  onClick={() => {
                    setInput(app);
                    setInputType('name');
                  }}
                  className="rounded-full bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {app}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PublishTool({
  job,
  onRunPublishAction,
  sourceUrl,
  previewUrl,
  projectName,
  onRequestPrompt,
}: {
  job: ProjectJobRecord | null;
  onRunPublishAction: (
    action: 'prepare' | 'build-preview' | 'build-production' | 'submit-app-store',
  ) => Promise<unknown>;
  sourceUrl: string;
  previewUrl: string;
  projectName: string;
  onRequestPrompt: (prompt: string) => void;
}) {
  const hasGitHubConnected = Boolean(sourceUrl);
  const [isCopied, setIsCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCopy = async () => {
    if (!sourceUrl) return;
    await navigator.clipboard.writeText(sourceUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1800);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-xl space-y-4">
          <div className="rounded-xl border border-border/60 bg-background/40 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10">
                <Apple className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <div className="text-lg font-semibold text-foreground">Publish to App Store</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {hasGitHubConnected
                    ? "Launch your app to the App Store using Expo's EAS Submit flow."
                    : 'Connect a Git source first to prepare a clean publish workflow.'}
                </div>
              </div>
            </div>
          </div>

          {hasGitHubConnected ? (
            <>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                  <span className="text-sm font-medium text-emerald-500">Git source connected</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Project: <span className="font-mono text-foreground">{projectName}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Preview: <span className="font-mono text-foreground">{previewUrl || 'waiting for preview'}</span>
                </p>
              </div>

              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <p className="text-sm text-muted-foreground">To publish this app:</p>
                <ol className="ml-4 mt-3 list-decimal space-y-2 text-sm text-muted-foreground">
                  <li>Prepare the EAS configuration from this builder workspace.</li>
                  <li>
                    Open <strong className="text-foreground">launch.expo.dev</strong>.
                  </li>
                  <li>Import this repository or connect the mobile workspace.</li>
                  <li>Configure EAS build and submit metadata.</li>
                  <li>Submit the signed build to App Store Connect.</li>
                </ol>
              </div>

              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <label className="text-xs font-medium text-muted-foreground">Repository URL</label>
                <div className="mt-2 flex gap-2">
                  <Input value={sourceUrl} readOnly className="bg-muted/30 font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                    {isCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {job ? (
                <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="text-sm font-medium text-foreground">Latest EAS job</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {job.title} • {job.status}
                  </div>
                  {job.logs.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-border/50 bg-black/20 p-3 font-mono text-[11px] text-muted-foreground">
                      {job.logs.slice(-8).map((entry) => (
                        <div key={`${entry.at}-${entry.message}`}>{entry.message}</div>
                      ))}
                    </div>
                  ) : null}
                  {job.errorMessage ? <div className="mt-3 text-xs text-red-300">{job.errorMessage}</div> : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-500">Git source required</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Connect a Git repository in the builder first so the App Store handoff has a clean source of truth.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="border-t p-3">
        {actionError ? <div className="mb-2 text-xs text-red-300">{actionError}</div> : null}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={async () => {
              try {
                setActionError(null);
                await onRunPublishAction('prepare');
              } catch (error) {
                setActionError(normalizeError(error));
              }
            }}
          >
            <Settings2 className="mr-2 h-4 w-4" />
            Prepare EAS
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={async () => {
              try {
                setActionError(null);
                await onRunPublishAction('build-preview');
              } catch (error) {
                setActionError(normalizeError(error));
              }
            }}
          >
            <Play className="mr-2 h-4 w-4" />
            Build Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={async () => {
              try {
                setActionError(null);
                await onRunPublishAction('build-production');
              } catch (error) {
                setActionError(normalizeError(error));
              }
            }}
          >
            <Rocket className="mr-2 h-4 w-4" />
            Build Release
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
            onClick={async () => {
              try {
                setActionError(null);
                await onRunPublishAction('submit-app-store');
              } catch (error) {
                setActionError(normalizeError(error));
              }
            }}
          >
            <Apple className="mr-2 h-4 w-4" />
            Submit iOS
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => window.open('https://launch.expo.dev', '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            launch.expo.dev
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
            onClick={() =>
              onRequestPrompt(
                `Audit this mobile app for App Store release readiness, then implement the missing configuration, assets, permissions copy, and release metadata.`,
              )
            }
          >
            <Rocket className="mr-2 h-4 w-4" />
            Use in Chat
          </Button>
        </div>
      </div>
    </div>
  );
}

function PushToGitHubTool({
  projectId,
  projectName,
  sourceUrl,
  job,
  onPush,
}: {
  projectId: string;
  projectName: string;
  sourceUrl: string;
  job: ProjectJobRecord | null;
  onPush: (input: {
    repository: string;
    commitMessage?: string;
    createIfMissing?: boolean;
    branch?: string;
    visibility?: 'private' | 'public';
  }) => Promise<unknown>;
}) {
  const [gitState, setGitState] = useState<GitHubProjectState | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [stateError, setStateError] = useState<string | null>(null);
  const [repoMode, setRepoMode] = useState<'existing' | 'new'>(sourceUrl.includes('github.com/') ? 'existing' : 'new');
  const [repoFilter, setRepoFilter] = useState('');
  const [selectedRepoFullName, setSelectedRepoFullName] = useState('');
  const [newRepoName, setNewRepoName] = useState(() =>
    projectName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, ''),
  );
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [branchMode, setBranchMode] = useState<'main' | 'master' | 'custom'>('main');
  const [customBranch, setCustomBranch] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connectedRepoUrl, setConnectedRepoUrl] = useState<string | null>(sourceUrl || null);
  const [error, setError] = useState<string | null>(null);

  const refreshGitState = async () => {
    setIsLoadingState(true);
    setStateError(null);

    try {
      const response = await fetch(`/api/builder/projects/${projectId}/github`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as ({ error?: string } & GitHubProjectState) | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error || 'Failed to load GitHub workspace state.');
      }

      setGitState(payload);
      if (payload.remoteUrl) {
        setConnectedRepoUrl(payload.remoteUrl);
      }
      if (payload.error) {
        setStateError(payload.error);
      }
    } catch (stateLoadError) {
      setStateError(normalizeError(stateLoadError));
    } finally {
      setIsLoadingState(false);
    }
  };

  useEffect(() => {
    void refreshGitState();
  }, [projectId]);

  useEffect(() => {
    if (!gitState) return;

    if (gitState.selectedRepoFullName) {
      setSelectedRepoFullName(gitState.selectedRepoFullName);
      setRepoMode('existing');
    }

    const nextBranch = gitState.selectedBranch?.trim() || 'main';
    if (nextBranch === 'main' || nextBranch === 'master') {
      setBranchMode(nextBranch);
      setCustomBranch('');
    } else {
      setBranchMode('custom');
      setCustomBranch(nextBranch);
    }
  }, [gitState]);

  const filteredRepos = useMemo(() => {
    const query = repoFilter.trim().toLowerCase();
    if (!query) return gitState?.repos ?? [];
    return (gitState?.repos ?? []).filter(
      (repo) => repo.fullName.toLowerCase().includes(query) || repo.name.toLowerCase().includes(query),
    );
  }, [gitState?.repos, repoFilter]);

  const resolvedBranch = branchMode === 'custom' ? customBranch.trim() : branchMode;
  const normalizedNewRepoName = newRepoName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const resolvedRepository =
    repoMode === 'new'
      ? gitState?.account?.login && normalizedNewRepoName
        ? `${gitState.account.login}/${normalizedNewRepoName}`
        : ''
      : selectedRepoFullName.trim();

  const handleSelectRepo = async (repo: GitHubProjectState['repos'][number]) => {
    setSelectedRepoFullName(repo.fullName);
    setVisibility(repo.private ? 'private' : 'public');

    try {
      await fetch('/api/builder/github/select', {
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
    } catch {
      // Non-blocking helper persistence.
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ToolHeader icon={Github} iconClassName="text-white" title="Push workspace to GitHub" />

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {stateError ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {stateError}
            </div>
          ) : null}

          {isLoadingState ? (
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading GitHub connection...
            </div>
          ) : null}

          {!isLoadingState && !gitState?.connected ? (
            <div className="rounded-xl border border-border/60 bg-background/40 p-5">
              <div className="text-sm font-medium text-foreground">Connect GitHub</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Connect your GitHub account, come back to this same builder project, and then choose an existing
                repository or create a new one before syncing.
              </p>
              <Button
                className="mt-4 bg-white text-black hover:bg-white/90"
                onClick={() =>
                  void signIn.social({
                    provider: 'github',
                    callbackURL:
                      typeof window !== 'undefined' ? window.location.href : `/builder/projects/${projectId}`,
                  })
                }
              >
                <Github className="mr-2 h-4 w-4" />
                Connect GitHub
              </Button>
            </div>
          ) : null}

          {gitState?.connected ? (
            <>
              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {gitState.account?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={gitState.account.avatarUrl}
                        alt={gitState.account.login}
                        className="h-11 w-11 rounded-full border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-medium text-white/80">
                        {gitState.account?.login?.slice(0, 1).toUpperCase() || 'G'}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {gitState.account?.name || gitState.account?.login}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">@{gitState.account?.login}</div>
                      {connectedRepoUrl ? (
                        <a
                          href={connectedRepoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {connectedRepoUrl}
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="h-8" onClick={() => void refreshGitState()}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Refresh
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRepoMode('existing')}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs transition',
                      repoMode === 'existing'
                        ? 'border-white/20 bg-white/10 text-white'
                        : 'border-border/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Use existing repo
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepoMode('new')}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs transition',
                      repoMode === 'new'
                        ? 'border-white/20 bg-white/10 text-white'
                        : 'border-border/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Create new repo
                  </button>
                </div>

                {repoMode === 'existing' ? (
                  <div className="space-y-3">
                    <Input
                      value={repoFilter}
                      onChange={(event) => setRepoFilter(event.target.value)}
                      placeholder="Search your repositories"
                      className="bg-muted/30 text-xs"
                    />
                    <div className="max-h-56 overflow-y-auto rounded-lg border border-border/50 bg-black/10 p-2">
                      {filteredRepos.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground">
                          No repositories matched that search.
                        </div>
                      ) : (
                        filteredRepos.map((repo) => {
                          const isActive = selectedRepoFullName === repo.fullName;

                          return (
                            <button
                              key={repo.id}
                              type="button"
                              onClick={() => void handleSelectRepo(repo)}
                              className={cn(
                                'mb-2 flex w-full items-start justify-between rounded-lg border px-3 py-2 text-left text-xs transition last:mb-0',
                                isActive
                                  ? 'border-white/20 bg-white/10 text-white'
                                  : 'border-border/50 bg-background/40 text-muted-foreground hover:text-foreground',
                              )}
                            >
                              <div className="min-w-0">
                                <div className="truncate font-medium">{repo.fullName}</div>
                                <div className="mt-1 text-[11px] text-white/45">
                                  Default branch: {repo.defaultBranch}
                                </div>
                              </div>
                              <span className="ml-3 shrink-0 text-[11px] text-white/45">
                                {repo.private ? 'Private' : 'Public'}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1.5 block text-xs text-muted-foreground">New repository name</label>
                      <Input
                        value={newRepoName}
                        onChange={(event) => setNewRepoName(event.target.value)}
                        placeholder="my-builder-project"
                        className="bg-muted/30 text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setVisibility('private')}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs transition',
                          visibility === 'private'
                            ? 'border-white/20 bg-white/10 text-white'
                            : 'border-border/60 text-muted-foreground',
                        )}
                      >
                        Private
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisibility('public')}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs transition',
                          visibility === 'public'
                            ? 'border-white/20 bg-white/10 text-white'
                            : 'border-border/60 text-muted-foreground',
                        )}
                      >
                        Public
                      </button>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-black/10 px-3 py-2 text-xs text-muted-foreground">
                      Repository will be created as{' '}
                      <span className="font-mono text-foreground">
                        {resolvedRepository || `${gitState.account?.login || 'account'}/repo-name`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="text-sm font-medium text-foreground">Branch and commit</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['main', 'master', 'custom'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setBranchMode(option)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs capitalize transition',
                        branchMode === option
                          ? 'border-white/20 bg-white/10 text-white'
                          : 'border-border/60 text-muted-foreground',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {branchMode === 'custom' ? (
                  <Input
                    value={customBranch}
                    onChange={(event) => setCustomBranch(event.target.value)}
                    placeholder="release/mobile-v1"
                    className="mt-3 bg-muted/30 text-xs"
                  />
                ) : null}
                <Input
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  placeholder={`Update ${projectName}`}
                  className="mt-3 bg-muted/30 text-xs"
                />
              </div>

              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">Files to commit</div>
                  <div className="text-xs text-muted-foreground">
                    {gitState.changes.length} file{gitState.changes.length === 1 ? '' : 's'}
                  </div>
                </div>
                {gitState.changes.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-dashed border-border/60 px-3 py-4 text-xs text-muted-foreground">
                    No local file changes detected. You can still sync this project with an empty commit if needed.
                  </div>
                ) : (
                  <div className="mt-3 max-h-60 overflow-y-auto rounded-lg border border-border/50 bg-black/10 p-2">
                    {gitState.changes.map((change) => (
                      <div
                        key={`${change.status}-${change.path}`}
                        className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs last:mb-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-mono text-foreground">{change.path}</div>
                          {change.originalPath ? (
                            <div className="mt-1 truncate text-[11px] text-white/40">from {change.originalPath}</div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/65">
                            {change.status}
                          </div>
                          <div className="mt-1 text-[10px] text-white/40">
                            {change.staged ? 'staged' : 'working'}
                            {change.unstaged ? ' + unstaged' : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}

          {job ? (
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-sm font-medium text-foreground">Latest push job</div>
              <div className="mt-2 text-xs text-muted-foreground">
                {job.title} • {job.status}
              </div>
              {job.logs.length > 0 ? (
                <div className="mt-3 rounded-lg border border-border/50 bg-black/20 p-3 font-mono text-[11px] text-muted-foreground">
                  {job.logs.slice(-8).map((entry) => (
                    <div key={`${entry.at}-${entry.message}`}>{entry.message}</div>
                  ))}
                </div>
              ) : null}
              {job.errorMessage ? <div className="mt-3 text-xs text-red-300">{job.errorMessage}</div> : null}
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="border-t p-3">
        {error ? <div className="mb-2 text-xs text-red-300">{error}</div> : null}
        <Button
          className="w-full bg-white text-black hover:bg-white/90"
          onClick={async () => {
            try {
              if (!gitState?.connected) {
                throw new Error('Connect GitHub first.');
              }
              if (!resolvedRepository) {
                throw new Error('Choose a repository before syncing.');
              }
              if (!resolvedBranch) {
                throw new Error('Choose a branch before syncing.');
              }

              setError(null);
              setIsSubmitting(true);
              const result = (await onPush({
                repository: resolvedRepository,
                commitMessage: commitMessage.trim() || undefined,
                createIfMissing: repoMode === 'new',
                branch: resolvedBranch,
                visibility,
              })) as { repoUrl?: string } | undefined;

              if (result?.repoUrl) {
                setConnectedRepoUrl(result.repoUrl);
              }

              await refreshGitState();
            } catch (pushError) {
              setError(normalizeError(pushError));
            } finally {
              setIsSubmitting(false);
            }
          }}
          disabled={!gitState?.connected || !resolvedRepository || !resolvedBranch || isSubmitting}
        >
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Github className="mr-2 h-4 w-4" />}
          {repoMode === 'new' ? 'Create, commit, and sync' : 'Commit and sync'}
        </Button>
        {gitState?.connected ? (
          <div className="mt-2 text-center text-[11px] text-muted-foreground">
            {resolvedRepository || 'Select a repository'} • {resolvedBranch || 'Choose a branch'}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RestartDevServerTool({
  preferredCommand,
  activeTerminal,
  onRunCommand,
  onRequestPrompt,
}: {
  preferredCommand: string;
  activeTerminal: TerminalSnapshot | null;
  onRunCommand: (command: string) => void;
  onRequestPrompt: (prompt: string) => void;
}) {
  const terminalTail = (activeTerminal?.output ?? '').split('\n').filter(Boolean).slice(-10);

  return (
    <div className="flex h-full flex-col">
      <ToolHeader
        icon={RotateCw}
        iconClassName="text-cyan-300"
        title={activeTerminal?.isRunning ? 'Command running' : 'Restart dev server'}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <div className="rounded-xl border border-border/60 bg-background/40 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10">
                <RotateCw className="h-5 w-5 text-cyan-300" />
              </div>
              <div>
                <div className="text-base font-semibold text-foreground">Recommended command</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use the command that best matches the current mobile workspace and preview runtime.
                </p>
                <pre className="mt-4 overflow-x-auto rounded-lg border border-border/50 bg-black/20 p-3 text-[12px] text-muted-foreground">
                  {preferredCommand}
                </pre>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <div className="text-sm font-medium text-foreground">Quick runners</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {['npx expo start --tunnel --clear', 'npx expo start --clear', 'npm run dev', 'pnpm dev'].map(
                (command) => (
                  <Button key={command} variant="outline" size="sm" onClick={() => onRunCommand(command)}>
                    {command}
                  </Button>
                ),
              )}
            </div>
          </div>

          {terminalTail.length > 0 ? (
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-sm font-medium text-foreground">Recent terminal output</div>
              <div className="mt-3 rounded-lg border border-border/50 bg-black/20 p-3 font-mono text-[12px] leading-6 text-muted-foreground">
                {terminalTail.map((line, index) => (
                  <div key={`${line}-${index}`}>{line}</div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="border-t p-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-cyan-600 text-white hover:bg-cyan-700"
            onClick={() => onRunCommand(preferredCommand)}
          >
            <RotateCw className="mr-2 h-4 w-4" />
            Run recommended
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() =>
              onRequestPrompt(
                `Diagnose why the mobile dev server needs a restart, fix the underlying issue, and rerun the correct preview command.`,
              )
            }
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Ask AI
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  connected,
  accentClass,
  connectClass,
  health,
  credentials,
  activeConfig,
  onToggleConnect,
  onCredentialChange,
  onAddPrompt,
  onCheckHealth,
  onOpenDocs,
  onToggleConfig,
}: {
  provider: ProviderConfig;
  connected: boolean;
  accentClass: string;
  connectClass: string;
  health?: { healthy: boolean; message: string };
  credentials: Record<string, string>;
  activeConfig: boolean;
  onToggleConnect: () => void;
  onCredentialChange: (key: string, value: string) => void;
  onAddPrompt: () => void;
  onCheckHealth: () => void;
  onOpenDocs: () => void;
  onToggleConfig?: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-colors',
        connected ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border/60 bg-muted/10',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{provider.label}</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide',
                connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-muted-foreground',
              )}
            >
              {connected ? 'Connected' : 'Available'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Web {provider.supportsWeb ? 'supported' : 'disabled'} • Mobile{' '}
            {provider.supportsMobile ? 'supported' : 'disabled'}
          </p>
          <p className="text-xs text-muted-foreground">{provider.description}</p>
        </div>

        {connected ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
        ) : (
          <PlugZap className={cn('mt-0.5 h-4 w-4', accentClass)} />
        )}
      </div>

      <div className="mt-3 space-y-2">
        {provider.fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-xs text-muted-foreground">{field.label}</label>
            <Input
              type={field.secret ? 'password' : 'text'}
              value={credentials[field.key] ?? ''}
              onChange={(event) => onCredentialChange(field.key, event.target.value)}
              placeholder={field.placeholder}
            />
          </div>
        ))}
        {health ? (
          <p className={cn('text-xs', health.healthy ? 'text-emerald-400' : 'text-amber-400')}>{health.message}</p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" className={connectClass} onClick={onToggleConnect}>
          {connected ? 'Disconnect' : 'Connect'}
        </Button>
        <Button size="sm" variant="outline" onClick={onAddPrompt}>
          Add setup prompt
        </Button>
        <Button size="sm" variant="outline" onClick={onCheckHealth}>
          <Activity className="mr-2 h-3.5 w-3.5" />
          Check health
        </Button>
        <Button size="sm" variant="outline" onClick={onOpenDocs}>
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          Open dashboard
        </Button>
        {onToggleConfig ? (
          <Button size="sm" variant="ghost" onClick={onToggleConfig}>
            <Lock className="mr-2 h-3.5 w-3.5" />
            {activeConfig ? 'Hide config' : 'Show config'}
          </Button>
        ) : null}
      </div>

      {activeConfig ? (
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border/50 bg-black/20 p-3 text-[11px] text-muted-foreground">
          {JSON.stringify(credentials, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function InlineFileGroup({
  label,
  paths,
  onOpenFile,
}: {
  label?: string;
  paths: string[];
  onOpenFile: (path: string) => void;
}) {
  return (
    <div>
      {label ? <div className="mb-2 text-xs text-muted-foreground">{label}</div> : null}
      <div className="flex flex-wrap gap-2">
        {paths.map((path) => (
          <Button key={path} variant="outline" size="sm" onClick={() => onOpenFile(path)}>
            {path}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ToolHeader({
  icon: Icon,
  iconClassName,
  title,
  meta,
  children,
}: {
  icon: LucideIcon;
  iconClassName: string;
  title: string;
  meta?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b bg-background/50 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', iconClassName)} />
          <span className="text-xs text-muted-foreground">{title}</span>
        </div>
        {children ? <div className="flex items-center gap-2">{children}</div> : null}
      </div>
      {meta ? <div className="mt-1 text-[11px] text-muted-foreground/80">{meta}</div> : null}
    </div>
  );
}

function ToolEmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <Icon className="mb-3 h-12 w-12 text-muted-foreground/30" strokeWidth={1.5} />
      <p className="mb-1 text-sm text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/60">{description}</p>
    </div>
  );
}

function LogLine({ line, index }: { line: string; index: number }) {
  const lower = line.toLowerCase();
  let icon: React.ReactNode = null;
  let colorClass = 'text-muted-foreground';

  if (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) {
    icon = <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-destructive" />;
    colorClass = 'text-destructive';
  } else if (lower.includes('warn')) {
    icon = <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-yellow-500" />;
    colorClass = 'text-yellow-500';
  } else if (
    lower.includes('success') ||
    lower.includes('done') ||
    lower.includes('started') ||
    lower.includes('running')
  ) {
    icon = <CheckCircle2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-green-500" />;
    colorClass = 'text-green-500';
  } else if (lower.includes('workspace') || lower.includes('preview') || lower.includes('process')) {
    icon = <Info className="mt-0.5 h-3 w-3 flex-shrink-0 text-blue-400" />;
    colorClass = 'text-blue-400';
  }

  return (
    <div className="flex items-start gap-2 py-0.5 font-mono text-xs">
      <span className="w-8 flex-shrink-0 text-right text-muted-foreground/50">
        {String(index + 1).padStart(3, '0')}
      </span>
      {icon}
      <span className={cn('break-all', colorClass)}>{line}</span>
    </div>
  );
}
