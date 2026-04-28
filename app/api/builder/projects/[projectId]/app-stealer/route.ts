import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireBuilderProjectAccess } from '@/lib/builder/project-context';
import { researchReferenceApp } from '@/lib/builder/app-stealer-runtime';
import { createBuilderProjectJob, upsertBuilderProjectToolState } from '@/lib/db/builder-app-queries';
import { appendProjectJobLog, markProjectJobCompleted, markProjectJobFailed } from '@/lib/builder/app-runtime';

export const runtime = 'nodejs';

const schema = z.object({
  input: z.string().min(1),
  inputType: z.enum(['name', 'appstore', 'playstore', 'website']),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid app stealer payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const job = await createBuilderProjectJob({
    projectId: access.project.id,
    userId: access.session.user.id,
    kind: 'app-stealer',
    title: `Research ${parsed.data.input}`,
    provider: 'firecrawl',
    status: 'running',
    payload: parsed.data,
  });

  if (!job) {
    return Response.json({ error: 'Failed to create app stealer job.' }, { status: 500 });
  }

  try {
    await appendProjectJobLog({
      jobId: job.id,
      projectId: access.project.id,
      userId: access.session.user.id,
      channel: 'app-stealer',
      type: 'research.started',
      level: 'info',
      message: `Researching ${parsed.data.input}`,
    });

    const result = await researchReferenceApp(parsed.data);

    await upsertBuilderProjectToolState({
      projectId: access.project.id,
      userId: access.session.user.id,
      toolId: 'app-stealer',
      state: {
        input: parsed.data.input,
        inputType: parsed.data.inputType,
        result: result.data,
        summary: result.summary,
        systemPrompt: result.systemPrompt,
        pages: result.pages,
        updatedAt: new Date().toISOString(),
      },
    });

    await markProjectJobCompleted({
      jobId: job.id,
      projectId: access.project.id,
      userId: access.session.user.id,
      channel: 'app-stealer',
      type: 'research.completed',
      message: `Research completed for ${result.data.name}`,
      result: {
        summary: result.summary,
        name: result.data.name,
        referenceUrls: result.data.referenceUrls,
      },
    });

    return Response.json({
      jobId: job.id,
      result,
    });
  } catch (error) {
    await markProjectJobFailed({
      jobId: job.id,
      projectId: access.project.id,
      userId: access.session.user.id,
      channel: 'app-stealer',
      type: 'research.failed',
      error,
    });

    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to research the reference app.',
      },
      { status: 500 },
    );
  }
}
