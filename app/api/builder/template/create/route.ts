import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createExpoAppTemplateWorkspaceFromE2B } from '@/lib/builder/app-session';
import { createCodeSandboxWorkspaceFromTemplate } from '@/lib/builder/codesandbox';
import type { BuilderProjectLiveSession } from '@/lib/builder/project-metadata';
import { createBuilderProjectFromWorkspace } from '@/lib/builder/projects';
import { resolveBuilderRuntimeProviderForMode } from '@/lib/builder/runtime-provider';
import { getBuilderTemplateScaffold } from '@/lib/builder/template-scaffolds';
import { BUILDER_TEMPLATE_IDS, isBuilderTemplateSupportedForProvider } from '@/lib/builder/template-options';
import { updateBuildSession } from '@/lib/db/queries';

export const runtime = 'nodejs';

const templateSchema = z.object({
  templateId: z.enum(BUILDER_TEMPLATE_IDS),
  mode: z.enum(['local', 'web', 'apps']).optional(),
});

const TEMPLATES = {
  'expo-app': {
    name: 'Expo Mobile Starter',
    slug: 'expo-mobile-starter',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'expo-mobile-starter',
          private: true,
          main: 'expo-router/entry',
          scripts: {
            dev: 'expo start --tunnel',
            android: 'expo start --android',
            ios: 'expo start --ios',
            web: 'expo start --web',
          },
          dependencies: {
            expo: '^53.0.0',
            'expo-router': '~5.0.0',
            'expo-status-bar': '~2.2.3',
            react: '19.0.0',
            'react-native': '0.79.5',
            'react-native-safe-area-context': '5.4.0',
            'react-native-screens': '~4.11.1',
          },
        },
        null,
        2,
      ),
      'app/_layout.tsx': `import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#09090f' },
        }}
      />
    </>
  );
}
`,
      'app/index.tsx': `import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.kicker}>INDEXBLUE MOBILE</Text>
        <Text style={styles.title}>Expo Mobile Starter</Text>
        <Text style={styles.copy}>
          Your app workspace is ready. Start building screens, flows, and native features with the builder.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#09090f',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 28,
    padding: 24,
    backgroundColor: '#141420',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  kicker: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: 'rgba(248,250,252,0.72)',
    fontSize: 15,
    lineHeight: 24,
  },
});
`,
      'app.json': JSON.stringify(
        {
          expo: {
            name: 'Expo Mobile Starter',
            slug: 'expo-mobile-starter',
            scheme: 'expomobilestarter',
            orientation: 'portrait',
            userInterfaceStyle: 'dark',
            plugins: ['expo-router'],
          },
        },
        null,
        2,
      ),
      'README.md': '# Expo Mobile Starter\n\nA mobile-first Expo Router scaffold created from Indexblue Builder.\n',
    },
  },
} as const;

async function writeTemplateFiles(rootDir: string, files: Record<string, string>) {
  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const absolutePath = path.join(rootDir, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf8');
    }),
  );
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = templateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return Response.json({ error: 'Invalid template payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const builderMode = parsed.data.mode ?? (parsed.data.templateId === 'expo-app' ? 'apps' : 'web');
    const runtimeProvider = resolveBuilderRuntimeProviderForMode(builderMode);
    const template =
      parsed.data.templateId === 'expo-app'
        ? TEMPLATES['expo-app']
        : getBuilderTemplateScaffold(parsed.data.templateId);

    if (builderMode === 'web' && !isBuilderTemplateSupportedForProvider(parsed.data.templateId, runtimeProvider)) {
      return Response.json(
        {
          error: `The ${parsed.data.templateId} template is not supported with the ${runtimeProvider} runtime provider.`,
        },
        { status: 400 },
      );
    }

    const templateBucket = builderMode === 'apps' ? 'app-templates' : 'web-templates';
    let baseDir: string;
    let liveSessionMetadata: {
      boxId: string;
      buildRuntime: 'node';
      liveSession: BuilderProjectLiveSession;
      previewPort?: number | null;
      startCommand?: string | null;
      sandboxTemplateId?: string | null;
    } | null = null;

    if (parsed.data.templateId === 'expo-app') {
      const liveTemplate = await createExpoAppTemplateWorkspaceFromE2B({
        userId: session.user.id,
      });
      baseDir = liveTemplate.workspacePath;
      liveSessionMetadata = {
        boxId: liveTemplate.boxId,
        buildRuntime: liveTemplate.buildRuntime,
        liveSession: liveTemplate.liveSession,
      };
    } else if (builderMode === 'web' && runtimeProvider === 'codesandbox') {
      const liveTemplate = await createCodeSandboxWorkspaceFromTemplate({
        templateId: parsed.data.templateId,
        userId: session.user.id,
      });
      baseDir = liveTemplate.workspacePath;
      liveSessionMetadata = {
        boxId: liveTemplate.sandboxId,
        buildRuntime: 'node',
        liveSession: liveTemplate.liveSession,
        previewPort: liveTemplate.previewPort,
        startCommand: liveTemplate.startCommand,
        sandboxTemplateId: liveTemplate.sandboxTemplateId,
      };
    } else {
      baseDir = path.join(tmpdir(), 'indexblue-builder-workspaces', templateBucket, `${template.slug}-${Date.now()}`);
      await mkdir(baseDir, { recursive: true });
      await writeTemplateFiles(baseDir, template.files);
    }

    const { project, redirectTo } = await createBuilderProjectFromWorkspace({
      userId: session.user.id,
      sourceType: 'template',
      workspacePath: baseDir,
      fallbackName: template.name,
      metadata: {
        sourceLabel: 'Template',
        importMeta: {
          templateId: parsed.data.templateId,
          templateSlug: template.slug,
          builderMode,
          platform: builderMode === 'apps' ? 'mobile' : 'web',
          runtimeProvider,
          ...(liveSessionMetadata?.previewPort ? { previewPort: liveSessionMetadata.previewPort } : {}),
          ...(liveSessionMetadata?.startCommand ? { startCommand: liveSessionMetadata.startCommand } : {}),
          ...(liveSessionMetadata?.sandboxTemplateId
            ? { codesandboxTemplateId: liveSessionMetadata.sandboxTemplateId }
            : {}),
        },
        ...(liveSessionMetadata ? { liveSession: liveSessionMetadata.liveSession } : {}),
      },
    });

    if (liveSessionMetadata) {
      await updateBuildSession({
        chatId: project.chatId,
        status: 'active',
        boxId: liveSessionMetadata.boxId,
        runtime: liveSessionMetadata.buildRuntime,
      });
    }

    return Response.json({
      ok: true,
      templateId: parsed.data.templateId,
      templateName: template.name,
      createdPath:
        runtimeProvider === 'codesandbox' && liveSessionMetadata
          ? `CodeSandbox • ${liveSessionMetadata.liveSession.sandboxId}`
          : baseDir,
      projectId: project.id,
      redirectTo,
      previewUrl: liveSessionMetadata?.liveSession.previewUrl ?? null,
    });
  } catch (error) {
    console.error('Failed to create builder template workspace:', error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create template workspace.',
      },
      { status: 500 },
    );
  }
}
