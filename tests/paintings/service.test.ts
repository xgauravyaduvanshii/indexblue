import test from 'node:test';
import assert from 'node:assert/strict';
import type { PaintingRepository, PaintingRepositoryAsset, PaintingRepositoryRun } from '../../lib/paintings/types';

const { normalizePaintingOutputs } = (await import(
  new URL('../../lib/paintings/storage.ts', import.meta.url).href
)) as typeof import('../../lib/paintings/storage');
const { executePaintingRequest } = (await import(
  new URL('../../lib/paintings/service.ts', import.meta.url).href
)) as typeof import('../../lib/paintings/service');

function createInMemoryPaintingRepository(): PaintingRepository & {
  runs: PaintingRepositoryRun[];
  assets: PaintingRepositoryAsset[];
} {
  const runs: PaintingRepositoryRun[] = [];
  const assets: PaintingRepositoryAsset[] = [];

  return {
    runs,
    assets,
    async createRun(input) {
      const run: PaintingRepositoryRun = {
        id: `run_${runs.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        errorMessage: null,
        ...input,
      };
      runs.push(run);
      return run;
    },
    async createAssets(input) {
      const created = input.map((asset, index) => ({
        id: `asset_${assets.length + index + 1}`,
        createdAt: new Date(),
        ...asset,
      }));
      assets.push(...created);
      return created;
    },
    async completeRun(input) {
      const run = runs.find((entry) => entry.id === input.runId);
      assert.ok(run);
      Object.assign(run, {
        status: 'completed',
        resultPayload: input.resultPayload,
        completedAt: new Date(),
        updatedAt: new Date(),
      });
      return run;
    },
    async failRun(input) {
      const run = runs.find((entry) => entry.id === input.runId);
      assert.ok(run);
      Object.assign(run, {
        status: 'error',
        errorMessage: input.errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      });
      return run;
    },
  };
}

test('normalizePaintingOutputs converts base64 output into blob upload payloads', async () => {
  const outputs = await normalizePaintingOutputs({
    runId: 'run_123',
    provider: 'openai',
    items: [
      {
        mimeType: 'image/png',
        b64: Buffer.from('png-binary').toString('base64'),
      },
    ],
  });

  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].contentType, 'image/png');
  assert.match(outputs[0].pathname, /paintings\/run_123\/output-1\.png$/);
  assert.equal(outputs[0].provider, 'openai');
});

test('executePaintingRequest uploads normalized provider outputs and completes the run', async () => {
  const repository = createInMemoryPaintingRepository();
  let calledUrl = '';

  const result = await executePaintingRequest({
    userId: 'user_123',
    provider: 'openai',
    model: 'gpt-image-1',
    operation: 'generate',
    prompt: 'Draw a fox in neon rain',
    options: { size: '1024x1024' },
    repository,
    fetchImpl: async (input) => {
      calledUrl = String(input);
      return new Response(
        JSON.stringify({
          data: [
            {
              b64_json: Buffer.from('openai-image').toString('base64'),
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    },
    uploadToBlob: async (file) => ({
      url: `https://blob.test/${file.pathname}`,
      pathname: file.pathname,
    }),
  });

  assert.match(calledUrl, /\/v1\/images\/generations$/);
  assert.equal(result.assets.length, 1);
  assert.equal(result.run.status, 'completed');
  assert.equal(repository.runs.length, 1);
});

test('executePaintingRequest rejects unsupported operations for the selected model', async () => {
  const repository = createInMemoryPaintingRepository();

  await assert.rejects(
    () =>
      executePaintingRequest({
        userId: 'user_123',
        provider: 'google',
        model: 'imagen-4.0-generate-001',
        operation: 'edit',
        prompt: 'Remove the crowd',
        options: {},
        repository,
        fetchImpl: fetch,
        uploadToBlob: async () => {
          throw new Error('should not upload');
        },
      }),
    /does not support edit/,
  );
});

test('executePaintingRequest stores reference images as input assets for rerunable transform jobs', async () => {
  const repository = createInMemoryPaintingRepository();

  const result = await executePaintingRequest({
    userId: 'user_123',
    provider: 'openai',
    model: 'gpt-image-1',
    operation: 'edit',
    prompt: 'Turn the sky into a dramatic sunset',
    options: { size: '1024x1024' },
    inputs: [
      {
        mimeType: 'image/png',
        buffer: Buffer.from('input-for-rerun'),
      },
    ],
    repository,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              b64_json: Buffer.from('edited-image').toString('base64'),
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    uploadToBlob: async (file) => ({
      url: `https://blob.test/${file.pathname}`,
      pathname: file.pathname,
    }),
  });

  const inputAssets = repository.assets.filter((asset) => asset.role === 'input');
  const outputAssets = repository.assets.filter((asset) => asset.role === 'output');

  assert.equal(result.run.status, 'completed');
  assert.equal(inputAssets.length, 1);
  assert.equal(outputAssets.length, 1);
});
