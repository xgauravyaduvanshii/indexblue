import { getPaintingModelById } from './catalog.ts';
import { callFreepikProvider } from './providers/freepik.ts';
import { callGoogleProvider } from './providers/google.ts';
import { callOllamaProvider } from './providers/ollama.ts';
import { callOpenAIProvider } from './providers/openai.ts';
import { callStabilityProvider } from './providers/stability.ts';
import { normalizePaintingOutputs } from './storage.ts';
import type { ExecutePaintingRequestArgs, PaintingNormalizedOutput, PaintingProviderRequest, PaintingRawOutput } from './types.ts';

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/jpeg') return 'jpg';
  return 'bin';
}

function createInputUploadPayload(args: ExecutePaintingRequestArgs, runId: string): PaintingNormalizedOutput[] {
  return (args.inputs ?? []).map((input, index) => ({
    contentType: input.mimeType,
    pathname: `paintings/${runId}/input-${index + 1}.${extensionForMimeType(input.mimeType)}`,
    body: input.buffer,
    provider: args.provider,
    sourceUrl: null,
    revisedPrompt: null,
    width: null,
    height: null,
  }));
}

export async function callPaintingProvider(
  request: PaintingProviderRequest,
  fetchImpl: typeof fetch,
): Promise<PaintingRawOutput[]> {
  if (request.provider === 'openai') {
    return callOpenAIProvider(request, fetchImpl);
  }

  if (request.provider === 'google') {
    return callGoogleProvider(request, fetchImpl);
  }

  if (request.provider === 'stability') {
    return callStabilityProvider(request, fetchImpl);
  }

  if (request.provider === 'freepik') {
    return callFreepikProvider(request, fetchImpl);
  }

  if (request.provider === 'ollama') {
    return callOllamaProvider(request, fetchImpl);
  }

  throw new Error(`Painting provider not implemented: ${request.provider}`);
}

export async function executePaintingRequest(args: ExecutePaintingRequestArgs) {
  const model = getPaintingModelById(args.provider, args.model);

  if (!model) {
    throw new Error(`Unknown paintings model: ${args.provider}/${args.model}`);
  }

  if (!model.operations.includes(args.operation)) {
    throw new Error(`${args.provider}/${args.model} does not support ${args.operation}`);
  }

  const requestPayload = {
    provider: args.provider,
    model: args.model,
    operation: args.operation,
    prompt: args.prompt,
    options: args.options,
    inputs:
      args.inputs?.map((input) => ({
        mimeType: input.mimeType,
        byteLength: input.buffer.byteLength,
      })) ?? [],
  };

  const run = await args.repository.createRun({
    userId: args.userId,
    provider: args.provider,
    model: args.model,
    operation: args.operation,
    prompt: args.prompt,
    status: 'running',
    requestPayload,
  });

  try {
    if (args.inputs?.length) {
      const uploadedInputAssets = await Promise.all(
        createInputUploadPayload(args, run.id).map(async (file) => {
          const upload = await args.uploadToBlob(file);
          return {
            runId: run.id,
            userId: args.userId,
            role: 'input' as const,
            storageUrl: upload.url,
            storageKey: upload.pathname,
            mimeType: file.contentType,
            width: file.width ?? null,
            height: file.height ?? null,
            metadata: {
              provider: file.provider,
            },
          };
        }),
      );

      await args.repository.createAssets(uploadedInputAssets);
    }

    const rawOutputs = await callPaintingProvider(args, args.fetchImpl ?? fetch);
    const normalizedOutputs = await normalizePaintingOutputs({
      runId: run.id,
      provider: args.provider,
      items: rawOutputs,
    });

    const uploadedAssets = await Promise.all(
      normalizedOutputs.map(async (file, index) => {
        const upload = await args.uploadToBlob(file);
        return {
          runId: run.id,
          userId: args.userId,
          role: 'output' as const,
          storageUrl: upload.url,
          storageKey: upload.pathname,
          mimeType: file.contentType,
          width: file.width ?? null,
          height: file.height ?? null,
          metadata: {
            provider: file.provider,
            sourceUrl: file.sourceUrl,
            revisedPrompt: file.revisedPrompt ?? null,
            outputIndex: index,
          },
        };
      }),
    );

    const assets = await args.repository.createAssets(uploadedAssets);
    const completedRun = await args.repository.completeRun({
      runId: run.id,
      resultPayload: {
        assetCount: assets.length,
        outputs: assets.map((asset) => ({
          id: asset.id,
          url: asset.storageUrl,
          mimeType: asset.mimeType,
        })),
      },
    });

    return {
      run: completedRun,
      assets,
    };
  } catch (error) {
    await args.repository.failRun({
      runId: run.id,
      errorMessage: error instanceof Error ? error.message : 'Paintings request failed',
    });
    throw error;
  }
}
