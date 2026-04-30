import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, maindb } from './index';
import { paintingAsset, paintingRun } from './schema';
import { ChatSDKError } from '../errors';
import type { PaintingRepository } from '../paintings/types';

export async function createPaintingRun(input: {
  userId: string;
  provider: string;
  model: string;
  operation: string;
  prompt: string;
  status: 'running';
  requestPayload: Record<string, unknown>;
}) {
  try {
    const [created] = await maindb
      .insert(paintingRun)
      .values({
        userId: input.userId,
        provider: input.provider,
        model: input.model,
        operation: input.operation,
        prompt: input.prompt,
        status: input.status,
        requestPayload: input.requestPayload,
      })
      .returning();

    return created;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create painting run');
  }
}

export async function createPaintingAssets(
  input: Array<{
    runId: string;
    userId: string;
    role: 'input' | 'mask' | 'output';
    storageUrl: string;
    storageKey: string;
    mimeType: string;
    width?: number | null;
    height?: number | null;
    metadata: Record<string, unknown>;
  }>,
) {
  try {
    if (input.length === 0) return [];

    return await maindb.insert(paintingAsset).values(input).returning();
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create painting assets');
  }
}

export async function completePaintingRun(input: {
  runId: string;
  resultPayload: Record<string, unknown>;
}) {
  try {
    const [updated] = await maindb
      .update(paintingRun)
      .set({
        status: 'completed',
        resultPayload: input.resultPayload,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paintingRun.id, input.runId))
      .returning();

    return updated;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to complete painting run');
  }
}

export async function failPaintingRun(input: {
  runId: string;
  errorMessage: string;
}) {
  try {
    const [updated] = await maindb
      .update(paintingRun)
      .set({
        status: 'error',
        errorMessage: input.errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paintingRun.id, input.runId))
      .returning();

    return updated;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to fail painting run');
  }
}

export async function listPaintingRunsByUserId(input: { userId: string; limit?: number }) {
  try {
    const runs = await db
      .select()
      .from(paintingRun)
      .where(eq(paintingRun.userId, input.userId))
      .orderBy(desc(paintingRun.createdAt))
      .limit(input.limit ?? 50);

    if (runs.length === 0) {
      return [];
    }

    const assets = await db
      .select()
      .from(paintingAsset)
      .where(
        and(
          eq(paintingAsset.userId, input.userId),
          inArray(
            paintingAsset.runId,
            runs.map((run) => run.id),
          ),
        ),
      )
      .orderBy(desc(paintingAsset.createdAt));

    const assetsByRunId = new Map<string, typeof assets>();

    for (const asset of assets) {
      const current = assetsByRunId.get(asset.runId) ?? [];
      current.push(asset);
      assetsByRunId.set(asset.runId, current);
    }

    return runs.map((run) => ({
      ...run,
      assets: assetsByRunId.get(run.id) ?? [],
    }));
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to list painting runs');
  }
}

export async function getPaintingRunById(input: { runId: string; userId: string }) {
  try {
    const [run] = await db
      .select()
      .from(paintingRun)
      .where(and(eq(paintingRun.id, input.runId), eq(paintingRun.userId, input.userId)))
      .limit(1);

    if (!run) {
      return null;
    }

    const assets = await db
      .select()
      .from(paintingAsset)
      .where(and(eq(paintingAsset.runId, run.id), eq(paintingAsset.userId, input.userId)))
      .orderBy(desc(paintingAsset.createdAt));

    return {
      ...run,
      assets,
    };
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get painting run');
  }
}

export async function getPaintingAssetById(input: { assetId: string; userId: string }) {
  try {
    const [asset] = await db
      .select()
      .from(paintingAsset)
      .where(and(eq(paintingAsset.id, input.assetId), eq(paintingAsset.userId, input.userId)))
      .limit(1);

    return asset ?? null;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get painting asset');
  }
}

export async function deletePaintingRunById(input: { runId: string; userId: string }) {
  try {
    const [deleted] = await maindb
      .delete(paintingRun)
      .where(and(eq(paintingRun.id, input.runId), eq(paintingRun.userId, input.userId)))
      .returning();

    return deleted ?? null;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to delete painting run');
  }
}

export function createPaintingRepository(): PaintingRepository {
  return {
    createRun: createPaintingRun,
    createAssets: createPaintingAssets,
    completeRun: completePaintingRun,
    failRun: failPaintingRun,
  };
}
