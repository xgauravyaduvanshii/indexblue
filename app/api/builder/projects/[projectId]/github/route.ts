import { NextRequest } from 'next/server';
import { requireBuilderProjectAccess } from '@/lib/builder/project-context';
import {
  fetchGitHubViewer,
  getGitHubAccessTokenForUser,
  getSavedGitHubRepoSelection,
  getWorkspaceGitSnapshot,
  listGitHubRepos,
  parseGitHubRepositoryFullName,
} from '@/lib/builder/github';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const { project, session } = access;
  const snapshot = await getWorkspaceGitSnapshot(project.workspacePath);
  const accessToken = await getGitHubAccessTokenForUser(session.user.id);
  const metadata = project.metadata ?? {};
  const projectRepository =
    parseGitHubRepositoryFullName(typeof metadata.sourceUrl === 'string' ? metadata.sourceUrl : null) ??
    parseGitHubRepositoryFullName(typeof metadata.sourceLabel === 'string' ? metadata.sourceLabel : null);

  if (!accessToken) {
    return Response.json({
      connected: false,
      account: null,
      repos: [],
      selectedRepoId: null,
      selectedRepoFullName: projectRepository,
      selectedBranch:
        (typeof metadata.sourceBranch === 'string' && metadata.sourceBranch) || snapshot.currentBranch || 'main',
      remoteUrl: (typeof metadata.sourceUrl === 'string' && metadata.sourceUrl) || snapshot.remoteUrl || null,
      isGitRepo: snapshot.isGitRepo,
      changes: snapshot.changes,
    });
  }

  try {
    const [account, repos, savedSelection] = await Promise.all([
      fetchGitHubViewer(accessToken),
      listGitHubRepos(accessToken),
      getSavedGitHubRepoSelection(session.user.id),
    ]);

    const selectedRepo =
      repos.find((repo) => repo.fullName === projectRepository) ??
      repos.find((repo) => String(repo.id) === savedSelection?.repoId) ??
      repos.find((repo) => repo.fullName === savedSelection?.repoFullName) ??
      null;

    return Response.json({
      connected: true,
      account,
      repos,
      selectedRepoId: selectedRepo?.id ?? null,
      selectedRepoFullName: selectedRepo?.fullName ?? projectRepository ?? savedSelection?.repoFullName ?? null,
      selectedBranch:
        (typeof metadata.sourceBranch === 'string' && metadata.sourceBranch) ||
        snapshot.currentBranch ||
        selectedRepo?.defaultBranch ||
        'main',
      remoteUrl:
        (typeof metadata.sourceUrl === 'string' && metadata.sourceUrl) ||
        snapshot.remoteUrl ||
        selectedRepo?.htmlUrl ||
        null,
      isGitRepo: snapshot.isGitRepo,
      changes: snapshot.changes,
    });
  } catch (error) {
    return Response.json(
      {
        connected: true,
        account: null,
        repos: [],
        selectedRepoId: null,
        selectedRepoFullName: projectRepository,
        selectedBranch:
          (typeof metadata.sourceBranch === 'string' && metadata.sourceBranch) || snapshot.currentBranch || 'main',
        remoteUrl: (typeof metadata.sourceUrl === 'string' && metadata.sourceUrl) || snapshot.remoteUrl || null,
        isGitRepo: snapshot.isGitRepo,
        changes: snapshot.changes,
        error: error instanceof Error ? error.message : 'Failed to load GitHub connection state.',
      },
      { status: 200 },
    );
  }
}
