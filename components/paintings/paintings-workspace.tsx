'use client';

import { useEffect, useMemo, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import type {
  PaintingModelDefinition,
  PaintingOperation,
  PaintingPromptSuggestion,
  PaintingProvider,
  PaintingWorkspaceDraft,
} from '@/lib/paintings/types';
import { createDraftFromPaintingRun, filterPaintingRuns } from '@/lib/paintings/workspace-state';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Artboard } from './artboard';
import { ControlPanel } from './control-panel';
import { HistoryStrip, type PaintingHistoryRun } from './history-strip';
import { PromptEnhanceDialog } from './prompt-enhance-dialog';
import { PromptComposer } from './prompt-composer';

type UserPreferencesPayload = Record<string, unknown> | null;
type UserPreferencesMap = Record<string, unknown>;

function getDefaultProvider(models: PaintingModelDefinition[]): PaintingProvider {
  return (models[0]?.provider ?? 'openai') as PaintingProvider;
}

function getModelsForProvider(models: PaintingModelDefinition[], provider: PaintingProvider) {
  return models.filter((model) => model.provider === provider);
}

function getDefaultModelId(models: PaintingModelDefinition[], provider: PaintingProvider) {
  return getModelsForProvider(models, provider)[0]?.modelId ?? '';
}

function getDefaultOperation(model: PaintingModelDefinition | null): PaintingOperation {
  return (model?.operations[0] ?? 'generate') as PaintingOperation;
}

function getDefaultSize(model: PaintingModelDefinition | null) {
  return model?.sizes[0] ?? '1024x1024';
}

function getDefaultQuality(model: PaintingModelDefinition | null) {
  return model?.qualityOptions?.[0] ?? 'auto';
}

function getDefaultBackground(model: PaintingModelDefinition | null) {
  return model?.backgroundOptions?.[0] ?? 'auto';
}

function formatProviderLabel(provider: string) {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function readJsonResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed with status ${response.status}`);
  }

  return payload;
}

function getPreferencesMap(payload: UserPreferencesPayload): UserPreferencesMap {
  if (payload && typeof payload === 'object' && 'preferences' in payload) {
    return ((payload.preferences as Record<string, unknown>) ?? {}) satisfies UserPreferencesMap;
  }

  return {};
}

async function createFileFromStoredAsset(url: string, mimeType: string, filename: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load reference image (${response.status})`);
  }

  const blob = await response.blob();
  return new File([blob], filename, {
    type: mimeType || blob.type || 'image/png',
  });
}

