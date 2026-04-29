import type { BuilderProjectMode } from '@/lib/builder/project-metadata';

export const BUILDER_RUNTIME_PROVIDERS = ['e2b', 'local', 'codesandbox', 'webcontainers'] as const;

export type BuilderRuntimeProvider = (typeof BUILDER_RUNTIME_PROVIDERS)[number];

type BuilderProjectLike = {
  sourceType: string;
  metadata?: {
    importMeta?: Record<string, unknown>;
  } | null;
};

const BUILDER_RUNTIME_PROVIDER_SET = new Set<string>(BUILDER_RUNTIME_PROVIDERS);

export function isBuilderRuntimeProvider(value: string | null | undefined): value is BuilderRuntimeProvider {
  return Boolean(value && BUILDER_RUNTIME_PROVIDER_SET.has(value));
}

export function getDefaultWebBuilderRuntimeProvider(): BuilderRuntimeProvider {
  const configured =
    process.env.NEXT_PUBLIC_BUILDER_WEB_RUNTIME_PROVIDER ?? process.env.BUILDER_WEB_RUNTIME_PROVIDER ?? 'codesandbox';

  return isBuilderRuntimeProvider(configured) ? configured : 'codesandbox';
}

export function resolveBuilderRuntimeProviderForMode(mode: BuilderProjectMode): BuilderRuntimeProvider {
  if (mode === 'apps') return 'e2b';
  if (mode === 'local') return 'local';
  if (mode === 'ssh') return 'local';
  return getDefaultWebBuilderRuntimeProvider();
}

export function getStoredBuilderRuntimeProvider(project: BuilderProjectLike) {
  const runtimeProvider = project.metadata?.importMeta?.runtimeProvider;
  return typeof runtimeProvider === 'string' && isBuilderRuntimeProvider(runtimeProvider) ? runtimeProvider : null;
}

export function getBuilderProjectRuntimeProvider(
  project: BuilderProjectLike,
  mode: BuilderProjectMode,
): BuilderRuntimeProvider {
  return getStoredBuilderRuntimeProvider(project) ?? resolveBuilderRuntimeProviderForMode(mode);
}

export function getBuilderProjectServerRuntimeProvider(
  project: BuilderProjectLike,
  mode: BuilderProjectMode,
): Exclude<BuilderRuntimeProvider, 'webcontainers'> {
  const provider = getBuilderProjectRuntimeProvider(project, mode);
  return provider === 'webcontainers' ? 'local' : provider;
}

export function isBrowserOnlyBuilderRuntimeProvider(provider: BuilderRuntimeProvider) {
  return provider === 'webcontainers';
}
