import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';

export const runtime = 'nodejs';

const createFolderSchema = z.object({
  folderName: z.string().min(1),
  space: z.enum(['workspace', 'projects', 'sandbox']),
});

function sanitizeFolderName(folderName: string) {
  return folderName
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function ensureUniqueFolder(baseDir: string, folderName: string) {
  let candidateName = folderName;
  let attempt = 1;

  while (true) {
    const candidatePath = path.join(baseDir, candidateName);

    try {
      await mkdir(candidatePath);
      return candidatePath;
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code !== 'EEXIST') {
        throw error;
      }
      attempt += 1;
      candidateName = `${folderName}-${attempt}`;
    }
  }
}

export async function POST(request: Request) {
  const parsed = createFolderSchema.safeParse(await request.json());

  if (!parsed.success) {
    return Response.json({ error: 'Invalid folder payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const safeFolderName = sanitizeFolderName(parsed.data.folderName);
  if (!safeFolderName) {
    return Response.json({ error: 'Please enter a valid folder name.' }, { status: 400 });
  }

  try {
    const rootDir = path.join(tmpdir(), 'indexblue-builder-workspaces', 'local', parsed.data.space);
    await mkdir(rootDir, { recursive: true });
    const createdPath = await ensureUniqueFolder(rootDir, safeFolderName);

    return Response.json({
      ok: true,
      folderName: path.basename(createdPath),
      createdPath,
      space: parsed.data.space,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create folder.',
      },
      { status: 500 },
    );
  }
}
