'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileSystemTree, WebContainer } from '@webcontainer/api';

type WorkspaceSnapshotFile = {
  path: string;
  content: string;
};

type WebContainerPreviewProps = {
  projectId: string;
  previewPath: string;
  previewRefreshKey: number;
  fallbackSource?: string | null;
  isFullscreen?: boolean;
  onPreviewUrlChange?: (value: string) => void;
};

type StartPlan = {
  install: [string, string[]] | null;
  start: [string, string[]] | null;
};

type WebContainerModule = typeof import('@webcontainer/api');
type WebContainerProcess = Awaited<ReturnType<WebContainer['spawn']>>;

declare global {
  interface Window {
    _indexblueWebContainerInstance?: WebContainer;
    _indexblueWebContainerBootPromise?: Promise<WebContainer>;
  }
}

let webContainerInstance: WebContainer | null = null;
let activeDevServerProcess: WebContainerProcess | null = null;

function buildFileTree(files: WorkspaceSnapshotFile[]): FileSystemTree {
  const root: FileSystemTree = {};

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    let cursor = root;
    for (const [index, part] of parts.entries()) {
      const isLeaf = index === parts.length - 1;
      if (isLeaf) {
        cursor[part] = {
          file: {
            contents: file.content,
          },
        };
        continue;
      }

      const existing = cursor[part];
      if (!existing || !('directory' in existing)) {
        cursor[part] = {
          directory: {},
        };
      }

      const directoryNode = cursor[part];
      if (!directoryNode || !('directory' in directoryNode)) {
        continue;
      }

      cursor = directoryNode.directory;
    }
  }

  return root;
}

function detectStartPlan(files: WorkspaceSnapshotFile[]): StartPlan {
  const packageJson = files.find((file) => file.path === 'package.json');
  if (!packageJson) {
    return files.some((file) => file.path === 'index.html')
      ? {
          install: null,
          start: ['npx', ['serve', '.', '-l', '3000']],
        }
      : { install: null, start: null };
  }

  try {
    const parsed = JSON.parse(packageJson.content) as {
      scripts?: Record<string, string>;
    };

    if (parsed.scripts?.dev) {
      return {
        install: ['npm', ['install']],
        start: ['npm', ['run', 'dev']],
      };
    }

    if (parsed.scripts?.start) {
      return {
        install: ['npm', ['install']],
        start: ['npm', ['run', 'start']],
      };
    }
  } catch {
    return { install: null, start: null };
  }

  return { install: null, start: null };
}

async function getWebContainer() {
  if (typeof window === 'undefined') {
    throw new Error('WebContainer is only available in the browser.');
  }

  if (webContainerInstance) return webContainerInstance;
  if (window._indexblueWebContainerInstance) {
    webContainerInstance = window._indexblueWebContainerInstance;
    return webContainerInstance;
  }

  if (!window._indexblueWebContainerBootPromise) {
    window._indexblueWebContainerBootPromise = (async () => {
      const webcontainerModule = (await import('@webcontainer/api')) as WebContainerModule;
      const instance = await webcontainerModule.WebContainer.boot({
        coep: 'credentialless',
      });

      webContainerInstance = instance;
      window._indexblueWebContainerInstance = instance;
      return instance;
    })().catch((error) => {
      window._indexblueWebContainerBootPromise = undefined;
      throw error;
    });
  }

  return await window._indexblueWebContainerBootPromise;
}

async function streamProcessOutput(process: WebContainerProcess, onChunk: (chunk: string) => void) {
  await process.output.pipeTo(
    new WritableStream<string>({
      write(chunk) {
        onChunk(chunk);
      },
    }),
  );
}

async function stopActiveDevServer() {
  if (!activeDevServerProcess) return;

  try {
    activeDevServerProcess.kill();
  } catch {
    return;
  } finally {
    activeDevServerProcess = null;
  }
}

