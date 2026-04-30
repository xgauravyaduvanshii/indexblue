import type { PaintingProvider, PaintingRunFilter, PaintingWorkspaceDraft, PaintingOperation } from './types.ts';

type FilterablePaintingRun = {
  id: string;
  provider: string;
  model: string;
  operation: string;
  prompt: string;
  status: string;
  requestPayload?: Record<string, unknown>;
};

type DraftablePaintingRun = {
  id?: string;
  provider: string;
  model: string;
  operation: string;
  prompt: string;
  requestPayload?: Record<string, unknown>;
};

function getRequestOptions(run: DraftablePaintingRun) {
  const rawOptions = run.requestPayload?.options;
  return rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
    ? (rawOptions as Record<string, unknown>)
    : {};
}

export function filterPaintingRuns<T extends FilterablePaintingRun>(runs: T[], filter: PaintingRunFilter) {
  const query = filter.query.trim().toLowerCase();

  return runs.filter((run) => {
    if (filter.provider !== 'all' && run.provider !== filter.provider) {
      return false;
    }

    if (filter.status !== 'all' && run.status !== filter.status) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [run.prompt, run.model, run.operation, run.provider].some((value) => value.toLowerCase().includes(query));
  });
}

export function createDraftFromPaintingRun(run: DraftablePaintingRun): PaintingWorkspaceDraft {
  const options = getRequestOptions(run);

  return {
    provider: run.provider as PaintingProvider,
    model: run.model,
    operation: run.operation as PaintingOperation,
    prompt: run.prompt,
    size: typeof options.size === 'string' ? options.size : '1024x1024',
    count: typeof options.count === 'number' ? options.count : 1,
    quality: typeof options.quality === 'string' ? options.quality : 'auto',
    background: typeof options.background === 'string' ? options.background : 'auto',
    seed: typeof options.seed === 'number' ? options.seed : null,
    negativePrompt: typeof options.negativePrompt === 'string' ? options.negativePrompt : '',
    promptUpsampling: options.promptUpsampling === true,
  };
}
