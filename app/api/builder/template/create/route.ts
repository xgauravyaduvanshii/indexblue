import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';

export const runtime = 'nodejs';

const templateSchema = z.object({
  templateId: z.enum(['next-app', 'static-site', 'node-api']),
});

const TEMPLATES = {
  'next-app': {
    name: 'Next App Starter',
    slug: 'next-app-starter',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'next-app-starter',
          private: true,
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
          },
        },
        null,
        2,
      ),
      'README.md': '# Next App Starter\n\nA simple template scaffold created from Indexblue Builder.\n',
      'app/page.tsx': `export default function HomePage() {
  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <h1>Next App Starter</h1>
      <p>Your template workspace is ready.</p>
    </main>
  );
}
`,
    },
  },
  'static-site': {
    name: 'Static Site',
    slug: 'static-site-starter',
    files: {
      'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Static Site Starter</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="shell">
      <h1>Static Site Starter</h1>
      <p>Created from the Indexblue web template card.</p>
    </main>
  </body>
</html>
`,
      'styles.css': `:root {
  color-scheme: dark;
  --bg: #0d1320;
  --panel: rgba(255, 255, 255, 0.08);
  --text: #f5f7fb;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at top, #2d4d7a, var(--bg) 55%);
  color: var(--text);
  font-family: sans-serif;
}

.shell {
  padding: 32px;
  border-radius: 24px;
  background: var(--panel);
  backdrop-filter: blur(18px);
}
`,
    },
  },
  'node-api': {
    name: 'Node API',
    slug: 'node-api-starter',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'node-api-starter',
          private: true,
          type: 'module',
          scripts: {
            dev: 'node server.js',
          },
        },
        null,
        2,
      ),
      'server.js': `import http from 'node:http';

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ ok: true, route: request.url }));
});

server.listen(3000, () => {
  console.log('Node API starter listening on http://localhost:3000');
});
`,
      'README.md': '# Node API Starter\n\nA lightweight Node server scaffold created from Indexblue Builder.\n',
    },
  },
} as const;

async function writeTemplateFiles(rootDir: string, files: Record<string, string>) {
  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const absolutePath = path.join(rootDir, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf8');
    }),
  );
}

export async function POST(request: Request) {
  const parsed = templateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return Response.json({ error: 'Invalid template payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const template = TEMPLATES[parsed.data.templateId];
    const baseDir = path.join(tmpdir(), 'indexblue-builder-workspaces', 'web-templates', `${template.slug}-${Date.now()}`);
    await mkdir(baseDir, { recursive: true });
    await writeTemplateFiles(baseDir, template.files);

    return Response.json({
      ok: true,
      templateId: parsed.data.templateId,
      templateName: template.name,
      createdPath: baseDir,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create template workspace.',
      },
      { status: 500 },
    );
  }
}
