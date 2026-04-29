import type { BuilderRuntimeProvider } from '@/lib/builder/runtime-provider';

export const BUILDER_TEMPLATE_IDS = [
  'next-app',
  'react-vite',
  'angular-app',
  'static-site',
  'docker-node',
  'docker-universal',
  'node-api',
  'node-http',
  'python-app',
  'tensorflow-python',
  'pytorch-python',
  'bun-app',
  'jupyter-python',
  'nuxt-app',
  'expo-app',
] as const;

export type BuilderTemplateId = (typeof BUILDER_TEMPLATE_IDS)[number];
export type BuilderTemplateMode = 'local' | 'web' | 'apps' | 'ssh';

export type BuilderTemplateOption = {
  id: BuilderTemplateId;
  name: string;
  description: string;
  modes: BuilderTemplateMode[];
  providers?: BuilderRuntimeProvider[];
  sourceUrl?: string;
};

export const BUILDER_TEMPLATE_OPTIONS: BuilderTemplateOption[] = [
  {
    id: 'next-app',
    name: 'Next.js App',
    description: 'App Router starter for modern full-stack React products.',
    modes: ['web'],
    providers: ['local', 'codesandbox', 'webcontainers'],
    sourceUrl: 'https://github.com/vercel/next.js',
  },
  {
    id: 'react-vite',
    name: 'React + Vite',
    description: 'Fast React starter with Vite for UI-first apps.',
    modes: ['web'],
    providers: ['local', 'codesandbox', 'webcontainers'],
    sourceUrl: 'https://github.com/vitejs/vite',
  },
  {
    id: 'angular-app',
    name: 'Angular App',
    description: 'Angular starter with standalone app structure and dev server.',
    modes: ['web'],
    providers: ['local', 'codesandbox'],
    sourceUrl: 'https://github.com/angular/angular',
  },
  {
    id: 'static-site',
    name: 'Static Site',
    description: 'Simple HTML and CSS starter for quick marketing pages.',
    modes: ['web'],
    providers: ['local', 'codesandbox', 'webcontainers'],
  },
  {
    id: 'docker-node',
    name: 'Docker Node App',
    description: 'Node server starter with Dockerfile for containerized web work.',
    modes: ['web'],
    providers: ['local', 'codesandbox'],
  },
  {
    id: 'docker-universal',
    name: 'Docker Universal',
    description: 'Portable container starter with compose and a lightweight app shell.',
    modes: ['web'],
    providers: ['local', 'codesandbox'],
  },
  {
    id: 'node-api',
    name: 'Node.js API',
    description: 'Small API server starter for backend experiments.',
    modes: ['web'],
    providers: ['local', 'codesandbox'],
  },
  {
    id: 'node-http',
    name: 'Node HTTP Server',
    description: 'Minimal HTTP server starter using the Node standard library.',
    modes: ['web'],
    providers: ['local', 'codesandbox'],
  },
  {
    id: 'python-app',
    name: 'Python App',
    description: 'Python starter with a lightweight web server entrypoint.',
    modes: ['web'],
    providers: ['local', 'codesandbox'],
  },
  {
    id: 'tensorflow-python',
    name: 'TensorFlow Python',
    description: 'Python ML starter with TensorFlow dependencies and sample code.',
    modes: ['web'],
    providers: ['local', 'codesandbox'],
  },
  {
    id: 'pytorch-python',
    name: 'PyTorch Python',
    description: 'PyTorch starter for model prototyping and Python experiments.',
    modes: ['web'],
    providers: ['local', 'codesandbox'],
  },
  {
    id: 'bun-app',
    name: 'Bun App',
    description: 'Bun starter for fast TypeScript server-side projects.',
    modes: ['web'],
    providers: ['local', 'codesandbox'],
  },
  {
    id: 'jupyter-python',
    name: 'Jupyter Lab',
    description: 'Notebook-friendly Python starter with Jupyter Lab setup.',
    modes: ['web'],
    providers: ['local', 'codesandbox'],
  },
  {
    id: 'nuxt-app',
    name: 'Nuxt App',
    description: 'Nuxt 3 starter for Vue-based full-stack apps.',
    modes: ['web'],
    providers: ['local', 'codesandbox'],
    sourceUrl: 'https://github.com/nuxt/nuxt',
  },
  {
    id: 'expo-app',
    name: 'Expo Mobile Starter',
    description: 'Expo Router starter for mobile app flows with a real app shell.',
    modes: ['apps'],
    providers: ['e2b'],
  },
];

export function getBuilderTemplateOptions({
  mode,
  runtimeProvider,
}: {
  mode: BuilderTemplateMode;
  runtimeProvider?: BuilderRuntimeProvider | null;
}) {
  return BUILDER_TEMPLATE_OPTIONS.filter((template) => {
    if (!template.modes.includes(mode)) return false;
    if (!runtimeProvider || !template.providers || mode !== 'web') return true;
    return template.providers.includes(runtimeProvider);
  });
}

export function isBuilderTemplateSupportedForProvider(
  templateId: BuilderTemplateId,
  runtimeProvider: BuilderRuntimeProvider,
) {
  const template = BUILDER_TEMPLATE_OPTIONS.find((entry) => entry.id === templateId);
  if (!template?.providers) return true;
  return template.providers.includes(runtimeProvider);
}
