import { NextRequest } from 'next/server';
import { z } from 'zod';
import { markProjectJobCompleted, markProjectJobFailed, streamCommandIntoProjectJob } from '@/lib/builder/app-runtime';
import {
  fetchGitHubViewer,
  getGitHubAccessTokenForUser,
  getWorkspaceGitSnapshot,
  normalizeRepositoryInput,
  parseGitHubRepositoryFullName,
} from '@/lib/builder/github';
import { BUILDER_BOX_ROOT, BUILDER_REMOTE_PROJECT_PATH } from '@/lib/builder/paths';
import { requireBuilderProjectAccess } from '@/lib/builder/project-context';
import { createBuilderProjectJob } from '@/lib/db/builder-app-queries';
import { updateBuilderProjectTheme } from '@/lib/db/builder-project-queries';

export const runtime = 'nodejs';

const schema = z.object({
  repository: z.string().min(1),
  commitMessage: z.string().optional(),
  createIfMissing: z.boolean().optional(),
  branch: z.string().min(1).optional(),
  visibility: z.enum(['private', 'public']).optional(),
});

function sanitizeGitOutput(value: string) {
  return value.replace(/https:\/\/[^@\s]+@github\.com/gi, 'https://[REDACTED]@github.com');
}

function buildGitPushScript({
  workspaceRoot,
  githubToken,
  repository,
  commitMessage,
  branch,
  allowForcePush,
}: {
  workspaceRoot: string;
  githubToken: string;
  repository: string;
  commitMessage: string;
  branch: string;
  allowForcePush: boolean;
}) {
  const remoteUrl = `https://${githubToken}@github.com/${repository}.git`;
  const escapedMessage = commitMessage.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
  const escapedBranch = branch.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
  const fallbackCommand = allowForcePush ? `git push -u origin "${escapedBranch}" --force 2>&1` : 'exit 1';

  return [
    'set -e',
    `cd "${workspaceRoot}"`,
    `git config --global --add safe.directory "${workspaceRoot}" || true`,
    'git config --global user.email "support@indexblue.ai"',
    'git config --global user.name "Indexblue Builder"',
    `git config --global init.defaultBranch "${escapedBranch}"`,
    'test -d .git || git init',
    `git checkout -B "${escapedBranch}"`,
    'touch .gitignore',
    `grep -qxF 'node_modules/' .gitignore || echo 'node_modules/' >> .gitignore`,
    `grep -qxF '.env.local' .gitignore || echo '.env.local' >> .gitignore`,
    'git remote remove origin 2>/dev/null || true',
    `git remote add origin "${remoteUrl}"`,
    'git add .',
    `git commit -m "${escapedMessage}" 2>/dev/null || git commit --allow-empty -m "${escapedMessage}"`,
    `git push -u origin "${escapedBranch}" 2>&1 || ${fallbackCommand}`,
  ].join('\n');
}

