import { put } from '@vercel/blob';
import type { PaintingBlobUploadResult, PaintingNormalizedOutput, PaintingProvider, PaintingRawOutput } from './types.ts';

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/jpeg') return 'jpg';
  return 'bin';
}

function sanitizeBlobPath(value: string) {
  return value.replace(/[^a-zA-Z0-9._/-]/g, '-');
}

async function loadRemoteBody(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch remote painting asset: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function normalizePaintingOutputs({
  runId,
  provider,
  items,
}: {
  runId: string;
  provider: PaintingProvider;
  items: PaintingRawOutput[];
}): Promise<PaintingNormalizedOutput[]> {
  return Promise.all(
    items.map(async (item, index) => {
      const body = item.b64 ? Buffer.from(item.b64, 'base64') : item.url ? await loadRemoteBody(item.url) : Buffer.from([]);
      const extension = extensionForMimeType(item.mimeType);

      return {
        contentType: item.mimeType,
        pathname: sanitizeBlobPath(`paintings/${runId}/output-${index + 1}.${extension}`),
        body,
        provider,
        sourceUrl: item.url ?? null,
        revisedPrompt: item.revisedPrompt ?? null,
        width: item.width ?? null,
        height: item.height ?? null,
      };
    }),
  );
}

export async function uploadPaintingBlob(file: PaintingNormalizedOutput): Promise<PaintingBlobUploadResult> {
  const blob = await put(file.pathname, file.body, {
    access: 'public',
    addRandomSuffix: true,
    allowOverwrite: false,
    contentType: file.contentType,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
  };
}
