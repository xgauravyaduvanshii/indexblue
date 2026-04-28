import { NextRequest } from 'next/server';
import { generateText } from 'ai';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { scira } from '@/ai/providers';
import { serverEnv } from '@/env/server';
import { getBuilderProjectByIdForUser } from '@/lib/db/builder-project-queries';

export const runtime = 'nodejs';

const canvasRequestSchema = z.object({
  prompt: z.string().min(1),
  mode: z.enum(['create', 'regenerate']).default('create'),
  themeId: z.string().optional(),
  selectedFilePath: z.string().nullable().optional(),
  selectedFileContent: z.string().nullable().optional(),
  selectedCanvasContext: z.string().nullable().optional(),
  selectedFrame: z
    .object({
      id: z.string().optional(),
      title: z.string(),
      kind: z.enum(['preview', 'html']),
      source: z.string(),
    })
    .nullable()
    .optional(),
});

function trimContext(value: string | null | undefined, max = 12000) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}\n...` : value;
}

function extractTaggedBlock(text: string, tag: string) {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match?.[1]?.trim() ?? null;
}

function stripCodeFence(text: string) {
  return text
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

async function fetchUnsplashImage(query: string) {
  if (!serverEnv.UNSPLASH_ACCESS_KEY) return null;

  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'portrait');
  url.searchParams.set('per_page', '1');
  url.searchParams.set('client_id', serverEnv.UNSPLASH_ACCESS_KEY);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Version': 'v1',
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as {
    results?: Array<{
      urls?: { regular?: string };
      alt_description?: string | null;
      user?: { name?: string | null };
    }>;
  } | null;
  const result = payload?.results?.[0];
  const imageUrl = result?.urls?.regular;

  if (!imageUrl) return null;

  return {
    url: imageUrl,
    alt: result?.alt_description || query,
    credit: result?.user?.name || null,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = canvasRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid canvas request', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId } = await params;
  const project = await getBuilderProjectByIdForUser({
    projectId,
    userId: session.user.id,
  });

  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  const { prompt, mode, selectedFilePath, selectedFileContent, selectedCanvasContext, selectedFrame } = parsed.data;

  const projectContext = [
    `Project: ${project.name}`,
    `Source type: ${project.sourceType}`,
    project.workspacePath ? `Workspace available: yes` : `Workspace available: no`,
    selectedFilePath ? `Focused file: ${selectedFilePath}` : null,
    selectedCanvasContext ? `Canvas selection attached: yes` : null,
    selectedFrame ? `Selected frame title: ${selectedFrame.title}` : null,
    selectedFrame ? `Selected frame kind: ${selectedFrame.kind}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const selectedFileBlock =
    selectedFilePath && selectedFileContent
      ? `\nFocused file content:\n<selected_file path="${selectedFilePath}">\n${trimContext(selectedFileContent)}\n</selected_file>\n`
      : '';

  const selectedFrameBlock = selectedFrame
    ? `\nExisting frame:\n<existing_frame title="${selectedFrame.title}" kind="${selectedFrame.kind}">\n${trimContext(selectedFrame.source)}\n</existing_frame>\n`
    : '';
  const selectedCanvasBlock = selectedCanvasContext
    ? `\nSelected canvas items:\n<selected_canvas>\n${trimContext(selectedCanvasContext, 4000)}\n</selected_canvas>\n`
    : '';

  const system = `You create polished visual app screens for a builder canvas.

Return XML-like blocks and nothing else:
<title>Short frame title</title>
<canvas_html>HTML fragment only</canvas_html>
Optionally, when a real photographic image would improve the frame, also return:
<unsplash_query>short photo search query</unsplash_query>

Rules:
- Return a single self-contained HTML fragment for the inside of the page body.
- Use Tailwind utility classes only.
- No markdown fences unless unavoidable.
- No <html>, <head>, <body>, <script>, or <style> tags.
- No external data fetching.
- Make the result visually rich and production-grade.
- Prefer desktop app / dashboard / landing-section style layouts that look great inside a 420px wide device frame.
- Keep spacing intentional and avoid generic boilerplate.
- Only request Unsplash if a real photo materially improves the design.
- If you return <unsplash_query>, use {{UNSPLASH_IMAGE}} as the image src inside the HTML.
- If selected canvas items are provided, use them as concrete visual context for the new result.
- If mode is regenerate, preserve the original screen's intent while applying the user's requested changes.`;

  const userPrompt = `
Mode: ${mode}

Project context:
${projectContext}
${selectedFileBlock}
${selectedCanvasBlock}
${selectedFrameBlock}

User request:
${prompt}
`;

  try {
    const { text } = await generateText({
      model: scira.languageModel('scira-code'),
      system,
      prompt: userPrompt,
      temperature: 0.7,
      maxOutputTokens: 5000,
    });

    const title =
      extractTaggedBlock(text, 'title') || (mode === 'regenerate' ? selectedFrame?.title : null) || 'Canvas Frame';
    const unsplashQuery = extractTaggedBlock(text, 'unsplash_query');
    let htmlBlock = extractTaggedBlock(text, 'canvas_html') || stripCodeFence(text);

    if (unsplashQuery && htmlBlock.includes('{{UNSPLASH_IMAGE}}')) {
      const image = await fetchUnsplashImage(unsplashQuery);
      if (image?.url) {
        htmlBlock = htmlBlock.replaceAll('{{UNSPLASH_IMAGE}}', image.url);
      }
    }

    if (!htmlBlock) {
      return Response.json({ error: 'The AI did not return canvas HTML.' }, { status: 500 });
    }

    return Response.json({
      title,
      html: htmlBlock,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate canvas frame.',
      },
      { status: 500 },
    );
  }
}
