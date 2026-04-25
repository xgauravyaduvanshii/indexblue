import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const runtime = 'nodejs';

type TreeNode = {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
};

async function buildTree(rootDir: string, currentDir = rootDir): Promise<TreeNode[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const nodes = await Promise.all(
    entries
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
            children: await buildTree(rootDir, absolutePath),
          };
        }

        return {
          name: entry.name,
          path: relativePath,
          type: 'file' as const,
        };
      }),
  );

  return nodes;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return Response.json({ error: 'ZIP file is required.' }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith('.zip')) {
    return Response.json({ error: 'Only .zip files are supported.' }, { status: 400 });
  }

  let workDir: string | null = null;

  try {
    workDir = await mkdtemp(path.join(tmpdir(), 'indexblue-zip-import-'));
    const uploadsDir = path.join(workDir, 'upload');
    const extractedDir = path.join(workDir, 'extracted');

    await mkdir(uploadsDir, { recursive: true });
    await mkdir(extractedDir, { recursive: true });

    const zipPath = path.join(uploadsDir, file.name);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await writeFile(zipPath, fileBuffer);

    await execFileAsync('unzip', ['-q', zipPath, '-d', extractedDir]);

    const extractedStats = await stat(extractedDir);
    if (!extractedStats.isDirectory()) {
      throw new Error('Failed to extract ZIP archive.');
    }

    const tree = await buildTree(extractedDir);

    return Response.json({
      extractedPath: extractedDir,
      archiveName: file.name,
      tree,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to import ZIP archive.',
      },
      { status: 500 },
    );
  } finally {
    if (workDir) {
      await rm(path.join(workDir, 'upload'), { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