export function BuilderWebContainerPreview({
  projectId,
  previewPath,
  previewRefreshKey,
  fallbackSource,
  isFullscreen = false,
  onPreviewUrlChange,
}: WebContainerPreviewProps) {
  const [status, setStatus] = useState<'idle' | 'booting' | 'installing' | 'starting' | 'ready' | 'error'>('idle');
  const [previewBaseUrl, setPreviewBaseUrl] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const iframeSrc = useMemo(() => {
    if (!previewBaseUrl) return null;
    const normalizedPath = previewPath.startsWith('/') ? previewPath : `/${previewPath}`;
    return `${previewBaseUrl.replace(/\/$/, '')}${normalizedPath}`;
  }, [previewBaseUrl, previewPath]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribeServerReady: (() => void) | null = null;
    let unsubscribeError: (() => void) | null = null;

    const appendLog = (value: string) => {
      const next = value.replace(/\r/g, '').split('\n').filter(Boolean);
      if (next.length === 0) return;

      setLogs((current) => [...current, ...next].slice(-120));
    };

    const start = async () => {
      setStatus('booting');
      setError(null);
      setPreviewBaseUrl('');
      setLogs([]);

      try {
        const response = await fetch(`/api/builder/projects/${projectId}/workspace-snapshot`, { cache: 'no-store' });
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          files?: WorkspaceSnapshotFile[];
        } | null;

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load workspace snapshot.');
        }

        const files = payload?.files ?? [];
        if (files.length === 0) {
          throw new Error('This project does not have any previewable workspace files yet.');
        }

        const plan = detectStartPlan(files);
        if (!plan.start) {
          throw new Error('No supported web start command was found for this workspace.');
        }

        const instance = await getWebContainer();
        if (cancelled) return;

        unsubscribeServerReady = instance.on('server-ready', (_port, url) => {
          if (cancelled) return;
          setPreviewBaseUrl(url);
          onPreviewUrlChange?.(url);
          setStatus('ready');
        });

        unsubscribeError = instance.on('error', (event) => {
          if (cancelled) return;
          setError(event.message || 'WebContainer preview failed.');
          setStatus('error');
        });

        await instance.mount(buildFileTree(files));

        if (plan.install) {
          setStatus('installing');
          appendLog(`$ ${plan.install[0]} ${plan.install[1].join(' ')}`);
          const installProcess = await instance.spawn(plan.install[0], plan.install[1]);
          await streamProcessOutput(installProcess, appendLog);
          const installExit = await installProcess.exit;
          if (installExit !== 0) {
            throw new Error(`Dependency install failed with exit code ${installExit}.`);
          }
        }

        await stopActiveDevServer();

        setStatus('starting');
        appendLog(`$ ${plan.start[0]} ${plan.start[1].join(' ')}`);
        const startProcess = await instance.spawn(plan.start[0], plan.start[1]);
        activeDevServerProcess = startProcess;
        void streamProcessOutput(startProcess, appendLog);
        void startProcess.exit.then((exitCode) => {
          if (cancelled || exitCode === 0) return;
          setError(`The WebContainer preview process exited with code ${exitCode}.`);
          setStatus('error');
        });
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to start WebContainer preview.');
        setStatus('error');
      }
    };

    void start();

    return () => {
      cancelled = true;
      unsubscribeServerReady?.();
      unsubscribeError?.();
    };
  }, [onPreviewUrlChange, projectId, previewRefreshKey]);

  if (iframeSrc) {
    return (
      <iframe
        key={`${iframeSrc}-${previewRefreshKey}`}
        title="WebContainer preview"
        className={cn('h-full w-full', isFullscreen && 'bg-white')}
        src={iframeSrc}
      />
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col justify-center gap-4 p-6 text-center text-gray-700">
        <div>
          <AlertTriangle className="mx-auto size-10 text-amber-500" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">WebContainer preview failed</h3>
          <p className="mt-2 text-sm leading-6 text-gray-600">{error || 'The browser runtime could not start.'}</p>
        </div>
        {fallbackSource ? (
          <iframe
            key={`webcontainer-fallback-${previewRefreshKey}`}
            title="HTML preview fallback"
            className="min-h-[320px] w-full rounded-xl border border-gray-200"
            sandbox="allow-scripts allow-same-origin"
            srcDoc={fallbackSource}
          />
        ) : logs.length > 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-left text-xs text-gray-600">
            <div className="mb-2 font-medium text-gray-800">Recent runtime output</div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{logs.join('\n')}</pre>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-gray-600">
      <div className="max-w-md">
        {status === 'ready' ? (
          <Play className="mx-auto size-10 text-gray-400" />
        ) : (
          <Loader2 className="mx-auto size-10 animate-spin text-gray-400" />
        )}
        <h3 className="mt-4 text-lg font-semibold text-gray-900">
          {status === 'installing'
            ? 'Installing dependencies'
            : status === 'starting'
              ? 'Starting WebContainer preview'
              : 'Booting WebContainer'}
        </h3>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          {status === 'installing'
            ? 'The browser runtime is installing packages for this project.'
            : status === 'starting'
              ? 'The preview server is starting inside your browser.'
              : 'Preparing an in-browser runtime for this web workspace.'}
        </p>
        {logs.length > 0 ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-left text-xs text-gray-600">
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words">{logs.join('\n')}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
