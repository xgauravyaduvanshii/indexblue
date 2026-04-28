import { NextRequest } from 'next/server';
import { bootstrapBuilderAppProjectSession } from '@/lib/builder/app-session';
import { requireBuilderProjectAccess } from '@/lib/builder/project-context';
import { isAppBuilderProject } from '@/lib/builder/project-metadata';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  return Response.json({
    liveSession: access.project.metadata?.liveSession ?? null,
    boxId: access.project.boxId ?? access.project.metadata?.liveSession?.sandboxId ?? null,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  if (!isAppBuilderProject(access.project)) {
    return Response.json({ error: 'This project is not an app workspace.' }, { status: 400 });
  }

  try {
    const { boxId, liveSession } = await bootstrapBuilderAppProjectSession({
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
      reseedWorkspace: false,
    });

    return Response.json({
      ok: true,
      boxId,
      liveSession,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to start the app session.',
      },
      { status: 500 },
    );
  }
}
