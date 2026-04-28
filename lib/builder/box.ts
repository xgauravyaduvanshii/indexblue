import 'server-only';

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Agent, Box, ClaudeCode, type Runtime } from '@upstash/box';
import { serverEnv } from '@/env/server';
import { getUserMcpServersByUserId } from '@/lib/db/queries';
import { resolveMcpAuthHeaders } from '@/lib/mcp/auth-headers';

const execFileAsync = promisify(execFile);

export const DEFAULT_BUILDER_RUNTIME: Runtime = 'node';
export const BUILDER_BOX_ROOT = '/workspace/home';
export const BUILDER_REMOTE_PROJECT_PATH = `${BUILDER_BOX_ROOT}/project`;

export async function reconnectBuilderBox(boxId: string) {
  const box = await Box.get(boxId, {
    apiKey: serverEnv.UPSTASH_BOX_API_KEY!,
  });

  await box.resume().catch(() => undefined);
  return box;
}

async function loadBuilderMcpServers(userId: string) {
  const enabledServers = await getUserMcpServersByUserId({
    userId,
    enabledOnly: true,
  });

  const mcpServers = await Promise.all(
    enabledServers.map(async (server) => ({
      name: server.name,
      url: server.url,
      headers: await resolveMcpAuthHeaders({ server, userId }),
    })),
  );

  return {
    mcpServers,
    mcpServerNames: mcpServers.map((server) => server.name),
    hasVercelMcp: enabledServers.some(
      (server) => server.authType === 'oauth' && server.oauthAuthorizationUrl?.includes('vercel.com'),
    ),
  };
}

export async function createBuilderBox({
  userId,
  runtime = DEFAULT_BUILDER_RUNTIME,
}: {
  userId: string;
  runtime?: Runtime;
}) {
  const { mcpServers, mcpServerNames, hasVercelMcp } = await loadBuilderMcpServers(userId);
  const box = await Box.create({
    apiKey: serverEnv.UPSTASH_BOX_API_KEY!,
    runtime,
    agent: {
      model: ClaudeCode.Sonnet_4_6,
      runner: Agent.ClaudeCode,
    },
    skills: [
      'vercel-labs/skills/find-skills',
      'anthropics/skills/frontend-design',
      'vercel-labs/agent-skills/vercel-react-best-practices',
      'vercel-labs/agent-skills/web-design-guidelines',
      'shubhamsaboo/awesome-llm-apps/python-expert',
      'fastapi/fastapi/fastapi',
    ],
    mcpServers: [{ name: 'web-search', package: '@anthropic/mcp-web-search' }, ...mcpServers],
  });

  return {
    box,
    mcpServerNames,
    hasVercelMcp,
  };
}

export async function ensureBuilderBox({
  userId,
  existingBoxId,
  runtime = DEFAULT_BUILDER_RUNTIME,
}: {
  userId: string;
  existingBoxId?: string | null;
  runtime?: Runtime;
}) {
  if (existingBoxId) {
    try {
      const box = await reconnectBuilderBox(existingBoxId);
      return {
        box,
        isNew: false,
        mcpServerNames: [] as string[],
        hasVercelMcp: false,
      };
    } catch (error) {
      console.warn(`🔨 [Build] Failed to reconnect to Box ${existingBoxId}, creating a new one:`, error);
    }
  }

  const created = await createBuilderBox({ userId, runtime });
  return {
    ...created,
    isNew: true,
  };
}

export async function installBunInBuilderBox(box: Box) {
  await box.exec.command(
    'curl -fsSL https://bun.sh/install | bash && ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun 2>/dev/null || true',
  );
}

export async function seedBuilderWorkspace(box: Box, seedWorkspacePath?: string | null) {
  if (!seedWorkspacePath) return false;

  let tempDir: string | null = null;

  try {
    tempDir = await mkdtemp(path.join(tmpdir(), 'indexblue-builder-seed-'));
    const archivePath = path.join(tempDir, 'workspace.tgz');
    await execFileAsync('tar', ['-czf', archivePath, '-C', seedWorkspacePath, '.']);
    const archiveBuffer = await readFile(archivePath);
    const archiveBase64 = archiveBuffer.toString('base64');
    const remoteBase64Path = `${BUILDER_BOX_ROOT}/_builder_workspace.tgz.b64`;
    const remoteArchivePath = `${BUILDER_BOX_ROOT}/_builder_workspace.tgz`;

    await box.files.write({
      path: remoteBase64Path,
      content: archiveBase64,
    });
    await box.exec.command(
      [
        `mkdir -p "${BUILDER_REMOTE_PROJECT_PATH}"`,
        `base64 -d "${remoteBase64Path}" > "${remoteArchivePath}"`,
        `tar -xzf "${remoteArchivePath}" -C "${BUILDER_REMOTE_PROJECT_PATH}"`,
        `rm -f "${remoteBase64Path}" "${remoteArchivePath}"`,
      ].join(' && '),
    );

    return true;
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export function getDefaultBuilderRemoteCwd(hasWorkspace: boolean) {
  return hasWorkspace ? BUILDER_REMOTE_PROJECT_PATH : BUILDER_BOX_ROOT;
}
