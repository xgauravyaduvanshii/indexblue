import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireBuilderProjectAccess } from '@/lib/builder/project-context';
import {
  getBuilderProjectToolState,
  listBuilderProjectToolStates,
  upsertBuilderProjectToolState,
} from '@/lib/db/builder-app-queries';

export const runtime = 'nodejs';

const saveToolStateSchema = z.object({
  toolId: z.string().min(1),
  state: z.record(z.string(), z.unknown()),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const { searchParams } = new URL(request.url);
  const toolId = searchParams.get('toolId');

  if (toolId) {
    const record = await getBuilderProjectToolState({
      projectId: access.project.id,
      userId: access.session.user.id,
      toolId,
    });

    return Response.json({ toolState: record });
  }

  const records = await listBuilderProjectToolStates({
    projectId: access.project.id,
    userId: access.session.user.id,
  });

  return Response.json({ toolStates: records });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const parsed = saveToolStateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid tool state payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const record = await upsertBuilderProjectToolState({
    projectId: access.project.id,
    userId: access.session.user.id,
    toolId: parsed.data.toolId,
    state: parsed.data.state,
  });

  return Response.json({ toolState: record });
}
