import { getUser } from '@/lib/auth-utils';
import { getPaintingAssetById } from '@/lib/db/painting-queries';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const asset = await getPaintingAssetById({
    assetId: id,
    userId: user.id,
  });

  if (!asset) {
    return Response.json({ error: 'Asset not found' }, { status: 404 });
  }

  return Response.json({ asset });
}
