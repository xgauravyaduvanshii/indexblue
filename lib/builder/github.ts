import 'server-only';

import { execFile } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { account, builderGithubRepoSelection } from '@/lib/db/schema';

const execFileAsync = promisify(execFile);

export type GitHubViewer = {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  htmlUrl: string;
  email: string | null;
};

export type GitHubRepoSummary = {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  cloneUrl: string;
  private: boolean;
  defaultBranch: string;
};

export type WorkspaceGitChange = {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'typechange' | 'untracked';
  staged: boolean;
  unstaged: boolean;
  originalPath: string | null;
};

export type WorkspaceGitSnapshot = {
  isGitRepo: boolean;
  currentBranch: string | null;
  remoteUrl: string | null;
  changes: WorkspaceGitChange[];
};

async function readTrimmedCommandOutput(command: string, args: string[], cwd: string) {
  const result = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 1024 * 1024 * 8,
  });

  return result.stdout.trim();
}

function mapGitStatusCode(code: string): WorkspaceGitChange['status'] {
  if (code === '??') return 'untracked';
  if (code.includes('R')) return 'renamed';
  if (code.includes('C')) return 'copied';
  if (code.includes('D')) return 'deleted';
  if (code.includes('T')) return 'typechange';
  if (code.includes('A')) return 'added';
  return 'modified';
}

function parseGitStatusLine(line: string): WorkspaceGitChange | null {
  if (!line.trim()) return null;

  const code = line.slice(0, 2);
  const rawPath = line.slice(3).trim();
  const renameParts = rawPath.split(' -> ');
  const originalPath = renameParts.length > 1 ? (renameParts[0] ?? null) : null;
  const pathValue = renameParts.length > 1 ? (renameParts[renameParts.length - 1] ?? rawPath) : rawPath;

  return {
    path: pathValue,
    status: mapGitStatusCode(code),
    staged: code[0] !== ' ' && code[0] !== '?',
    unstaged: code[1] !== ' ' && code[1] !== '?',
    originalPath,
  };
}

async function collectWorkspaceFiles(rootDir: string, currentDir = rootDir): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.next') {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);

    if (entry.isDirectory()) {
      files.push(...(await collectWorkspaceFiles(rootDir, absolutePath)));
      continue;
    }

    files.push(relativePath);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

export function slugifyRepositoryName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export function normalizeRepositoryInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return '';

  if (trimmed.startsWith('https://github.com/')) {
    const parts = trimmed.replace('https://github.com/', '').split('/');
    const owner = parts[0];
    const repo = parts[1];

    if (owner && repo) {
      return `${owner}/${repo.replace(/\.git$/, '')}`;
    }
  }

  if (/^git@github\.com:/i.test(trimmed)) {
    return trimmed.replace(/^git@github\.com:/i, '').replace(/\.git$/, '');
  }

  return trimmed.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
}

export function parseGitHubRepositoryFullName(value: string | null | undefined) {
  const normalized = normalizeRepositoryInput(value ?? '');
  return normalized.includes('/') ? normalized : null;
}

export async function getGitHubAccessTokenForUser(userId: string) {
  const githubAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, 'github')),
    columns: {
      accessToken: true,
    },
  });

  return githubAccount?.accessToken ?? null;
}

export async function getSavedGitHubRepoSelection(userId: string) {
  try {
    return await db.query.builderGithubRepoSelection.findFirst({
      where: eq(builderGithubRepoSelection.userId, userId),
    });
  } catch {
    return null;
  }
}

async function fetchGitHub<T>(accessToken: string, url: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'indexblue-builder',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || `GitHub request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}

export async function fetchGitHubViewer(accessToken: string): Promise<GitHubViewer> {
  const viewer = await fetchGitHub<{
    login: string;
    name: string | null;
    avatar_url: string | null;
    html_url: string;
    email: string | null;
  }>(accessToken, 'https://api.github.com/user');

  return {
    login: viewer.login,
    name: viewer.name,
    avatarUrl: viewer.avatar_url,
    htmlUrl: viewer.html_url,
    email: viewer.email,
  };
}

export async function listGitHubRepos(accessToken: string): Promise<GitHubRepoSummary[]> {
  const repos = await fetchGitHub<
    Array<{
      id: number;
      name: string;
      full_name: string;
      html_url: string;
      private: boolean;
      default_branch: string;
    }>
  >(accessToken, 'https://api.github.com/user/repos?per_page=100&sort=updated');

  return repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
    cloneUrl: `${repo.html_url}.git`,
    private: repo.private,
    defaultBranch: repo.default_branch,
  }));
}

export async function getWorkspaceGitSnapshot(workspacePath: string | null): Promise<WorkspaceGitSnapshot> {
  if (!workspacePath) {
    return {
      isGitRepo: false,
      currentBranch: null,
      remoteUrl: null,
      changes: [],
    };
  }

  const gitPath = path.join(workspacePath, '.git');
  const hasGit = await access(gitPath, fsConstants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (!hasGit) {
    const files = await collectWorkspaceFiles(workspacePath);
    return {
      isGitRepo: false,
      currentBranch: null,
      remoteUrl: null,
      changes: files.slice(0, 200).map((filePath) => ({
        path: filePath,
        status: 'added',
        staged: false,
        unstaged: true,
        originalPath: null,
      })),
    };
  }

  const [statusOutput, currentBranch, remoteUrl] = await Promise.all([
    readTrimmedCommandOutput('git', ['status', '--porcelain=v1', '-uall'], workspacePath).catch(() => ''),
    readTrimmedCommandOutput('git', ['rev-parse', '--abbrev-ref', 'HEAD'], workspacePath).catch(() => ''),
    readTrimmedCommandOutput('git', ['remote', 'get-url', 'origin'], workspacePath).catch(() => ''),
  ]);

  return {
    isGitRepo: true,
    currentBranch: currentBranch || null,
    remoteUrl: remoteUrl || null,
    changes: statusOutput
      .split(/\r?\n/)
      .map(parseGitStatusLine)
      .filter((entry): entry is WorkspaceGitChange => entry !== null)
      .slice(0, 200),
  };
}
