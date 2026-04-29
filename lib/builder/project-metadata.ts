import type { BuilderCanvasState } from '@/lib/builder/canvas';
import { BUILDER_BOX_ROOT, BUILDER_REMOTE_PROJECT_PATH } from '@/lib/builder/paths';
import {
  getBuilderProjectRuntimeProvider as resolveBuilderProjectRuntimeProvider,
  getBuilderProjectServerRuntimeProvider as resolveBuilderProjectServerRuntimeProvider,
  type BuilderRuntimeProvider,
} from '@/lib/builder/runtime-provider';

export type BuilderProjectMode = 'local' | 'web' | 'apps' | 'ssh';

export type BuilderProjectLiveSession = {
  provider: 'e2b' | 'codesandbox';
  sandboxId: string;
  remoteWorkspaceRoot: string;
  previewUrl: string | null;
  tunnelUrl?: string | null;
  previewPort?: number | null;
  sessionToken?: string | null;
  status: 'booting' | 'ready' | 'error';
  templateId?: string | null;
  source?: 'template' | 'import' | 'manual';
  createdAt: string;
  updatedAt: string;
  lastBootAt?: string | null;
  lastError?: string | null;
};

export type BuilderProjectMetadata = {
  sourceLabel?: string;
  sourceUrl?: string;
  sourceBranch?: string | null;
  importMeta?: Record<string, unknown>;
  panelState?: {
    activeTab?: 'preview' | 'code' | 'canvas' | 'more';
  };
  canvas?: BuilderCanvasState;
  liveSession?: BuilderProjectLiveSession;
};

type BuilderProjectLike = {
  sourceType: string;
  workspacePath?: string | null;
  metadata?: BuilderProjectMetadata | null;
};

export function getBuilderProjectMode(project: BuilderProjectLike): BuilderProjectMode {
  const builderMode = project.metadata?.importMeta?.builderMode;

  if (builderMode === 'local' || builderMode === 'web' || builderMode === 'apps' || builderMode === 'ssh') {
    return builderMode;
  }

  if (project.sourceType === 'ssh') {
    return 'ssh';
  }

  return 'web';
}

export function isExpoAppTemplateProject(project: BuilderProjectLike) {
  const importMeta = project.metadata?.importMeta;
  if (!importMeta || typeof importMeta !== 'object') return false;

  return importMeta.templateId === 'expo-app';
}

export function isAppBuilderProject(project: BuilderProjectLike) {
  if (getBuilderProjectMode(project) === 'apps') return true;

  const importMeta = project.metadata?.importMeta;
  if (!importMeta || typeof importMeta !== 'object') return false;

  return importMeta.templateId === 'expo-app' || importMeta.platform === 'mobile';
}

export function getBuilderProjectRemoteWorkspaceRoot(project: BuilderProjectLike) {
  const runtimeProvider = getBuilderProjectServerRuntimeProvider(project);
  if (runtimeProvider === 'local') {
    return project.workspacePath?.trim() || BUILDER_BOX_ROOT;
  }

  const configuredRoot = project.metadata?.liveSession?.remoteWorkspaceRoot?.trim();
  if (configuredRoot) {
    return configuredRoot;
  }

  if (isExpoAppTemplateProject(project)) {
    return BUILDER_BOX_ROOT;
  }

  return project.workspacePath ? BUILDER_REMOTE_PROJECT_PATH : BUILDER_BOX_ROOT;
}

export function getBuilderProjectRuntimeProvider(project: BuilderProjectLike): BuilderRuntimeProvider {
  return resolveBuilderProjectRuntimeProvider(project, getBuilderProjectMode(project));
}

export function getBuilderProjectServerRuntimeProvider(project: BuilderProjectLike) {
  return resolveBuilderProjectServerRuntimeProvider(project, getBuilderProjectMode(project));
}
