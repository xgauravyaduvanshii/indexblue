import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireBuilderProjectAccess } from '@/lib/builder/project-context';
import { readProjectWorkspaceEnvFile, syncProjectEnvFiles } from '@/lib/builder/app-runtime';
import { decryptBuilderSecret, encryptBuilderSecret } from '@/lib/builder/secrets';
import {
  deleteBuilderProjectEnvVar,
  listBuilderProjectEnvVars,
  upsertBuilderProjectEnvVar,
} from '@/lib/db/builder-app-queries';

export const runtime = 'nodejs';

const saveEnvSchema = z.object({
  entries: z.array(
    z.object({
      key: z.string().min(1),
      value: z.string(),
      isSecret: z.boolean().optional(),
    }),
  ),
  fileName: z.string().optional(),
  reseedWorkspace: z.boolean().optional(),
});

const deleteEnvSchema = z.object({
  key: z.string().min(1),
  fileName: z.string().optional(),
});

async function loadMergedEnv(
  project: { workspacePath: string | null },
  dbRows: Awaited<ReturnType<typeof listBuilderProjectEnvVars>>,
) {
  const workspaceEnv = await readProjectWorkspaceEnvFile(project);
  const envFromDb = Object.fromEntries(
    dbRows.map((row) => {
      try {
        return [row.key, decryptBuilderSecret(row.encryptedValue)];
      } catch {
        return [row.key, ''];
      }
    }),
  );

  return {
    workspaceEnv,
    envFromDb,
    merged: {
      ...workspaceEnv,
      ...envFromDb,
    },
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const dbRows = await listBuilderProjectEnvVars({
    projectId: access.project.id,
    userId: access.session.user.id,
  });
  const { workspaceEnv, envFromDb, merged } = await loadMergedEnv(access.project, dbRows);

  const envVars = Object.entries(merged)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({
      key,
      value,
      source: key in envFromDb ? 'database' : key in workspaceEnv ? 'workspace' : 'unknown',
      isSecret: dbRows.find((row) => row.key === key)?.isSecret ?? true,
    }));

  return Response.json({ envVars });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const parsed = saveEnvSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid env payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  for (const entry of parsed.data.entries) {
    await upsertBuilderProjectEnvVar({
      projectId: access.project.id,
      userId: access.session.user.id,
      key: entry.key,
      encryptedValue: encryptBuilderSecret(entry.value),
      isSecret: entry.isSecret ?? true,
      source: 'manual',
      fileName: parsed.data.fileName ?? '.env.local',
    });
  }

  const dbRows = await listBuilderProjectEnvVars({
    projectId: access.project.id,
    userId: access.session.user.id,
  });
  const { merged } = await loadMergedEnv(access.project, dbRows);

  await syncProjectEnvFiles({
    project: access.project,
    userId: access.session.user.id,
    envs: merged,
    fileName: parsed.data.fileName ?? '.env.local',
    reseedWorkspace: parsed.data.reseedWorkspace ?? false,
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const parsed = deleteEnvSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid env delete payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  await deleteBuilderProjectEnvVar({
    projectId: access.project.id,
    userId: access.session.user.id,
    key: parsed.data.key,
  });

  const dbRows = await listBuilderProjectEnvVars({
    projectId: access.project.id,
    userId: access.session.user.id,
  });
  const { merged } = await loadMergedEnv(access.project, dbRows);
  delete merged[parsed.data.key];

  await syncProjectEnvFiles({
    project: access.project,
    userId: access.session.user.id,
    envs: merged,
    fileName: parsed.data.fileName ?? '.env.local',
  });

  return Response.json({ ok: true });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const parsed = z
    .object({
      fileName: z.string().optional(),
      reseedWorkspace: z.boolean().optional(),
    })
    .safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json({ error: 'Invalid env sync payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const dbRows = await listBuilderProjectEnvVars({
    projectId: access.project.id,
    userId: access.session.user.id,
  });
  const { merged } = await loadMergedEnv(access.project, dbRows);

  await syncProjectEnvFiles({
    project: access.project,
    userId: access.session.user.id,
    envs: merged,
    fileName: parsed.data.fileName ?? '.env.local',
    reseedWorkspace: parsed.data.reseedWorkspace ?? false,
  });

  return Response.json({ ok: true });
}
