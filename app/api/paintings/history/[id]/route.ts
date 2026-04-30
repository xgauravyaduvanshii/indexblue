import { del as blobDel } from '@vercel/blob';
import { getUser } from '@/lib/auth-utils';
import { deletePaintingRunById, getPaintingRunById } from '@/lib/db/painting-queries';

export const runtime = 'nodejs';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const run = await getPaintingRunById({
    runId: id,
    userId: user.id,
  });

  if (!run) {
    return Response.json({ error: 'Run not found' }, { status: 404 });
  }

  await Promise.all(run.assets.map((asset) => blobDel(asset.storageUrl).catch(() => undefined)));
  await deletePaintingRunById({
    runId: id,
    userId: user.id,
  });

  return Response.json({ ok: true });
}
