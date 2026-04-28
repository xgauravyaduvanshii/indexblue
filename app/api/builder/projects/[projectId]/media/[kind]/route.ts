import { NextRequest } from 'next/server';
import { z } from 'zod';
import { del as blobDel, put } from '@vercel/blob';
import { requireBuilderProjectAccess } from '@/lib/builder/project-context';
import {
  createBuilderProjectAsset,
  deleteBuilderProjectAsset,
  listBuilderProjectAssets,
  updateBuilderProjectAsset,
} from '@/lib/db/builder-app-queries';
import { generateBuilderAudioAsset, generateBuilderImageAsset, generateBuilderVideoAsset } from '@/lib/builder/media';

export const runtime = 'nodejs';

const generateSchema = z.object({
  action: z.literal('generate'),
  prompt: z.string().min(1),
  size: z.string().optional(),
  quality: z.string().optional(),
  background: z.string().optional(),
  outputFormat: z.enum(['png', 'webp', 'jpeg']).optional(),
  durationSeconds: z.number().int().positive().optional(),
});

const uploadSchema = z.object({
  action: z.literal('upload'),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  base64: z.string().min(1),
});

function sanitizeBlobPath(value: string) {
  return value.replace(/[^a-zA-Z0-9._/-]/g, '-');
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string; kind: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const { kind } = await params;
  if (!['image', 'audio', 'video'].includes(kind)) {
    return Response.json({ error: 'Unsupported media kind.' }, { status: 400 });
  }

  const assets = await listBuilderProjectAssets({
    projectId: access.project.id,
    userId: access.session.user.id,
    kind,
  });

  return Response.json({ assets });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string; kind: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const { kind } = await params;
  const body = await request.json().catch(() => null);

  const parsedGenerate = generateSchema.safeParse(body);
  const parsedUpload = uploadSchema.safeParse(body);

  if (!parsedGenerate.success && !parsedUpload.success) {
    return Response.json({ error: 'Invalid media payload.' }, { status: 400 });
  }

  try {
    if (parsedGenerate.success) {
      const payload = parsedGenerate.data;

      if (kind === 'image') {
        const asset = await generateBuilderImageAsset({
          project: access.project,
          userId: access.session.user.id,
          prompt: payload.prompt,
          size: payload.size,
          quality: payload.quality,
          background: payload.background,
          outputFormat: payload.outputFormat,
        });

        return Response.json({ asset });
      }

      if (kind === 'audio') {
        const asset = await generateBuilderAudioAsset({
          project: access.project,
          userId: access.session.user.id,
          text: payload.prompt,
          durationSeconds: payload.durationSeconds,
        });

        return Response.json({ asset });
      }

      if (kind === 'video') {
        const asset = await generateBuilderVideoAsset({
          project: access.project,
          userId: access.session.user.id,
          prompt: payload.prompt,
          size: payload.size,
        });

        return Response.json({ asset });
      }
    }

    if (parsedUpload.success) {
      const payload = parsedUpload.data;
      const asset = await createBuilderProjectAsset({
        projectId: access.project.id,
        userId: access.session.user.id,
        kind,
        sourceType: 'uploaded',
        status: 'running',
        name: payload.fileName,
        mimeType: payload.contentType,
      });

      if (!asset) {
        throw new Error('Failed to create uploaded asset record.');
      }

      const buffer = Buffer.from(payload.base64, 'base64');
      const blob = await put(
        sanitizeBlobPath(`builder/${access.project.id}/${kind}/${asset.id}-${payload.fileName}`),
        buffer,
        {
          access: 'public',
          addRandomSuffix: true,
          allowOverwrite: false,
          contentType: payload.contentType,
        },
      );

      const updated = await updateBuilderProjectAsset({
        assetId: asset.id,
        projectId: access.project.id,
        userId: access.session.user.id,
        patch: {
          status: 'completed',
          storageUrl: blob.url,
          storageKey: blob.pathname,
          completedAt: new Date(),
        },
      });

      return Response.json({ asset: updated });
    }

    return Response.json({ error: 'Unsupported media action.' }, { status: 400 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create media asset.',
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; kind: string }> },
) {
  const access = await requireBuilderProjectAccess(request, params as Promise<{ projectId: string }>);
  if (access.status !== 200) {
    return access.response;
  }

  const parsed = z
    .object({
      assetId: z.string().min(1),
    })
    .safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json({ error: 'Invalid delete payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const assets = await listBuilderProjectAssets({
    projectId: access.project.id,
    userId: access.session.user.id,
  });
  const asset = assets.find((entry) => entry.id === parsed.data.assetId) ?? null;

  if (!asset) {
    return Response.json({ error: 'Asset not found.' }, { status: 404 });
  }

  if (asset.storageUrl) {
    await blobDel(asset.storageUrl).catch(() => undefined);
  }

  await deleteBuilderProjectAsset({
    assetId: asset.id,
    projectId: access.project.id,
    userId: access.session.user.id,
  });

  return Response.json({ ok: true });
}
