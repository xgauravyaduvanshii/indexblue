import 'server-only';

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type BuilderWorkspaceNode = {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: BuilderWorkspaceNode[];
};

const TEXT_FILE_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.css',
  '.html',
  '.xml',
  '.yml',
  '.yaml',
  '.env',
  '.sh',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.go',
  '.rs',
  '.php',
  '.sql',
  '.toml',
  '.ini',
  '.gitignore',
  '.mjs',
  '.cjs',
]);

export function isTextWorkspaceFile(relativePath: string) {
  const extension = path.extname(relativePath).toLowerCase();
  return TEXT_FILE_EXTENSIONS.has(extension) || path.basename(relativePath).startsWith('.');
}

export function resolveWorkspacePath(basePath: string, relativePath?: string | null) {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = relativePath ? path.resolve(basePath, relativePath) : resolvedBase;

  if (!resolvedTarget.startsWith(`${resolvedBase}${path.sep}`) && resolvedTarget !== resolvedBase) {
    throw new Error('Invalid workspace path.');
  }

  return {
    resolvedBase,
    resolvedTarget,
  };
}

export async function buildWorkspaceTree(rootDir: string, currentDir = rootDir): Promise<BuilderWorkspaceNode[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  return Promise.all(
    entries
      .filter((entry) => entry.name !== '.git' && entry.name !== 'node_modules')
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map(async (entry) => {
        const absolutePath = path.join(currentDir, entry.name);
        const relativePath = path.relative(rootDir, absolutePath) || entry.name;

        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: relativePath,
            type: 'folder' as const,
            children: await buildWorkspaceTree(rootDir, absolutePath),
          };
        }

        return {
          name: entry.name,
          path: relativePath,
          type: 'file' as const,
        };
      }),
  );
}

export async function readWorkspaceTextFile(rootDir: string, relativePath: string) {
  if (!isTextWorkspaceFile(relativePath)) {
    throw new Error('Preview is only available for text files.');
  }

  const { resolvedTarget } = resolveWorkspacePath(rootDir, relativePath);
  return readFile(resolvedTarget, 'utf8');
}

export async function writeWorkspaceTextFile(rootDir: string, relativePath: string, content: string) {
  if (!isTextWorkspaceFile(relativePath)) {
    throw new Error('Editing is only available for text files.');
  }

  const { resolvedTarget } = resolveWorkspacePath(rootDir, relativePath);
  await writeFile(resolvedTarget, content, 'utf8');
}

export async function createWorkspaceEntry(
  rootDir: string,
  relativePath: string,
  type: 'file' | 'folder',
  content = '',
) {
  const { resolvedTarget } = resolveWorkspacePath(rootDir, relativePath);

  if (type === 'folder') {
    await mkdir(resolvedTarget, { recursive: true });
    return;
  }

  if (!isTextWorkspaceFile(relativePath)) {
    throw new Error('Only text files can be created from the workspace editor.');
  }

  await mkdir(path.dirname(resolvedTarget), { recursive: true });
  await writeFile(resolvedTarget, content, 'utf8');
}

export async function renameWorkspaceEntry(rootDir: string, relativePath: string, nextRelativePath: string) {
  const { resolvedTarget } = resolveWorkspacePath(rootDir, relativePath);
  const { resolvedTarget: resolvedNextTarget } = resolveWorkspacePath(rootDir, nextRelativePath);

  await mkdir(path.dirname(resolvedNextTarget), { recursive: true });
  await rename(resolvedTarget, resolvedNextTarget);
}

export async function deleteWorkspaceEntry(rootDir: string, relativePath: string) {
  const { resolvedTarget, resolvedBase } = resolveWorkspacePath(rootDir, relativePath);

  if (resolvedTarget === resolvedBase) {
    throw new Error('Cannot delete the workspace root.');
  }

  await rm(resolvedTarget, { recursive: true, force: true });
}
