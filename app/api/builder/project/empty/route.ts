import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { createBuilderProjectFromWorkspace } from '@/lib/builder/projects';
import { resolveBuilderRuntimeProviderForMode } from '@/lib/builder/runtime-provider';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json({ error: 'Empty Start is only available in development.' }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { project, redirectTo } = await createBuilderProjectFromWorkspace({
    userId: session.user.id,
    sourceType: 'empty',
    workspacePath: null,
    fallbackName: 'Empty Start',
    metadata: {
      sourceLabel: 'Empty Start',
      importMeta: {
        devOnly: true,
        builderMode: 'web',
        runtimeProvider: resolveBuilderRuntimeProviderForMode('web'),
      },
    },
  });

  return Response.json({
    ok: true,
    projectId: project.id,
    redirectTo,
  });
}
