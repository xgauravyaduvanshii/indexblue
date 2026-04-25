import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { account, builderGithubRepoSelection } from '@/lib/db/schema';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  default_branch: string;
};

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ connected: false, repos: [], selectedRepoId: null }, { status: 200 });
  }

  const githubAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, session.user.id), eq(account.providerId, 'github')),
    columns: {
      accessToken: true,
    },
  });

  if (!githubAccount?.accessToken) {
    return Response.json({ connected: false, repos: [], selectedRepoId: null }, { status: 200 });
  }

  let selectedRepo: { repoId: string } | undefined;

  try {
    selectedRepo = await db.query.builderGithubRepoSelection.findFirst({
      where: eq(builderGithubRepoSelection.userId, session.user.id),
      columns: {
        repoId: true,
      },
    });
  } catch (error) {
    const code = typeof error === 'object' && error && 'cause' in error ? (error as { cause?: { code?: string } }).cause?.code : undefined;
    if (code !== '42P01') {
      throw error;
    }
  }

  const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: {
      Authorization: `Bearer ${githubAccount.accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'indexblue-builder',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return Response.json({ error: 'Failed to fetch GitHub repos' }, { status: response.status });
  }

  const repos = (await response.json()) as GitHubRepo[];

  return Response.json({
    connected: true,
    selectedRepoId: selectedRepo?.repoId ?? null,
    repos: repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      cloneUrl: `${repo.html_url}.git`,
      private: repo.private,
      defaultBranch: repo.default_branch,
    })),
  });
}
