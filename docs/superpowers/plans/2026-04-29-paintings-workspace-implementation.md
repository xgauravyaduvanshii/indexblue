# Paintings Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new top-level `Paintings` workspace in `indexblue` with provider-backed image generation, edit/remix/upscale flows, persistent history, and blob-backed assets.

**Architecture:** Add an app-level Paintings subsystem that sits beside existing workspaces, not inside Builder. Keep provider logic server-side behind a small capability-driven catalog and a unified service layer, persist runs/assets in new user-scoped Drizzle tables, and render a Cherry-Studio-inspired three-column UI that adapts to the selected model’s capabilities.

**Tech Stack:** Next.js App Router, React 19, Drizzle ORM, Zod, `@vercel/blob`, fetch-based provider adapters, `node:test`, TypeScript

---

## File Map

### New files

- `lib/paintings/types.ts`
- `lib/paintings/catalog.ts`
- `lib/paintings/storage.ts`
- `lib/paintings/service.ts`
- `lib/paintings/providers/openai.ts`
- `lib/paintings/providers/google.ts`
- `lib/paintings/providers/stability.ts`
- `lib/paintings/providers/freepik.ts`
- `lib/paintings/providers/ollama.ts`
- `lib/db/painting-queries.ts`
- `app/api/paintings/models/route.ts`
- `app/api/paintings/history/route.ts`
- `app/api/paintings/generate/route.ts`
- `app/api/paintings/transform/route.ts`
- `app/api/paintings/assets/[id]/route.ts`
- `app/api/paintings/history/[id]/route.ts`
- `app/paintings/layout.tsx`
- `app/paintings/page.tsx`
- `components/paintings/control-panel.tsx`
- `components/paintings/model-selector.tsx`
- `components/paintings/artboard.tsx`
- `components/paintings/prompt-composer.tsx`
- `components/paintings/history-strip.tsx`
- `components/paintings/paintings-workspace.tsx`
- `tests/paintings/catalog.test.ts`
- `tests/paintings/service.test.ts`
- `tests/paintings/providers.test.ts`
- `tests/paintings/route-validation.test.ts`
- `tests/paintings/sidebar-nav.test.ts`

### Modified files

- `components/app-sidebar.tsx`
- `components/sidebar-layout.tsx`
- `lib/db/schema.ts`
- `lib/db/queries.ts`
- `env/server.ts`

### Generated files

- `drizzle/migrations/*` for the new Paintings tables after schema changes

## Task 1: Add the Paintings catalog and shared types

**Files:**
- Create: `lib/paintings/types.ts`
- Create: `lib/paintings/catalog.ts`
- Test: `tests/paintings/catalog.test.ts`

- [ ] **Step 1: Write the failing catalog tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

const { listConfiguredPaintingModels, getPaintingModelById } = (await import(
  new URL('../../lib/paintings/catalog.ts', import.meta.url).href
)) as typeof import('../../lib/paintings/catalog');

test('listConfiguredPaintingModels hides providers without credentials', () => {
  const models = listConfiguredPaintingModels({
    OPENAI_API_KEY: 'openai-key',
    GOOGLE_GENERATIVE_AI_API_KEY: '',
    STABILITY_API_KEY: '',
    FREEPIK_API_KEY: 'freepik-key',
    OLLAMA_BASE_URL: '',
  });

  assert.deepEqual(
    [...new Set(models.map((model) => model.provider))],
    ['openai', 'freepik'],
  );
});

test('ollama models are always marked experimental', () => {
  const models = listConfiguredPaintingModels({
    OPENAI_API_KEY: '',
    GOOGLE_GENERATIVE_AI_API_KEY: '',
    STABILITY_API_KEY: '',
    FREEPIK_API_KEY: '',
    OLLAMA_BASE_URL: 'http://localhost:11434',
  });

  const ollamaModel = models.find((model) => model.provider === 'ollama');
  assert.ok(ollamaModel);
  assert.equal(ollamaModel?.experimental, true);
  assert.ok(ollamaModel?.operations.includes('generate'));
});

