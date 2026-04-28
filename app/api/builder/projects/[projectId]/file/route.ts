import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getBuilderProjectByIdForUser } from '@/lib/db/builder-project-queries';
import {
  createWorkspaceEntry,
  deleteWorkspaceEntry,
  readWorkspaceTextFile,
  renameWorkspaceEntry,
  writeWorkspaceTextFile,
} from '@/lib/builder/workspace';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const relativePath = searchParams.get('path');

  if (!relativePath) {
    return Response.json({ error: 'path is required.' }, { status: 400 });
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
    const content = await readWorkspaceTextFile(project.workspacePath, relativePath);
    return Response.json({ content });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read workspace file.';
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { path?: string; content?: string } | null;
  const relativePath = body?.path;
  const content = body?.content;

  if (!relativePath || typeof relativePath !== 'string') {
    return Response.json({ error: 'path is required.' }, { status: 400 });
  }

  if (typeof content !== 'string') {
    return Response.json({ error: 'content must be a string.' }, { status: 400 });
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
    await writeWorkspaceTextFile(project.workspacePath, relativePath, content);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to write workspace file.';
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { action?: 'create' | 'rename'; path?: string; nextPath?: string; type?: 'file' | 'folder'; content?: string }
    | null;

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
    if (body?.action === 'create') {
      if (!body.path || !body.type) {
        return Response.json({ error: 'path and type are required.' }, { status: 400 });
      }

      await createWorkspaceEntry(project.workspacePath, body.path, body.type, body.content ?? '');
      return Response.json({ ok: true });
    }

    if (body?.action === 'rename') {
      if (!body.path || !body.nextPath) {
        return Response.json({ error: 'path and nextPath are required.' }, { status: 400 });
      }

      await renameWorkspaceEntry(project.workspacePath, body.path, body.nextPath);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update workspace entry.';
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const relativePath = searchParams.get('path');

  if (!relativePath) {
    return Response.json({ error: 'path is required.' }, { status: 400 });
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
    await deleteWorkspaceEntry(project.workspacePath, relativePath);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete workspace entry.';
    return Response.json({ error: message }, { status: 400 });
  }
}
