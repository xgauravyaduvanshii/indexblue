import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getBuilderProjectByIdForUser, updateBuilderProjectTheme } from '@/lib/db/builder-project-queries';

const canvasFrameVersionSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['preview', 'html']),
  source: z.string(),
  prompt: z.string().nullable().optional(),
  createdAt: z.number(),
  createdBy: z.enum(['manual', 'import', 'duplicate', 'ai-create', 'ai-regenerate']),
  themeId: z.string().nullable().optional(),
});

const canvasFrameSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['preview', 'html']),
  source: z.string(),
  route: z.string().nullable().optional(),
  width: z.number(),
  height: z.number(),
  x: z.number(),
  y: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  activeVersionId: z.string().nullable().optional(),
  versions: z.array(canvasFrameVersionSchema).optional(),
  lastPrompt: z.string().nullable().optional(),
});

const canvasDeletedFrameSchema = z.object({
  id: z.string(),
  frame: canvasFrameSchema,
  deletedAt: z.number(),
  reason: z.enum(['manual', 'replace']).optional(),
});

const canvasPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const canvasDrawingSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('shape'),
    shape: z.enum(['rectangle', 'square', 'circle', 'diamond', 'triangle']),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    color: z.string(),
    fill: z.string(),
    strokeWidth: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('arrow'),
    arrow: z.enum(['line', 'double', 'dashed', 'elbow']),
    start: canvasPointSchema,
    end: canvasPointSchema,
    color: z.string(),
    strokeWidth: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('path'),
    points: z.array(canvasPointSchema),
    color: z.string(),
    strokeWidth: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
  }),
]);

const updateProjectSchema = z.object({
  theme: z.string().nullable().optional(),
  metadata: z
    .object({
      sourceLabel: z.string().optional(),
      sourceUrl: z.string().optional(),
      sourceBranch: z.string().nullable().optional(),
      importMeta: z.record(z.string(), z.unknown()).optional(),
      panelState: z
        .object({
          activeTab: z.enum(['preview', 'code', 'canvas', 'more']).optional(),
        })
        .optional(),
      canvas: z
        .object({
          themeId: z.string().nullable().optional(),
          frames: z.array(canvasFrameSchema).optional(),
          deletedFrames: z.array(canvasDeletedFrameSchema).optional(),
          drawings: z.array(canvasDrawingSchema).optional(),
          drawColor: z.string().nullable().optional(),
        })
        .optional(),
    })
    .optional(),
});

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

  return Response.json({ project });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = updateProjectSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: 'Invalid project payload', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId } = await params;
  const existingProject = await getBuilderProjectByIdForUser({
    projectId,
    userId: session.user.id,
  });

  if (!existingProject) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  const project = await updateBuilderProjectTheme({
    projectId,
    userId: session.user.id,
    theme: parsed.data.theme ?? existingProject.theme ?? null,
    metadata: parsed.data.metadata
      ? { ...(existingProject.metadata ?? {}), ...parsed.data.metadata }
      : existingProject.metadata,
  });

  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  return Response.json({ project });
}
