import 'server-only';

import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getBuilderProjectByIdForUser } from '@/lib/db/builder-project-queries';

export async function requireBuilderProjectAccess(
  request: NextRequest,
  params: Promise<{ projectId: string } & Record<string, string>>,
) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return {
      status: 401 as const,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { projectId } = await params;
  const project = await getBuilderProjectByIdForUser({
    projectId,
    userId: session.user.id,
  });

  if (!project) {
    return {
      status: 404 as const,
      response: Response.json({ error: 'Project not found' }, { status: 404 }),
    };
  }

  return {
    status: 200 as const,
    session,
    project,
  };
}