export function PaintingsWorkspace() {
  const [models, setModels] = useState<PaintingModelDefinition[]>([]);
  const [runs, setRuns] = useState<PaintingHistoryRun[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<PaintingProvider>('openai');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedOperation, setSelectedOperation] = useState<PaintingOperation>('generate');
  const [size, setSize] = useState('1024x1024');
  const [count, setCount] = useState(1);
  const [quality, setQuality] = useState('auto');
  const [background, setBackground] = useState('auto');
  const [seed, setSeed] = useState<number | null>(null);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [promptUpsampling, setPromptUpsampling] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'running' | 'completed' | 'error'>('all');
  const [historyProviderFilter, setHistoryProviderFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isEnhanceDialogOpen, setIsEnhanceDialogOpen] = useState(false);
  const [enhanceErrorMessage, setEnhanceErrorMessage] = useState<string | null>(null);
  const [promptSuggestions, setPromptSuggestions] = useState<PaintingPromptSuggestion[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);

  const providers = useMemo(
    () => [...new Set(models.map((model) => model.provider))] as PaintingProvider[],
    [models],
  );
  const providerModels = useMemo(() => getModelsForProvider(models, selectedProvider), [models, selectedProvider]);
  const selectedModel = providerModels.find((model) => model.modelId === selectedModelId) ?? null;
  const activeRun = runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null;
  const fallbackRun = runs.find((run) => run.status === 'completed' && run.outputs[0]?.storageUrl) ?? null;
  const visibleImageUrl = activeRun?.outputs[0]?.storageUrl ?? fallbackRun?.outputs[0]?.storageUrl ?? null;
  const filteredRuns = filterPaintingRuns(runs, {
    query: historyQuery,
    provider: (historyProviderFilter === 'all' ? 'all' : historyProviderFilter) as PaintingProvider | 'all',
    status: historyStatusFilter,
  });

  async function loadHistory(selectNewest = false) {
    setIsHistoryLoading(true);

    try {
      const response = await fetch('/api/paintings/history');
      const payload = await readJsonResponse(response);
      const nextRuns = Array.isArray(payload?.runs) ? (payload.runs as PaintingHistoryRun[]) : [];
      setRuns(nextRuns);

      if (selectNewest && nextRuns[0]) {
        setSelectedRunId(nextRuns[0].id);
      } else if (nextRuns.length === 0) {
        setSelectedRunId(null);
      } else if (!nextRuns.some((run) => run.id === selectedRunId)) {
        setSelectedRunId(nextRuns[0].id);
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load Paintings history');
    } finally {
      setIsHistoryLoading(false);
    }
  }

  function applyDraft(draft: PaintingWorkspaceDraft) {
    const model = models.find((entry) => entry.provider === draft.provider && entry.modelId === draft.model) ?? null;

    setSelectedProvider(draft.provider);
    setSelectedModelId(draft.model);
    setSelectedOperation(model?.operations.includes(draft.operation) ? draft.operation : getDefaultOperation(model));
    setSize(model?.sizes.includes(draft.size) ? draft.size : getDefaultSize(model));
    setCount(draft.count);
    setQuality(model?.qualityOptions?.includes(draft.quality) ? draft.quality : getDefaultQuality(model));
    setBackground(model?.backgroundOptions?.includes(draft.background) ? draft.background : getDefaultBackground(model));
    setSeed(draft.seed);
    setNegativePrompt(draft.negativePrompt);
    setPromptUpsampling(draft.promptUpsampling);
    setPrompt(draft.prompt);
  }

  function createCurrentDraft(): PaintingWorkspaceDraft {
    return {
      provider: selectedProvider,
      model: selectedModelId,
      operation: selectedOperation,
      prompt,
      size,
      count,
      quality,
      background,
      seed,
      negativePrompt,
      promptUpsampling,
    };
  }

  async function buildSubmissionPayload(draft: PaintingWorkspaceDraft, referenceOverride: File | null) {
    const model = models.find((entry) => entry.provider === draft.provider && entry.modelId === draft.model) ?? null;

    if (!model) {
      throw new Error(`Unknown paintings model: ${draft.provider}/${draft.model}`);
    }

    const options: Record<string, unknown> = {
      size: draft.size,
    };

    if (model.supportsCount) {
      options.count = draft.count;
    }

    if (model.supportsQuality && draft.quality) {
      options.quality = draft.quality;
    }

    if (model.supportsBackground && draft.background) {
      options.background = draft.background;
    }

    if (model.supportsSeed && typeof draft.seed === 'number') {
      options.seed = draft.seed;
    }

    if (model.supportsNegativePrompt && draft.negativePrompt.trim()) {
      options.negativePrompt = draft.negativePrompt.trim();
    }

    if (model.supportsPromptUpsampling && draft.promptUpsampling) {
      options.promptUpsampling = true;
    }

    if (draft.operation === 'generate') {
      return {
        endpoint: '/api/paintings/generate',
        body: {
          provider: draft.provider,
          model: draft.model,
          prompt: draft.prompt,
          options,
        },
      };
    }

    if (!referenceOverride) {
      throw new Error('A reference image is required for edit, remix, and upscale.');
    }

    return {
      endpoint: '/api/paintings/transform',
      body: {
        provider: draft.provider,
        model: draft.model,
        operation: draft.operation,
        prompt: draft.prompt,
        options,
        inputs: [
          {
            mimeType: referenceOverride.type || 'image/png',
            base64: await fileToBase64(referenceOverride),
          },
        ],
      },
    };
  }

  async function submitPainting(draft: PaintingWorkspaceDraft, referenceOverride: File | null) {
    if (!draft.prompt.trim()) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = await buildSubmissionPayload(draft, referenceOverride);
      const response = await fetch(payload.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload.body),
      });

      await readJsonResponse(response);
      await loadHistory(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Paintings request failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function hydrateReferenceFromRun(run: PaintingHistoryRun) {
    const inputAsset = run.inputs?.[0];

    if (!inputAsset?.storageUrl) {
      setReferenceFile(null);
      return null;
    }

    const file = await createFileFromStoredAsset(inputAsset.storageUrl, inputAsset.mimeType, `${run.id}-reference.png`);
    setReferenceFile(file);
    return file;
  }

  async function handleDuplicateRun(runId: string) {
    const run = runs.find((entry) => entry.id === runId);

    if (!run) {
      return;
    }

    applyDraft(createDraftFromPaintingRun(run));
    setSelectedRunId(run.id);

    try {
      await hydrateReferenceFromRun(run);
    } catch (error) {
      setReferenceFile(null);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to restore the reference image');
    }
  }

  async function handleRerun(runId: string) {
    const run = runs.find((entry) => entry.id === runId);

    if (!run) {
      return;
    }

    const draft = createDraftFromPaintingRun(run);
    applyDraft(draft);
    setSelectedRunId(run.id);

    let restoredReference: File | null = null;

    if (draft.operation !== 'generate') {
      try {
        restoredReference = await hydrateReferenceFromRun(run);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to restore the reference image');
        return;
      }

      if (!restoredReference) {
        setErrorMessage('This run needs its reference image before it can be rerun.');
        return;
      }
    }

    await submitPainting(draft, restoredReference);
  }

  async function handleEnhancePrompt() {
    if (!prompt.trim()) {
      setErrorMessage('Enter a prompt before using Enhance.');
      return;
    }

    setIsEnhanceDialogOpen(true);
    setIsEnhancing(true);
    setEnhanceErrorMessage(null);

    try {
      const response = await fetch('/api/paintings/enhance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          provider: selectedProvider,
          model: selectedModelId,
          operation: selectedOperation,
          suggestionCount: 4,
        }),
      });

      const payload = await readJsonResponse(response);
      const suggestions = Array.isArray(payload?.suggestions)
        ? (payload.suggestions as PaintingPromptSuggestion[])
        : [];
      setPromptSuggestions(suggestions);
    } catch (error) {
      setEnhanceErrorMessage(error instanceof Error ? error.message : 'Failed to enhance prompt');
    } finally {
      setIsEnhancing(false);
    }
  }

  async function handleDeleteRun(runId: string) {
    await fetch(`/api/paintings/history/${runId}`, {
      method: 'DELETE',
    });
    await loadHistory();
  }

  useEffect(() => {
    async function bootstrap() {
      setIsLoading(true);

      try {
        const [modelsResponse, historyResponse, preferencesResponse] = await Promise.all([
          fetch('/api/paintings/models'),
          fetch('/api/paintings/history'),
          fetch('/api/preferences'),
        ]);

        const modelsPayload = await readJsonResponse(modelsResponse);
        const historyPayload = await readJsonResponse(historyResponse);
        const preferencesPayload = (await preferencesResponse.json().catch(() => null)) as UserPreferencesPayload;

        const nextModels = Array.isArray(modelsPayload?.models) ? (modelsPayload.models as PaintingModelDefinition[]) : [];
        const nextRuns = Array.isArray(historyPayload?.runs) ? (historyPayload.runs as PaintingHistoryRun[]) : [];
        const preferences = getPreferencesMap(preferencesPayload);

        setModels(nextModels);
        setRuns(nextRuns);
        setSelectedRunId(nextRuns[0]?.id ?? null);

        const provider = (typeof preferences['paintings-provider'] === 'string'
          ? preferences['paintings-provider']
          : getDefaultProvider(nextModels)) as PaintingProvider;
        const candidateModels = getModelsForProvider(nextModels, provider);
        const modelId =
          typeof preferences['paintings-model'] === 'string' &&
          candidateModels.some((model) => model.modelId === preferences['paintings-model'])
            ? (preferences['paintings-model'] as string)
            : getDefaultModelId(nextModels, provider);
        const model = candidateModels.find((entry) => entry.modelId === modelId) ?? null;
        const operation =
          typeof preferences['paintings-operation'] === 'string' &&
          model?.operations.includes(preferences['paintings-operation'] as PaintingOperation)
            ? (preferences['paintings-operation'] as PaintingOperation)
            : getDefaultOperation(model);
        const selectedSize =
          typeof preferences['paintings-size'] === 'string' && model?.sizes.includes(preferences['paintings-size'])
            ? (preferences['paintings-size'] as string)
            : getDefaultSize(model);

        setSelectedProvider(provider);
        setSelectedModelId(modelId);
        setSelectedOperation(operation);
        setSize(selectedSize);
        setCount(typeof preferences['paintings-count'] === 'number' ? preferences['paintings-count'] : 1);
        setQuality(
          typeof preferences['paintings-quality'] === 'string' ? preferences['paintings-quality'] : getDefaultQuality(model),
        );
        setBackground(
          typeof preferences['paintings-background'] === 'string'
            ? preferences['paintings-background']
            : getDefaultBackground(model),
        );
        setSeed(typeof preferences['paintings-seed'] === 'number' ? preferences['paintings-seed'] : null);
        setNegativePrompt(
          typeof preferences['paintings-negative-prompt'] === 'string' ? preferences['paintings-negative-prompt'] : '',
        );
        setPromptUpsampling(preferences['paintings-prompt-upsampling'] === true);
        setHistoryQuery(typeof preferences['paintings-history-query'] === 'string' ? preferences['paintings-history-query'] : '');
        setHistoryStatusFilter(
          preferences['paintings-history-status'] === 'running' ||
            preferences['paintings-history-status'] === 'completed' ||
            preferences['paintings-history-status'] === 'error'
            ? preferences['paintings-history-status']
            : 'all',
        );
        setHistoryProviderFilter(
          typeof preferences['paintings-history-provider'] === 'string' ? preferences['paintings-history-provider'] : 'all',
        );
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load Paintings');
      } finally {
        setIsLoading(false);
        setHasLoadedPreferences(true);
      }
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!hasLoadedPreferences) {
      return;
    }

    void fetch('/api/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferences: {
          'paintings-provider': selectedProvider,
          'paintings-model': selectedModelId,
          'paintings-size': size,
          'paintings-operation': selectedOperation,
          'paintings-count': count,
          'paintings-quality': quality,
          'paintings-background': background,
          'paintings-seed': seed,
          'paintings-negative-prompt': negativePrompt,
          'paintings-prompt-upsampling': promptUpsampling,
          'paintings-history-query': historyQuery,
          'paintings-history-status': historyStatusFilter,
          'paintings-history-provider': historyProviderFilter,
        },
      }),
    }).catch(() => undefined);
  }, [
    background,
    count,
    hasLoadedPreferences,
    historyProviderFilter,
    historyQuery,
    historyStatusFilter,
    negativePrompt,
    promptUpsampling,
    quality,
    seed,
    selectedModelId,
    selectedOperation,
    selectedProvider,
    size,
  ]);

  useEffect(() => {
    if (!selectedModel) {
      return;
    }

    if (!selectedModel.operations.includes(selectedOperation)) {
      setSelectedOperation(getDefaultOperation(selectedModel));
    }

    if (!selectedModel.sizes.includes(size)) {
      setSize(getDefaultSize(selectedModel));
    }

    if (selectedModel.qualityOptions?.length && !selectedModel.qualityOptions.includes(quality)) {
      setQuality(getDefaultQuality(selectedModel));
    } else if (!selectedModel.supportsQuality && quality !== 'auto') {
      setQuality('auto');
    }

    if (selectedModel.backgroundOptions?.length && !selectedModel.backgroundOptions.includes(background)) {
      setBackground(getDefaultBackground(selectedModel));
    } else if (!selectedModel.supportsBackground && background !== 'auto') {
      setBackground('auto');
    }
  }, [background, quality, selectedModel, selectedOperation, size]);

  function handleProviderChange(provider: PaintingProvider) {
    const nextModels = getModelsForProvider(models, provider);
    const nextModel = nextModels[0] ?? null;
    setSelectedProvider(provider);
    setSelectedModelId(nextModel?.modelId ?? '');
    setSelectedOperation(getDefaultOperation(nextModel));
    setSize(getDefaultSize(nextModel));
    setQuality(getDefaultQuality(nextModel));
    setBackground(getDefaultBackground(nextModel));
  }

  function handleModelChange(modelId: string) {
    const model = providerModels.find((entry) => entry.modelId === modelId) ?? null;
    setSelectedModelId(modelId);
    setSelectedOperation(getDefaultOperation(model));
    setSize(getDefaultSize(model));
    setQuality(getDefaultQuality(model));
    setBackground(getDefaultBackground(model));
  }

  const helperText =
    selectedOperation === 'generate'
      ? 'Describe the subject, style, composition, lighting, and camera feel you want.'
      : 'The uploaded reference image will be preserved while the prompt guides the change.';

  return (
    <div className="min-h-screen bg-background">
      <PromptEnhanceDialog
        open={isEnhanceDialogOpen}
        isLoading={isEnhancing}
        errorMessage={enhanceErrorMessage}
        suggestions={promptSuggestions}
        onOpenChange={setIsEnhanceDialogOpen}
        onSelectSuggestion={(nextPrompt) => {
          setPrompt(nextPrompt);
          setIsEnhanceDialogOpen(false);
        }}
      />

      <div className="mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="md:hidden">
            <SidebarTrigger />
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border bg-card text-foreground shadow-sm">
            <ImagePlus className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Paintings</h1>
            <p className="text-sm text-muted-foreground">
              Generate, remix, and upscale images with app-level AI providers.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-[400px] items-center justify-center text-sm text-muted-foreground">
            Loading Paintings...
          </div>
        ) : models.length === 0 ? (
          <div className="rounded-3xl border border-dashed p-10 text-center">
            <p className="text-sm font-medium">No image providers are configured yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Add an image provider key like OpenAI, Freepik, Stability, Google, or Ollama to start generating.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_264px]">
            <ControlPanel
              providers={providers}
              models={providerModels}
              selectedProvider={selectedProvider}
              selectedModelId={selectedModelId}
              selectedOperation={selectedOperation}
              size={size}
              count={count}
              quality={quality}
              background={background}
              seed={seed}
              negativePrompt={negativePrompt}
              promptUpsampling={promptUpsampling}
              referenceFile={referenceFile}
              disabled={isSubmitting}
              onProviderChange={handleProviderChange}
              onModelChange={handleModelChange}
              onOperationChange={setSelectedOperation}
              onSizeChange={setSize}
              onCountChange={setCount}
              onQualityChange={setQuality}
              onBackgroundChange={setBackground}
              onSeedChange={setSeed}
              onNegativePromptChange={setNegativePrompt}
              onPromptUpsamplingChange={setPromptUpsampling}
              onReferenceFileChange={setReferenceFile}
            />

            <div className="min-w-0 space-y-4">
              <Artboard
                imageUrl={visibleImageUrl}
                providerLabel={formatProviderLabel(selectedProvider)}
                modelLabel={selectedModel?.label ?? selectedModelId}
                status={activeRun?.status ?? null}
                errorMessage={errorMessage}
                isSubmitting={isSubmitting}
              />
              <PromptComposer
                prompt={prompt}
                operationLabel={selectedOperation === 'generate' ? 'Generate' : selectedOperation}
                isSubmitting={isSubmitting}
                isEnhancing={isEnhancing}
                helperText={helperText}
                errorMessage={errorMessage}
                onPromptChange={setPrompt}
                onEnhance={handleEnhancePrompt}
                onSubmit={() => void submitPainting(createCurrentDraft(), referenceFile)}
              />
            </div>

            <HistoryStrip
              runs={filteredRuns}
              selectedRunId={selectedRunId}
              isLoading={isHistoryLoading}
              query={historyQuery}
              statusFilter={historyStatusFilter}
              providerFilter={historyProviderFilter}
              providers={providers}
              onQueryChange={setHistoryQuery}
              onStatusFilterChange={setHistoryStatusFilter}
              onProviderFilterChange={setHistoryProviderFilter}
              onSelect={setSelectedRunId}
              onRerun={(runId) => void handleRerun(runId)}
              onDuplicate={(runId) => void handleDuplicateRun(runId)}
              onDelete={(runId) => void handleDeleteRun(runId)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