test('getPaintingModelById returns capability metadata for a known model', () => {
  const model = getPaintingModelById('openai', 'gpt-image-1');

  assert.ok(model);
  assert.equal(model?.provider, 'openai');
  assert.ok(model?.operations.includes('edit'));
  assert.ok(model?.sizes.includes('1024x1024'));
});
```

- [ ] **Step 2: Run the catalog tests and verify red**

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/catalog.test.ts`

Expected: FAIL because `lib/paintings/catalog.ts` and its exports do not exist yet.

- [ ] **Step 3: Write the minimal shared types and model catalog**

```ts
// lib/paintings/types.ts
export type PaintingProvider = 'openai' | 'google' | 'stability' | 'freepik' | 'ollama';
export type PaintingOperation = 'generate' | 'edit' | 'remix' | 'upscale';

export interface PaintingModelDefinition {
  provider: PaintingProvider;
  modelId: string;
  label: string;
  operations: PaintingOperation[];
  sizes: string[];
  experimental?: boolean;
  supportsMask?: boolean;
  supportsCount?: boolean;
  supportsSeed?: boolean;
  supportsBackground?: boolean;
  supportsQuality?: boolean;
}

export interface PaintingCatalogEnv {
  OPENAI_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  STABILITY_API_KEY?: string;
  FREEPIK_API_KEY?: string;
  OLLAMA_BASE_URL?: string;
}
```

```ts
// lib/paintings/catalog.ts
import type { PaintingCatalogEnv, PaintingModelDefinition } from '@/lib/paintings/types';

const ALL_MODELS: PaintingModelDefinition[] = [
  {
    provider: 'openai',
    modelId: 'gpt-image-1',
    label: 'OpenAI GPT Image 1',
    operations: ['generate', 'edit'],
    sizes: ['1024x1024', '1536x1024', '1024x1536'],
    supportsBackground: true,
    supportsCount: true,
    supportsQuality: true,
  },
  {
    provider: 'google',
    modelId: 'imagen-4.0-generate-001',
    label: 'Google Imagen 4',
    operations: ['generate'],
    sizes: ['1024x1024', '1536x1024', '1024x1536'],
  },
  {
    provider: 'stability',
    modelId: 'stable-image-ultra',
    label: 'Stability Ultra',
    operations: ['generate', 'edit', 'remix', 'upscale'],
    sizes: ['1024x1024', '1536x1024', '1024x1536'],
    supportsSeed: true,
  },
  {
    provider: 'freepik',
    modelId: 'imagen4',
    label: 'Freepik Imagen 4',
    operations: ['generate', 'edit', 'remix'],
    sizes: ['1024x1024', '1536x1024', '1024x1536'],
  },
  {
    provider: 'ollama',
    modelId: 'gpt-oss-image',
    label: 'Ollama Image Model',
    operations: ['generate'],
    sizes: ['1024x1024'],
    experimental: true,
  },
];

function isConfigured(provider: PaintingModelDefinition['provider'], env: PaintingCatalogEnv) {
  if (provider === 'openai') return Boolean(env.OPENAI_API_KEY);
  if (provider === 'google') return Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY);
  if (provider === 'stability') return Boolean(env.STABILITY_API_KEY);
  if (provider === 'freepik') return Boolean(env.FREEPIK_API_KEY);
  if (provider === 'ollama') return Boolean(env.OLLAMA_BASE_URL);
  return false;
}

export function listConfiguredPaintingModels(env: PaintingCatalogEnv) {
  return ALL_MODELS.filter((model) => isConfigured(model.provider, env));
}

export function getPaintingModelById(provider: PaintingModelDefinition['provider'], modelId: string) {
  return ALL_MODELS.find((model) => model.provider === provider && model.modelId === modelId) ?? null;
}
```

