import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

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
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const extractedPath = searchParams.get('extractedPath');
  const relativePath = searchParams.get('relativePath');

  if (!extractedPath || !relativePath) {
    return Response.json({ error: 'extractedPath and relativePath are required.' }, { status: 400 });
  }

  const resolvedBase = path.resolve(extractedPath);
  const resolvedFile = path.resolve(extractedPath, relativePath);

  if (!resolvedFile.startsWith(`${resolvedBase}${path.sep}`) && resolvedFile !== resolvedBase) {
    return Response.json({ error: 'Invalid file path.' }, { status: 400 });
  }

  const extension = path.extname(relativePath).toLowerCase();
  if (!TEXT_FILE_EXTENSIONS.has(extension) && !path.basename(relativePath).startsWith('.')) {
    return Response.json({ error: 'Preview is only available for text files.' }, { status: 400 });
  }

  try {
    const content = await readFile(resolvedFile, 'utf8');
    return Response.json({ content });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to read file.',
      },
      { status: 500 },
    );
  }
}
