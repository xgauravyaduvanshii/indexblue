import 'server-only';

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type BuilderWorkspaceNode = {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: BuilderWorkspaceNode[];
};

export type BuilderWorkspaceFileEntry = {
  path: string;
  content: Uint8Array;
};

export type BuilderWorkspaceFileKind = 'text' | 'image' | 'audio' | 'video' | 'pdf' | 'binary';

export type BuilderWorkspaceFileReadResult = {
  content: string | null;
  kind: BuilderWorkspaceFileKind;
  mimeType: string;
  size: number;
};

export type BuilderWorkspaceBinaryFileReadResult = {
  content: Uint8Array;
  kind: BuilderWorkspaceFileKind;
  mimeType: string;
  size: number;
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
  '.svg',
  '.dockerfile',
  '.conf',
  '.config',
  '.log',
  '.lock',
  '.csv',
  '.tsx',
]);

const TEXT_FILE_BASENAMES = new Set([
  'Dockerfile',
  'Makefile',
  'Procfile',
  'Gemfile',
  'Podfile',
  'Brewfile',
  'Rakefile',
  'Jenkinsfile',
  'Vagrantfile',
  'README',
  'LICENSE',
  'requirements',
  'requirements.txt',
]);

const IMAGE_FILE_EXTENSIONS: Record<string, string> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

const AUDIO_FILE_EXTENSIONS: Record<string, string> = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.weba': 'audio/webm',
};

const VIDEO_FILE_EXTENSIONS: Record<string, string> = {
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.ogv': 'video/ogg',
  '.webm': 'video/webm',
};

const DOCUMENT_FILE_EXTENSIONS: Record<string, string> = {
  '.pdf': 'application/pdf',
};

const TEXT_MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.env': 'text/plain; charset=utf-8',
  '.gitignore': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.ini': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  '.sh': 'text/x-shellscript; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.toml': 'text/plain; charset=utf-8',
  '.ts': 'text/typescript; charset=utf-8',
  '.tsx': 'text/typescript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.yaml': 'application/yaml; charset=utf-8',
  '.yml': 'application/yaml; charset=utf-8',
};

function getWorkspaceExtension(relativePath: string) {
  return path.extname(relativePath).toLowerCase();
}

function getWorkspaceBasename(relativePath: string) {
  return path.basename(relativePath);
}

export function isTextWorkspaceFile(relativePath: string) {
  const extension = getWorkspaceExtension(relativePath);
  const basename = getWorkspaceBasename(relativePath);
  return TEXT_FILE_EXTENSIONS.has(extension) || TEXT_FILE_BASENAMES.has(basename) || basename.startsWith('.');
}

export function getWorkspaceFileMimeType(relativePath: string) {
  const extension = getWorkspaceExtension(relativePath);

  if (TEXT_MIME_TYPES[extension]) return TEXT_MIME_TYPES[extension];
  if (IMAGE_FILE_EXTENSIONS[extension]) return IMAGE_FILE_EXTENSIONS[extension];
  if (AUDIO_FILE_EXTENSIONS[extension]) return AUDIO_FILE_EXTENSIONS[extension];
  if (VIDEO_FILE_EXTENSIONS[extension]) return VIDEO_FILE_EXTENSIONS[extension];
  if (DOCUMENT_FILE_EXTENSIONS[extension]) return DOCUMENT_FILE_EXTENSIONS[extension];

  if (isTextWorkspaceFile(relativePath)) {
    return 'text/plain; charset=utf-8';
  }

  return 'application/octet-stream';
}

function isProbablyBinaryContent(content: Uint8Array) {
  const sample = content.subarray(0, Math.min(content.byteLength, 1024));
  let suspiciousBytes = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }

    if (byte < 7 || (byte > 14 && byte < 32)) {
      suspiciousBytes += 1;
    }
  }

  return sample.length > 0 && suspiciousBytes / sample.length > 0.18;
}

export function getWorkspaceFileKind(relativePath: string, content: Uint8Array): BuilderWorkspaceFileKind {
  const extension = getWorkspaceExtension(relativePath);

  if (IMAGE_FILE_EXTENSIONS[extension] && extension !== '.svg') return 'image';
  if (AUDIO_FILE_EXTENSIONS[extension]) return 'audio';
  if (VIDEO_FILE_EXTENSIONS[extension]) return 'video';
  if (DOCUMENT_FILE_EXTENSIONS[extension]) return 'pdf';
  if (isTextWorkspaceFile(relativePath)) return 'text';

  return isProbablyBinaryContent(content) ? 'binary' : 'text';
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

export async function collectWorkspaceFiles(
  rootDir: string,
  currentDir = rootDir,
): Promise<BuilderWorkspaceFileEntry[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: BuilderWorkspaceFileEntry[] = [];

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;

    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath) || entry.name;

    if (entry.isDirectory()) {
      files.push(...(await collectWorkspaceFiles(rootDir, absolutePath)));
      continue;
    }

    files.push({
      path: relativePath,
      content: await readFile(absolutePath),
    });
  }

  return files;
}

export async function readWorkspaceTextFile(rootDir: string, relativePath: string) {
  if (!isTextWorkspaceFile(relativePath)) {
    throw new Error('Preview is only available for text files.');
  }

  const { resolvedTarget } = resolveWorkspacePath(rootDir, relativePath);
  return readFile(resolvedTarget, 'utf8');
}

export async function readWorkspaceFile(
  rootDir: string,
  relativePath: string,
): Promise<BuilderWorkspaceFileReadResult> {
  const { resolvedTarget } = resolveWorkspacePath(rootDir, relativePath);
  const content = await readFile(resolvedTarget);
  const kind = getWorkspaceFileKind(relativePath, content);

  return {
    content: kind === 'text' ? Buffer.from(content).toString('utf8') : null,
    kind,
    mimeType: getWorkspaceFileMimeType(relativePath),
    size: content.byteLength,
  };
}

export async function readWorkspaceBinaryFile(
  rootDir: string,
  relativePath: string,
): Promise<BuilderWorkspaceBinaryFileReadResult> {
  const { resolvedTarget } = resolveWorkspacePath(rootDir, relativePath);
  const content = await readFile(resolvedTarget);

  return {
    content,
    kind: getWorkspaceFileKind(relativePath, content),
    mimeType: getWorkspaceFileMimeType(relativePath),
    size: content.byteLength,
  };
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
