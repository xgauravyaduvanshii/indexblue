import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { collectWorkspaceFiles } from '@/lib/builder/workspace';
import { getBuilderProjectByIdForUser } from '@/lib/db/builder-project-queries';

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
    return Response.json({ error: 'This project does not have a workspace yet.' }, { status: 400 });
  }

  try {
    const files = await collectWorkspaceFiles(project.workspacePath);
    const textFiles = files
      .filter((file) => !file.content.includes(0))
      .map((file) => ({
        path: file.path,
        content: Buffer.from(file.content).toString('utf8'),
      }));

    return Response.json({
      files: textFiles,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load workspace snapshot.',
      },
      { status: 500 },
    );
  }
}
