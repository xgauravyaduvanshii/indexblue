import { getUser } from '@/lib/auth-utils';
import { listPaintingRunsByUserId } from '@/lib/db/painting-queries';

export const runtime = 'nodejs';

function serializeRun(run: Awaited<ReturnType<typeof listPaintingRunsByUserId>>[number]) {
  return {
    ...run,
    inputs: run.assets.filter((asset) => asset.role === 'input'),
    outputs: run.assets.filter((asset) => asset.role === 'output'),
  };
}

export async function GET() {
  try {
    const user = await getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const runs = await listPaintingRunsByUserId({
      userId: user.id,
    });

    return Response.json({
      runs: runs.map(serializeRun),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load painting history',
      },
      { status: 500 },
    );
  }
}
