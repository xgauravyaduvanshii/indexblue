import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getBuilderProjectByIdForUser } from '@/lib/db/builder-project-queries';
import { buildWorkspaceTree } from '@/lib/builder/workspace';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId } = await params;
  const project = await getBuilderProjectByIdForUser({
    projectId,
    userId: session.user.id,
  });

  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!project.workspacePath) {
    return Response.json({ tree: [] });
  }

  try {
    const tree = await buildWorkspaceTree(project.workspacePath);
    return Response.json({ tree });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to read workspace tree.',
      },
      { status: 500 },
    );
  }
}
