import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { maindb } from '@/lib/db';
import { builderGithubRepoSelection } from '@/lib/db/schema';

const selectRepoSchema = z.object({
  repoId: z.string().min(1),
  repoName: z.string().min(1),
  repoFullName: z.string().min(1),
  repoUrl: z.string().url(),
  cloneUrl: z.string().min(1),
  isPrivate: z.boolean(),
  defaultBranch: z.string().nullable().optional(),
});

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = selectRepoSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: 'Invalid repository payload', issues: parsed.error.flatten() }, { status: 400 });
  }

  const repo = parsed.data;

  await maindb
    .insert(builderGithubRepoSelection)
    .values({
      userId: session.user.id,
      repoId: repo.repoId,
      repoName: repo.repoName,
      repoFullName: repo.repoFullName,
      repoUrl: repo.repoUrl,
      cloneUrl: repo.cloneUrl,
      isPrivate: repo.isPrivate,
      defaultBranch: repo.defaultBranch ?? null,
    })
    .onConflictDoUpdate({
      target: builderGithubRepoSelection.userId,
      set: {
        repoId: repo.repoId,
        repoName: repo.repoName,
        repoFullName: repo.repoFullName,
        repoUrl: repo.repoUrl,
        cloneUrl: repo.cloneUrl,
        isPrivate: repo.isPrivate,
        defaultBranch: repo.defaultBranch ?? null,
        updatedAt: new Date(),
      },
    });

  return Response.json({ ok: true });
}