- [ ] **Step 4: Run the catalog tests and verify green**

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/catalog.test.ts`

Expected: PASS with 3 passing tests.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/bluedark/indexblue
git add lib/paintings/types.ts lib/paintings/catalog.ts tests/paintings/catalog.test.ts
git commit -m "feat: add paintings catalog"
```

## Task 2: Add Paintings persistence tables and repository helpers

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/painting-queries.ts`
- Create: `lib/paintings/storage.ts`
- Modify: `env/server.ts`
- Test: `tests/paintings/service.test.ts`
- Generate: `drizzle/migrations/*`

- [ ] **Step 1: Write a failing service test for normalized asset persistence**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizePaintingOutputs } = (await import(
  new URL('../../lib/paintings/storage.ts', import.meta.url).href
)) as typeof import('../../lib/paintings/storage');

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
});
```

- [ ] **Step 2: Run the storage test and verify red**

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/service.test.ts`

Expected: FAIL because `normalizePaintingOutputs` does not exist yet.

- [ ] **Step 3: Add the new tables, repository helpers, env keys, and storage normalization**

```ts
// lib/db/schema.ts
export const paintingRun = pgTable('painting_run', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  operation: text('operation').notNull(),
  prompt: text('prompt'),
  status: text('status').notNull().default('queued'),
  requestPayload: jsonb('request_payload').$type<Record<string, unknown>>().notNull().default({}),
  resultPayload: jsonb('result_payload').$type<Record<string, unknown>>().notNull().default({}),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  completedAt: timestamp('completed_at'),
});

export const paintingAsset = pgTable('painting_asset', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  runId: text('run_id').notNull().references(() => paintingRun.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  storageUrl: text('storage_url'),
  storageKey: text('storage_key'),
  mimeType: text('mime_type'),
  width: integer('width'),
  height: integer('height'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

```ts
// env/server.ts
STABILITY_API_KEY: z.string().optional(),
FREEPIK_API_KEY: z.string().optional(),
OLLAMA_BASE_URL: z.string().optional(),
```

```ts
// lib/paintings/storage.ts
function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/jpeg') return 'jpg';
  return 'bin';
}

export async function normalizePaintingOutputs({
  runId,
  provider,
  items,
}: {
  runId: string;
  provider: string;
  items: Array<{ mimeType: string; b64?: string; url?: string }>;
}) {
  return items.map((item, index) => ({
    contentType: item.mimeType,
    pathname: `paintings/${runId}/output-${index + 1}.${extensionForMimeType(item.mimeType)}`,
    body: item.b64 ? Buffer.from(item.b64, 'base64') : Buffer.from([]),
    provider,
    sourceUrl: item.url ?? null,
  }));
}
```

```ts
// lib/db/painting-queries.ts
export async function createPaintingRun(input: {
  userId: string;
  provider: string;
  model: string;
  operation: string;
  prompt: string | null;
  status: 'queued' | 'running' | 'completed' | 'error';
  requestPayload: Record<string, unknown>;
}) {
  return maindb.insert(paintingRun).values(input).returning().then((rows) => rows[0] ?? null);
}

export async function completePaintingRun(input: {
  runId: string;
  userId: string;
  resultPayload: Record<string, unknown>;
}) {
  return maindb
    .update(paintingRun)
    .set({ status: 'completed', resultPayload: input.resultPayload, completedAt: new Date() })
    .where(and(eq(paintingRun.id, input.runId), eq(paintingRun.userId, input.userId)))
    .returning()
    .then((rows) => rows[0] ?? null);
}

export async function failPaintingRun(input: {
  runId: string;
  userId: string;
  errorMessage: string;
}) {
  return maindb
    .update(paintingRun)
    .set({ status: 'error', errorMessage: input.errorMessage, completedAt: new Date() })
    .where(and(eq(paintingRun.id, input.runId), eq(paintingRun.userId, input.userId)))
    .returning()
    .then((rows) => rows[0] ?? null);
}

export async function listPaintingRunsByUserId(userId: string) {
  return maindb
    .select()
    .from(paintingRun)
    .where(eq(paintingRun.userId, userId))
    .orderBy(desc(paintingRun.createdAt));
}

export async function createPaintingAssets(values: Array<{
  runId: string;
  userId: string;
  role: 'input' | 'mask' | 'output';
  storageUrl: string;
  storageKey: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  metadata?: Record<string, unknown>;
}>) {
  return values.length === 0 ? [] : maindb.insert(paintingAsset).values(values).returning();
}

export async function deletePaintingRunById(input: { runId: string; userId: string }) {
  return maindb
    .delete(paintingRun)
    .where(and(eq(paintingRun.id, input.runId), eq(paintingRun.userId, input.userId)))
    .returning()
    .then((rows) => rows[0] ?? null);
}
```

- [ ] **Step 4: Generate the migration and run the targeted test**

Run: `cd /home/ubuntu/bluedark/indexblue && pnpm drizzle-kit generate`

Expected: New SQL migration files are created under `drizzle/migrations`.

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/service.test.ts`

Expected: PASS with the storage normalization test green.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/bluedark/indexblue
git add lib/db/schema.ts lib/db/painting-queries.ts lib/paintings/storage.ts env/server.ts drizzle/migrations tests/paintings/service.test.ts
git commit -m "feat: add paintings persistence layer"
```

## Task 3: Add the Paintings service and the first two providers

**Files:**
- Create: `lib/paintings/service.ts`
- Create: `lib/paintings/providers/openai.ts`
- Create: `lib/paintings/providers/google.ts`
- Test: `tests/paintings/providers.test.ts`
- Test: `tests/paintings/service.test.ts`

- [ ] **Step 1: Write the failing provider and service tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

const { executePaintingRequest } = (await import(
  new URL('../../lib/paintings/service.ts', import.meta.url).href
)) as typeof import('../../lib/paintings/service');

test('executePaintingRequest routes OpenAI generate requests through the OpenAI adapter', async () => {
  let calledUrl = '';

  const result = await executePaintingRequest({
    userId: 'user_123',
    provider: 'openai',
    model: 'gpt-image-1',
    operation: 'generate',
    prompt: 'Draw a fox in neon rain',
    options: { size: '1024x1024' },
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
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
    repository: createInMemoryPaintingRepository(),
    uploadToBlob: async (file) => ({ url: `https://blob.test/${file.pathname}`, pathname: file.pathname }),
  });

  assert.match(calledUrl, /\/v1\/images\/generations$/);
  assert.equal(result.assets.length, 1);
  assert.equal(result.run.status, 'completed');
});

test('executePaintingRequest rejects unsupported operations for the selected model', async () => {
  await assert.rejects(
    () =>
      executePaintingRequest({
        userId: 'user_123',
        provider: 'google',
        model: 'imagen-4.0-generate-001',
        operation: 'edit',
        prompt: 'Remove the crowd',
        options: {},
        fetchImpl: fetch,
        repository: createInMemoryPaintingRepository(),
        uploadToBlob: async () => {
          throw new Error('should not upload');
        },
      }),
    /does not support edit/,
  );
});
```

- [ ] **Step 2: Run the provider and service tests and verify red**

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/providers.test.ts tests/paintings/service.test.ts`

Expected: FAIL because `executePaintingRequest` and the adapters do not exist yet.

- [ ] **Step 3: Implement the unified service plus OpenAI and Google adapters**

```ts
// lib/paintings/providers/openai.ts
export async function generateWithOpenAI(request: PaintingProviderRequest, fetchImpl: typeof fetch) {
  const response = await fetchImpl(`${process.env.OPENAI_PROXY_URL || 'https://api.openai.com'}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_PROXY_API_KEY || process.env.OPENAI_API_KEY || ''}`,
    },
    body: JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      size: request.options.size,
      n: request.options.count ?? 1,
      quality: request.options.quality,
      background: request.options.background,
    }),
  });

  const payload = await response.json();
  return payload.data.map((item: any) => ({
    mimeType: 'image/png',
    b64: item.b64_json,
    revisedPrompt: item.revised_prompt ?? null,
  }));
}
```

```ts
// lib/paintings/providers/google.ts
export async function generateWithGoogle(request: PaintingProviderRequest, fetchImpl: typeof fetch) {
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:predict?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: request.prompt }],
        parameters: { sampleCount: request.options.count ?? 1 },
      }),
    },
  );

  const payload = await response.json();
  return (payload.predictions ?? []).map((item: any) => ({
    mimeType: 'image/png',
    b64: item.bytesBase64Encoded,
  }));
}
```

```ts
// lib/paintings/service.ts
export async function executePaintingRequest(args: ExecutePaintingRequestArgs) {
  const model = getPaintingModelById(args.provider, args.model);
  if (!model) throw new Error(`Unknown paintings model: ${args.provider}/${args.model}`);
  if (!model.operations.includes(args.operation)) {
    throw new Error(`${args.provider}/${args.model} does not support ${args.operation}`);
  }

  const run = await args.repository.createRun({ ...args, status: 'running' });
  const rawOutputs = await callProviderAdapter(args);
  const files = await normalizePaintingOutputs({ runId: run.id, provider: args.provider, items: rawOutputs });
  const uploaded = await Promise.all(files.map(args.uploadToBlob));
  const assets = await args.repository.completeRun({ runId: run.id, uploaded, rawOutputs });

  return { run: { ...run, status: 'completed' }, assets };
}
```

- [ ] **Step 4: Run the provider and service tests and verify green**

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/providers.test.ts tests/paintings/service.test.ts`

Expected: PASS with the new OpenAI/Google coverage green.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/bluedark/indexblue
git add lib/paintings/service.ts lib/paintings/providers/openai.ts lib/paintings/providers/google.ts tests/paintings/providers.test.ts tests/paintings/service.test.ts
git commit -m "feat: add paintings service and core providers"
```

## Task 4: Add Stability, Freepik, and experimental Ollama support

**Files:**
- Create: `lib/paintings/providers/stability.ts`
- Create: `lib/paintings/providers/freepik.ts`
- Create: `lib/paintings/providers/ollama.ts`
- Modify: `lib/paintings/service.ts`
- Test: `tests/paintings/providers.test.ts`

- [ ] **Step 1: Extend the provider tests with transform-capability coverage**

```ts
test('stability provider accepts upscale operations', async () => {
  const { callPaintingProvider } = (await import(
    new URL('../../lib/paintings/service.ts', import.meta.url).href
  )) as typeof import('../../lib/paintings/service');

  const result = await callPaintingProvider({
    provider: 'stability',
    model: 'stable-image-ultra',
    operation: 'upscale',
    prompt: 'Upscale this poster',
    options: {},
    inputs: [{ mimeType: 'image/png', buffer: Buffer.from('input') }],
    fetchImpl: async () =>
      new Response(Buffer.from('stability-upscaled'), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
  });

  assert.equal(result[0].mimeType, 'image/png');
});

test('ollama provider keeps generate-only capability and surfaces experimental metadata', async () => {
  const model = getPaintingModelById('ollama', 'gpt-oss-image');
  assert.ok(model?.experimental);
  assert.deepEqual(model?.operations, ['generate']);
});
```

- [ ] **Step 2: Run the provider tests and verify red**

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/providers.test.ts`

Expected: FAIL because Stability, Freepik, and Ollama adapters are not implemented yet.

- [ ] **Step 3: Implement the remaining adapters and wire them into the provider switch**

```ts
// lib/paintings/providers/stability.ts
export async function callStability(request: PaintingProviderRequest, fetchImpl: typeof fetch) {
  const endpoint =
    request.operation === 'upscale'
      ? 'https://api.stability.ai/v2beta/stable-image/upscale/conservative'
      : 'https://api.stability.ai/v2beta/stable-image/generate/core';

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STABILITY_API_KEY || ''}`,
      Accept: 'image/*',
    },
    body: buildStabilityFormData(request),
  });

  const contentType = response.headers.get('content-type') || 'image/png';
  return [{ mimeType: contentType, b64: Buffer.from(await response.arrayBuffer()).toString('base64') }];
}
```

```ts
// lib/paintings/providers/freepik.ts
export async function callFreepik(request: PaintingProviderRequest, fetchImpl: typeof fetch) {
  const response = await fetchImpl('https://api.freepik.com/v1/ai/text-to-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-freepik-api-key': process.env.FREEPIK_API_KEY || '',
    },
    body: JSON.stringify({
      prompt: request.prompt,
      model: request.model,
      size: request.options.size,
    }),
  });

  const payload = await response.json();
  return payload.data.map((item: any) => ({
    mimeType: 'image/png',
    url: item.image_url,
  }));
}
```

```ts
// lib/paintings/providers/ollama.ts
export async function callOllama(request: PaintingProviderRequest, fetchImpl: typeof fetch) {
  const response = await fetchImpl(`${process.env.OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      images: request.inputs?.map((input) => input.buffer.toString('base64')) ?? [],
      stream: false,
    }),
  });

  const payload = await response.json();
  return [{ mimeType: 'image/png', b64: payload.image }];
}
```

- [ ] **Step 4: Run the provider tests and verify green**

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/providers.test.ts`

Expected: PASS with Stability, Freepik, and Ollama coverage green.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/bluedark/indexblue
git add lib/paintings/providers/stability.ts lib/paintings/providers/freepik.ts lib/paintings/providers/ollama.ts lib/paintings/service.ts tests/paintings/providers.test.ts
git commit -m "feat: add additional paintings providers"
```

## Task 5: Add auth-gated Paintings API routes

**Files:**
- Create: `app/api/paintings/models/route.ts`
- Create: `app/api/paintings/history/route.ts`
- Create: `app/api/paintings/generate/route.ts`
- Create: `app/api/paintings/transform/route.ts`
- Create: `app/api/paintings/assets/[id]/route.ts`
- Create: `app/api/paintings/history/[id]/route.ts`
- Test: `tests/paintings/route-validation.test.ts`

- [ ] **Step 1: Write failing route-validation tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

const { generateRequestSchema, transformRequestSchema } = (await import(
  new URL('../../app/api/paintings/generate/route.ts', import.meta.url).href
)) as typeof import('../../app/api/paintings/generate/route');

test('generateRequestSchema rejects empty prompts', () => {
  const parsed = generateRequestSchema.safeParse({
    provider: 'openai',
    model: 'gpt-image-1',
    prompt: '',
    options: {},
  });

  assert.equal(parsed.success, false);
});

test('transformRequestSchema requires at least one input image', () => {
  const parsed = transformRequestSchema.safeParse({
    provider: 'stability',
    model: 'stable-image-ultra',
    operation: 'upscale',
    prompt: 'Upscale this',
    options: {},
    inputs: [],
  });

  assert.equal(parsed.success, false);
});
```

- [ ] **Step 2: Run the route-validation tests and verify red**

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/route-validation.test.ts`

Expected: FAIL because the route modules and exported schemas do not exist yet.

- [ ] **Step 3: Implement the routes and exported schemas**

```ts
// app/api/paintings/generate/route.ts
export const generateRequestSchema = z.object({
  provider: z.enum(['openai', 'google', 'stability', 'freepik', 'ollama']),
  model: z.string().min(1),
  prompt: z.string().min(1),
  options: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = generateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid generate payload', issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await executePaintingRequest({
    userId: user.id,
    ...parsed.data,
    operation: 'generate',
    repository: createPaintingRepository(),
    fetchImpl: fetch,
    uploadToBlob: uploadPaintingBlob,
  });

  return Response.json(result);
}
```

```ts
// app/api/paintings/transform/route.ts
export const transformRequestSchema = z.object({
  provider: z.enum(['openai', 'google', 'stability', 'freepik', 'ollama']),
  model: z.string().min(1),
  operation: z.enum(['edit', 'remix', 'upscale']),
  prompt: z.string().optional(),
  options: z.record(z.string(), z.unknown()).default({}),
  inputs: z.array(z.object({
    mimeType: z.string().min(1),
    base64: z.string().min(1),
  })).min(1),
});
```

```ts
// app/api/paintings/models/route.ts
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({
    models: listConfiguredPaintingModels(process.env),
  });
}
```

- [ ] **Step 4: Run the route-validation tests and typecheck**

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/route-validation.test.ts`

Expected: PASS.

Run: `cd /home/ubuntu/bluedark/indexblue && pnpm typecheck`

Expected: PASS with no new TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/bluedark/indexblue
git add app/api/paintings tests/paintings/route-validation.test.ts
git commit -m "feat: add paintings api routes"
```

## Task 6: Add the Paintings workspace UI and sidebar integration

**Files:**
- Modify: `components/app-sidebar.tsx`
- Create: `app/paintings/layout.tsx`
- Create: `app/paintings/page.tsx`
- Create: `components/paintings/paintings-workspace.tsx`
- Create: `components/paintings/control-panel.tsx`
- Create: `components/paintings/model-selector.tsx`
- Create: `components/paintings/artboard.tsx`
- Create: `components/paintings/prompt-composer.tsx`
- Create: `components/paintings/history-strip.tsx`
- Test: `tests/paintings/sidebar-nav.test.ts`

- [ ] **Step 1: Write a failing sidebar/navigation test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('app sidebar includes a Paintings link', async () => {
  const source = await fs.readFile(
    new URL('../../components/app-sidebar.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /href=\"\\/paintings\"/);
  assert.match(source, />Paintings</);
});
```

- [ ] **Step 2: Run the sidebar test and verify red**

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/sidebar-nav.test.ts`

Expected: FAIL because the sidebar does not include Paintings yet.

- [ ] **Step 3: Implement the UI route, workspace, and sidebar entry**

```tsx
// app/paintings/layout.tsx
import type { ReactNode } from 'react';
import { SidebarLayout } from '@/components/sidebar-layout';

export default function PaintingsLayout({ children }: { children: ReactNode }) {
  return <SidebarLayout>{children}</SidebarLayout>;
}
```

```tsx
// app/paintings/page.tsx
import { PaintingsWorkspace } from '@/components/paintings/paintings-workspace';

export default function PaintingsPage() {
  return <PaintingsWorkspace />;
}
```

```tsx
// components/paintings/paintings-workspace.tsx
export function PaintingsWorkspace() {
  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)] gap-4 p-4">
      <ControlPanel />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Artboard />
        <PromptComposer />
      </div>
      <HistoryStrip />
    </div>
  );
}
```

```tsx
// components/app-sidebar.tsx
<SidebarMenuItem>
  <SidebarMenuButton
    asChild
    tooltip="Paintings"
    className={cn(
      'hover:bg-primary/10 transition-all duration-200',
      pathname === '/paintings' || pathname?.startsWith('/paintings/')
        ? 'bg-primary/15 text-foreground font-medium'
        : '',
    )}
  >
    <Link href="/paintings" onClick={closeMobileSidebar} className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-full">
      <Palette className="h-[18px] w-[18px]" />
      <span className="group-data-[collapsible=icon]:hidden">Paintings</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

- [ ] **Step 4: Run the sidebar test and repo checks**

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/sidebar-nav.test.ts`

Expected: PASS.

Run: `cd /home/ubuntu/bluedark/indexblue && pnpm lint components/app-sidebar.tsx app/paintings/page.tsx components/paintings/paintings-workspace.tsx`

Expected: PASS for touched UI files.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/bluedark/indexblue
git add components/app-sidebar.tsx app/paintings components/paintings tests/paintings/sidebar-nav.test.ts
git commit -m "feat: add paintings workspace ui"
```

## Task 7: Wire history, actions, and final verification

**Files:**
- Modify: `components/paintings/paintings-workspace.tsx`
- Modify: `components/paintings/control-panel.tsx`
- Modify: `components/paintings/artboard.tsx`
- Modify: `components/paintings/prompt-composer.tsx`
- Modify: `components/paintings/history-strip.tsx`
- Modify: `lib/db/queries.ts` if user preferences helpers are needed
- Test: `tests/paintings/service.test.ts`
- Test: `tests/paintings/providers.test.ts`
- Test: `tests/paintings/route-validation.test.ts`
- Test: `tests/paintings/sidebar-nav.test.ts`

- [ ] **Step 1: Write a failing service/UI integration test for retry-safe history behavior**

```ts
test('failed runs leave the last successful output available in history payloads', async () => {
  const { mergePaintingHistoryState } = (await import(
    new URL('../../components/paintings/paintings-workspace.tsx', import.meta.url).href
  )) as typeof import('../../components/paintings/paintings-workspace');

  const state = mergePaintingHistoryState(
    [{ id: 'run_ok', status: 'completed', outputs: [{ storageUrl: 'https://blob.test/ok.png' }] }],
    { id: 'run_fail', status: 'error', outputs: [] },
  );

  assert.equal(state.selectedRunId, 'run_fail');
  assert.equal(state.visibleOutputUrl, 'https://blob.test/ok.png');
});
```

- [ ] **Step 2: Run the full Paintings test set and verify red where expected**

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/*.test.ts`

Expected: At least one failure for the missing history-state behavior.

- [ ] **Step 3: Implement final state wiring, retries, delete, and persisted preferences**

```tsx
// components/paintings/paintings-workspace.tsx
export function mergePaintingHistoryState(
  runs: PaintingHistoryItem[],
  activeRun: PaintingHistoryItem | null,
) {
  const lastCompleted = [activeRun, ...runs].find((run) => run?.status === 'completed' && run.outputs[0]?.storageUrl);
  return {
    selectedRunId: activeRun?.id ?? runs[0]?.id ?? null,
    visibleOutputUrl: activeRun?.outputs[0]?.storageUrl ?? lastCompleted?.outputs[0]?.storageUrl ?? null,
  };
}
```

```ts
// lib/db/queries.ts or a dedicated helper
export async function upsertPaintingsPreferences(input: {
  userId: string;
  preferences: {
    'paintings-provider'?: string;
    'paintings-model'?: string;
    'paintings-size'?: string;
    'paintings-operation'?: 'generate' | 'edit' | 'remix' | 'upscale';
  };
}) {
  const current = await getUserPreferencesByUserId(input.userId);
  return upsertUserPreferences({
    userId: input.userId,
    preferences: {
      ...(current?.preferences ?? {}),
      ...input.preferences,
    },
  });
}
```

```tsx
// components/paintings/prompt-composer.tsx
async function handleSubmit() {
  const endpoint = operation === 'generate' ? '/api/paintings/generate' : '/api/paintings/transform';
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  // update local state, refresh history, preserve last good artboard output on failures
}
```

- [ ] **Step 4: Run final verification**

Run: `cd /home/ubuntu/bluedark/indexblue && node --test tests/paintings/*.test.ts`

Expected: PASS for the Paintings test suite.

Run: `cd /home/ubuntu/bluedark/indexblue && pnpm typecheck`

Expected: PASS.

Run: `cd /home/ubuntu/bluedark/indexblue && pnpm lint`

Expected: PASS or only pre-existing warnings unrelated to Paintings.

Manual verification:

```bash
cd /home/ubuntu/bluedark/indexblue
pnpm dev
```

Expected manual checks:

- `/paintings` appears in the sidebar
- configured providers show up in the left rail
- generate works for a configured provider
- unsupported controls stay hidden
- history reloads after refresh
- failed runs can be retried
- delete removes a run from the history strip
- download resolves a stable blob-backed file

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/bluedark/indexblue
git add components/paintings lib/db/queries.ts tests/paintings
git commit -m "feat: complete paintings workspace flows"
```