async function ensureRemoteRepository({
  githubToken,
  viewerLogin,
  repository,
  createIfMissing,
  visibility,
}: {
  githubToken: string;
  viewerLogin: string;
  repository: string;
  createIfMissing: boolean;
  visibility: 'private' | 'public';
}) {
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new Error('Repository must be in owner/repo format.');
  }

  const existing = await fetch(`https://api.github.com/repos/${repository}`, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'indexblue-builder',
    },
  });

  if (existing.ok) {
    return {
      repository,
      repoUrl: `https://github.com/${repository}`,
    };
  }

  if (!createIfMissing || existing.status !== 404) {
    throw new Error(`Repository ${repository} could not be accessed (${existing.status}).`);
  }

  if (viewerLogin !== owner) {
    throw new Error(`Create the repository under the connected GitHub account (${viewerLogin}).`);
  }

  const createResponse = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'indexblue-builder',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: repo,
      private: visibility !== 'public',
      auto_init: false,
    }),
  });

  if (!createResponse.ok) {
    const payload = await createResponse.json().catch(() => null);
    throw new Error(payload?.message || 'Failed to create the GitHub repository.');
  }

  return {
    repository,
    repoUrl: `https://github.com/${repository}`,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid GitHub push payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const githubAccessToken = await getGitHubAccessTokenForUser(access.session.user.id);
  if (!githubAccessToken) {
    return Response.json({ error: 'GitHub is not connected for this account.' }, { status: 400 });
  }

  const repository = normalizeRepositoryInput(parsed.data.repository);
  if (!repository.includes('/')) {
    return Response.json({ error: 'Repository must be in owner/repo format.' }, { status: 400 });
  }

  const snapshot = await getWorkspaceGitSnapshot(access.project.workspacePath);
  const branch =
    parsed.data.branch?.trim() ||
    (typeof access.project.metadata?.sourceBranch === 'string' && access.project.metadata.sourceBranch) ||
    snapshot.currentBranch ||
    'main';
  const currentRepository = parseGitHubRepositoryFullName(
    typeof access.project.metadata?.sourceUrl === 'string' ? access.project.metadata.sourceUrl : snapshot.remoteUrl,
  );
  const allowForcePush = currentRepository === repository || Boolean(parsed.data.createIfMissing);

  const job = await createBuilderProjectJob({
    projectId: access.project.id,
    userId: access.session.user.id,
    kind: 'github-push',
    title: `Push to ${repository}`,
    provider: 'github',
    status: 'running',
    payload: {
      repository,
      branch,
      visibility: parsed.data.visibility ?? 'private',
      changeCount: snapshot.changes.length,
      changes: snapshot.changes.slice(0, 120),
      commitMessage: parsed.data.commitMessage ?? null,
    },
  });

  if (!job) {
    return Response.json({ error: 'Failed to create GitHub push job.' }, { status: 500 });
  }

  try {
    const viewer = await fetchGitHubViewer(githubAccessToken);
    const repositoryInfo = await ensureRemoteRepository({
      githubToken: githubAccessToken,
      viewerLogin: viewer.login,
      repository,
      createIfMissing: parsed.data.createIfMissing ?? false,
      visibility: parsed.data.visibility ?? 'private',
    });

    const commitMessage =
      parsed.data.commitMessage?.trim() || `Update from Indexblue Builder on ${new Date().toISOString().slice(0, 10)}`;
    const workspaceRoot = access.project.workspacePath ? BUILDER_REMOTE_PROJECT_PATH : BUILDER_BOX_ROOT;
    const script = buildGitPushScript({
      workspaceRoot,
      githubToken: githubAccessToken,
      repository,
      commitMessage,
      branch,
      allowForcePush,
    });

    const result = await streamCommandIntoProjectJob({
      project: access.project,
      userId: access.session.user.id,
      jobId: job.id,
      channel: 'github',
      type: 'push',
      command: `cat <<'INDEXBLUE_GIT_PUSH' >/tmp/indexblue-push.sh\n${script}\nINDEXBLUE_GIT_PUSH\nbash /tmp/indexblue-push.sh`,
      displayCommand: `git push ${repository} ${branch}`,
      transformOutputChunk: sanitizeGitOutput,
      cwd: workspaceRoot,
      reseedWorkspace: true,
    });

    if (result.exitCode !== 0) {
      throw new Error(sanitizeGitOutput(result.output || 'GitHub push failed.'));
    }

    await updateBuilderProjectTheme({
      projectId: access.project.id,
      userId: access.session.user.id,
      theme: access.project.theme ?? null,
      metadata: {
        ...(access.project.metadata ?? {}),
        sourceUrl: repositoryInfo.repoUrl,
        sourceLabel: repositoryInfo.repository,
        sourceBranch: branch,
      },
    });

    await markProjectJobCompleted({
      jobId: job.id,
      projectId: access.project.id,
      userId: access.session.user.id,
      channel: 'github',
      type: 'push.completed',
      message: `Pushed to ${repositoryInfo.repoUrl}`,
      result: {
        repository: repositoryInfo.repository,
        repoUrl: repositoryInfo.repoUrl,
        branch,
        changeCount: snapshot.changes.length,
        output: sanitizeGitOutput(result.output),
      },
    });

    return Response.json({
      jobId: job.id,
      repository: repositoryInfo.repository,
      repoUrl: repositoryInfo.repoUrl,
      branch,
      output: sanitizeGitOutput(result.output),
    });
  } catch (error) {
    await markProjectJobFailed({
      jobId: job.id,
      projectId: access.project.id,
      userId: access.session.user.id,
      channel: 'github',
      type: 'push.failed',
      error,
    });

    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to push this project to GitHub.',
      },
      { status: 500 },
    );
  }
}
