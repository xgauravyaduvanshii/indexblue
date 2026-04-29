import { NextRequest } from 'next/server';
import { z } from 'zod';
import { bootstrapBuilderAppProjectSession } from '@/lib/builder/app-session';
import {
  getCodeSandboxProjectPreviewPort,
  getCodeSandboxProjectStartCommand,
  restartCodeSandboxPreview,
  syncBuilderCodeSandboxProjectMirror,
} from '@/lib/builder/codesandbox';
import { ensureBuilderBox, installBunInBuilderBox, seedBuilderWorkspace, terminateBuilderBox } from '@/lib/builder/box';
import { requireBuilderProjectAccess } from '@/lib/builder/project-context';
import {
  getBuilderProjectRemoteWorkspaceRoot,
  getBuilderProjectServerRuntimeProvider,
  isAppBuilderProject,
  type BuilderProjectLiveSession,
  type BuilderProjectMetadata,
} from '@/lib/builder/project-metadata';
import { updateBuilderProjectTheme } from '@/lib/db/builder-project-queries';
import { updateBuildSession } from '@/lib/db/queries';

export const runtime = 'nodejs';

const projectRuntimeActionSchema = z.object({
  action: z.enum(['stop', 'rerun']),
});

function resolveRuntime(value: string | null | undefined) {
  const runtime = value?.trim();
  if (runtime === 'python' || runtime === 'golang' || runtime === 'ruby' || runtime === 'rust') {
    return runtime;
  }

  return 'node';
}

function buildStoppedLiveSessionMetadata(
  metadata: BuilderProjectMetadata | null | undefined,
): BuilderProjectLiveSession | null {
  const liveSession = metadata?.liveSession;
  if (!liveSession) return null;

  return {
    ...liveSession,
    previewUrl: null,
    tunnelUrl: null,
    previewPort: null,
    status: 'error',
    updatedAt: new Date().toISOString(),
    lastError: 'Stopped from the projects dashboard.',
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const parsed = projectRuntimeActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid project runtime action.' }, { status: 400 });
  }

  const boxId = access.project.boxId ?? access.project.metadata?.liveSession?.sandboxId ?? null;
  const runtime = resolveRuntime(access.project.buildRuntime);
  const runtimeProvider = getBuilderProjectServerRuntimeProvider(access.project);

  if (parsed.data.action === 'stop') {
    if (boxId) {
      await terminateBuilderBox({ boxId, provider: runtimeProvider }).catch((error) => {
        console.warn(`Failed to stop builder runtime for ${access.project.id}:`, error);
      });
    }

    const stoppedLiveSession = buildStoppedLiveSessionMetadata(access.project.metadata);
    if (stoppedLiveSession) {
      await updateBuilderProjectTheme({
        projectId: access.project.id,
        userId: access.session.user.id,
        theme: access.project.theme,
        metadata: {
          ...(access.project.metadata ?? {}),
          liveSession: stoppedLiveSession,
        },
      }).catch(() => undefined);
    }

    await updateBuildSession({
      chatId: access.project.chatId,
      status: 'paused',
      boxId: null,
      runtime,
    });

    return Response.json({
      ok: true,
      action: 'stop',
      buildStatus: 'paused',
      boxId: null,
      previewUrl: null,
    });
  }

  if (isAppBuilderProject(access.project)) {
    const session = await bootstrapBuilderAppProjectSession({
      project: {
        id: access.project.id,
        userId: access.session.user.id,
        chatId: access.project.chatId,
        name: access.project.name,
        sourceType: access.project.sourceType,
        workspacePath: access.project.workspacePath,
        theme: access.project.theme,
        metadata: access.project.metadata,
        buildRuntime: access.project.buildRuntime,
        boxId: access.project.boxId,
      },
      reseedWorkspace: true,
    });

    return Response.json({
      ok: true,
      action: 'rerun',
      buildStatus: 'active',
      boxId: session.boxId,
      previewUrl: session.liveSession.previewUrl,
      liveSession: session.liveSession,
    });
  }

  if (runtimeProvider === 'codesandbox' && boxId) {
    const previewPort = getCodeSandboxProjectPreviewPort(access.project);
    const restart = await restartCodeSandboxPreview({
      sandboxId: boxId,
      userId: access.session.user.id,
      runtime: runtime as any,
      previewPort,
      remoteWorkspaceRoot: access.project.metadata?.liveSession?.remoteWorkspaceRoot ?? null,
      startCommand: getCodeSandboxProjectStartCommand(access.project),
    });

    await syncBuilderCodeSandboxProjectMirror({
      project: access.project,
      userId: access.session.user.id,
      resetLocal: true,
    }).catch(() => undefined);

    if (access.project.metadata?.liveSession) {
      await updateBuilderProjectTheme({
        projectId: access.project.id,
        userId: access.session.user.id,
        theme: access.project.theme,
        metadata: {
          ...(access.project.metadata ?? {}),
          liveSession: {
            ...access.project.metadata.liveSession,
            previewUrl: restart.previewUrl,
            previewPort: restart.previewPort,
            remoteWorkspaceRoot: restart.remoteWorkspaceRoot,
            status: 'ready',
            updatedAt: new Date().toISOString(),
            lastBootAt: new Date().toISOString(),
            lastError: null,
          },
        },
      }).catch(() => undefined);
    }

    await updateBuildSession({
      chatId: access.project.chatId,
      status: 'active',
      boxId,
      runtime,
    });

    return Response.json({
      ok: true,
      action: 'rerun',
      buildStatus: 'active',
      boxId,
      previewUrl: restart.previewUrl,
    });
  }

  if (boxId) {
    await terminateBuilderBox({ boxId, provider: runtimeProvider }).catch(() => undefined);
  }

  const remoteWorkspaceRoot = getBuilderProjectRemoteWorkspaceRoot(access.project);
  const { box } = await ensureBuilderBox({
    userId: access.session.user.id,
    runtime,
    provider: runtimeProvider,
    workspacePath: access.project.workspacePath ?? null,
  });

  await Promise.all([
    installBunInBuilderBox(box).catch((error) => {
      console.warn(`Builder Bun install failed for ${access.project.id}:`, error);
    }),
    seedBuilderWorkspace(box, access.project.workspacePath ?? null, {
      remoteRoot: remoteWorkspaceRoot,
      resetRemote: true,
    }).catch((error) => {
      console.warn(`Builder workspace seed failed for ${access.project.id}:`, error);
      return false;
    }),
  ]);

  await updateBuildSession({
    chatId: access.project.chatId,
    status: 'active',
    boxId: box.id,
    runtime,
  });

  return Response.json({
    ok: true,
    action: 'rerun',
    buildStatus: 'active',
    boxId: box.id,
    previewUrl: access.project.metadata?.liveSession?.previewUrl ?? null,
  });
}
