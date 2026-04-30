export type PaintingProvider = 'openai' | 'google' | 'stability' | 'freepik' | 'ollama';

export type PaintingOperation = 'generate' | 'edit' | 'remix' | 'upscale';

export interface PaintingModelDefinition {
  provider: PaintingProvider;
  modelId: string;
  label: string;
  operations: PaintingOperation[];
  sizes: string[];
  description?: string;
  experimental?: boolean;
  supportsMask?: boolean;
  supportsCount?: boolean;
  supportsSeed?: boolean;
  supportsBackground?: boolean;
  supportsQuality?: boolean;
  supportsNegativePrompt?: boolean;
  supportsPromptUpsampling?: boolean;
  supportsReferenceImages?: boolean;
  qualityOptions?: string[];
  backgroundOptions?: string[];
  maxCount?: number;
}

export interface PaintingCatalogEnv {
  OPENAI_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  STABILITY_API_KEY?: string;
  FREEPIK_API_KEY?: string;
  OLLAMA_BASE_URL?: string;
}

export interface PaintingRawOutput {
  mimeType: string;
  b64?: string;
  url?: string;
  revisedPrompt?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface PaintingNormalizedOutput {
  contentType: string;
  pathname: string;
  body: Buffer;
  provider: PaintingProvider;
  sourceUrl: string | null;
  revisedPrompt?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface PaintingBlobUploadResult {
  url: string;
  pathname: string;
}

export interface PaintingInputImage {
  mimeType: string;
  buffer: Buffer;
}

export interface PaintingRepositoryRun {
  id: string;
  userId: string;
  provider: string;
  model: string;
  operation: string;
  prompt: string;
  status: string;
  requestPayload: Record<string, unknown>;
  resultPayload?: Record<string, unknown>;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
}

export interface PaintingRepositoryAsset {
  id: string;
  runId: string;
  userId: string;
  role: string;
  storageUrl: string;
  storageKey: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface PaintingRepository {
  createRun(input: {
    userId: string;
    provider: PaintingProvider;
    model: string;
    operation: PaintingOperation;
    prompt: string;
    status: 'running';
    requestPayload: Record<string, unknown>;
  }): Promise<PaintingRepositoryRun>;
  createAssets(
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
  ): Promise<PaintingRepositoryAsset[]>;
  completeRun(input: {
    runId: string;
    resultPayload: Record<string, unknown>;
  }): Promise<PaintingRepositoryRun>;
  failRun(input: {
    runId: string;
    errorMessage: string;
  }): Promise<PaintingRepositoryRun>;
}

export interface PaintingProviderRequest {
  provider: PaintingProvider;
  model: string;
  operation: PaintingOperation;
  prompt: string;
  options: Record<string, unknown>;
  inputs?: PaintingInputImage[];
}

export interface PaintingPromptSuggestion {
  id: string;
  title: string;
  tag: 'balanced' | 'advanced' | 'style-forward' | 'production';
  summary: string;
  prompt: string;
}

export interface PaintingWorkspaceDraft {
  provider: PaintingProvider;
  model: string;
  operation: PaintingOperation;
  prompt: string;
  size: string;
  count: number;
  quality: string;
  background: string;
  seed: number | null;
  negativePrompt: string;
  promptUpsampling: boolean;
}

export interface PaintingRunFilter {
  query: string;
  provider: PaintingProvider | 'all';
  status: 'all' | 'running' | 'completed' | 'error';
}

export interface ExecutePaintingRequestArgs extends PaintingProviderRequest {
  userId: string;
  repository: PaintingRepository;
  fetchImpl?: typeof fetch;
  uploadToBlob: (file: PaintingNormalizedOutput) => Promise<PaintingBlobUploadResult>;
}
