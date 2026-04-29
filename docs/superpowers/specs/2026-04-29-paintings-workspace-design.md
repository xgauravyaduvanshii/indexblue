# Paintings Workspace Design

Date: 2026-04-29
Repo: `indexblue`
Status: Approved for planning

## Summary

Add a new top-level `Paintings` workspace to `indexblue` as an app-level image-generation surface inspired by Cherry Studio's Paintings page, but implemented using `indexblue`'s existing Next.js, sidebar, auth, storage, and database patterns.

The first release will cover:

- Text-to-image generation
- Image edit/remix/upscale where supported by the selected provider
- Shared, capability-driven UI rather than provider-specific custom pages
- App-level server credentials rather than per-user BYOK

Supported providers in the first release:

- OpenAI
- Google
- Stability
- Freepik
- Ollama, marked experimental

## Goals

- Add `Paintings` as a new sidebar destination alongside the existing top-level workspaces.
- Deliver a Cherry-Studio-like three-column experience with controls, artboard, and history.
- Support multiple image providers behind a normalized server-side adapter layer.
- Persist runs and generated assets as stable history entries for each signed-in user.
- Reuse existing `indexblue` patterns for auth, blob storage, data access, and page layout.

## Non-Goals

- No provider-specific custom pages in the first release.
- No per-user API key management or BYOK flows.
- No attempt to merge image-generation models into the existing text-model routing layer.
- No Builder-project coupling; Paintings is an app-level workspace, not a Builder tool.

## Current Repo Context

Relevant existing structures in `indexblue`:

- Sidebar navigation lives in `components/app-sidebar.tsx`
- Shared shell patterns exist in `components/sidebar-layout.tsx`
- Provider and model plumbing for text LLMs currently lives in `ai/providers.ts` and `ai/models.ts`
- App-level preferences are stored in `user_preferences`
- Auth-gated route handlers already exist in `app/api/*`
- Generated media already uses blob-backed storage patterns in `lib/builder/media.ts`
- Backend tests use `node:test` in `tests/`

This design follows those patterns instead of introducing a separate app architecture.

## Product Shape

Create a dedicated route group under `app/paintings` and add a new `Paintings` top-level sidebar item.

The workspace uses a three-column layout:

- Left control rail
- Center artboard and prompt composer
- Right history strip

Core user experience:

- Pick a provider and model
- Configure options like size, count, quality, background, seed, or style when available
- Generate images from a prompt
- Optionally edit, remix, or upscale images when the selected model supports that operation
- Reopen prior runs from history and download outputs

## UX Layout

### Left Rail

The control panel contains:

- Provider selector
- Model selector
- Operation selector: `generate`, `edit`, `remix`, `upscale`
- Prompt settings such as size, quality, background, count, style, seed, and aspect ratio where applicable
- Input image or mask selectors for edit-style flows
- Primary action button

Controls are capability-driven. The selected model determines which controls are shown and which operations are enabled.

### Center Panel

The center panel contains:

- Main artboard with loading, empty, success, and error states
- Result carousel or result pager for multi-image outputs
- Prompt composer
- Retry and regenerate actions
- Download action

The artboard should preserve the last successful output even if a later run fails.

### Right Rail

The history strip contains:

- Recent run thumbnails
- Pending and failed states
- Reopen behavior for older runs
- Delete action for user cleanup

History is user-scoped and should reload cleanly on refresh.

## Provider and Capability Model

The UI is driven by a normalized image-model catalog, not by hardcoded provider pages.

Each model entry includes:

- `provider`
- `modelId`
- `label`
- `operations`
- `sizes`
- `defaults`
- optional feature flags such as `supportsMask`, `supportsSeed`, `supportsCount`, `supportsBackground`, `supportsQuality`, `experimental`

First-release expectations:

- OpenAI: generation and edit
- Google: generation-first
- Stability: generation, remix, upscale, and edit-style image transforms where supported
- Freepik: generation and edit-style operations where supported
- Ollama: surfaced only when configured and always marked experimental

If a provider is not configured, it must not appear in the model list returned to the client.

## Architecture

### Client

New client-facing modules:

- `app/paintings/page.tsx`
- `app/paintings/layout.tsx`
- `components/paintings/control-panel.tsx`
- `components/paintings/model-selector.tsx`
- `components/paintings/artboard.tsx`
- `components/paintings/prompt-composer.tsx`
- `components/paintings/history-strip.tsx`

The client is responsible for:

- loading available providers and models
- rendering capability-aware controls
- submitting generation and transform requests
- reflecting running, completed, and failed states
- hydrating and reopening history

### Server

New server-side modules:

- `lib/paintings/types.ts`
- `lib/paintings/catalog.ts`
- `lib/paintings/service.ts`
- `lib/paintings/storage.ts`
- `lib/paintings/providers/openai.ts`
- `lib/paintings/providers/google.ts`
- `lib/paintings/providers/stability.ts`
- `lib/paintings/providers/freepik.ts`
- `lib/paintings/providers/ollama.ts`

The server is responsible for:

- validating requests
- mapping requests into provider-specific payloads
- normalizing provider responses
- persisting run metadata
- persisting input and output assets
- returning stable URLs to the client

## Data Model

Do not reuse `builder_project_asset` because that table is project-scoped and Paintings is not part of Builder.

Add new user-scoped tables:

### `painting_run`

Fields:

- `id`
- `userId`
- `provider`
- `model`
- `operation`
- `prompt`
- `status`
- `requestPayload` as JSON
- `resultPayload` as JSON
- `errorMessage`
- `createdAt`
- `updatedAt`
- `completedAt`

Status values:

- `queued`
- `running`
- `completed`
- `error`

### `painting_asset`

Fields:

- `id`
- `runId`
- `userId`
- `role`
- `storageUrl`
- `storageKey`
- `mimeType`
- `width`
- `height`
- `metadata` as JSON
- `createdAt`

Role values:

- `input`
- `mask`
- `output`

### User Preferences

Reuse `user_preferences` for lightweight defaults only:

- last selected provider
- last selected model
- last selected size
- last selected operation

Do not store run history in `user_preferences`.

## API Surface

Add auth-gated routes under `app/api/paintings`:

### `GET /api/paintings/models`

Returns:

- configured providers
- available models
- capability metadata for each model

### `GET /api/paintings/history`

Returns:

- recent runs for the signed-in user
- associated output thumbnails and status information

### `POST /api/paintings/generate`

Handles text-to-image generation.

Request contains:

- provider
- model
- prompt
- provider-normalized options

### `POST /api/paintings/transform`

Handles:

- edit
- remix
- upscale

Request contains:

- provider
- model
- operation
- prompt when required
- input image and optional mask payloads
- operation-specific options

### `GET /api/paintings/assets/[id]`

Returns metadata for a specific asset plus its stable blob-backed URL.

### `DELETE /api/paintings/history/[id]`

Deletes a run and its associated asset records, and removes blob objects where possible.

## Request and Storage Flow

1. Client loads models and history on page entry.
2. User selects provider and model.
3. UI renders only controls supported by that model.
4. For edit, remix, or upscale flows, the client submits input images to the server with the request payload.
5. Server creates a `painting_run` row in `running` state.
6. Server calls the correct provider adapter.
7. Provider response is normalized into one or more image outputs.
8. Every output is persisted to blob storage.
9. Server writes `painting_asset` rows for inputs, masks, and outputs.
10. Server marks the run `completed` or `error`.
11. Client refreshes history and updates the artboard.

Important storage rule:

- Even when a provider returns a remote URL, the server should fetch that asset and re-upload it to blob storage so history remains stable and downloadable later.

## Provider Adapter Rules

Each adapter should expose a small, consistent surface, for example:

- list or define supported models
- generate image
- transform image
- normalize errors

Adapters should hide provider-specific details such as:

- transport differences
- JSON versus multipart payloads
- temporary asset URLs
- provider-specific field names

The rest of the system should interact with adapters through normalized types only.

## Environment and Configuration

Use app-level server credentials.

Existing keys already available for reuse:

- `OPENAI_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`

Add new optional env variables:

- `STABILITY_API_KEY`
- `FREEPIK_API_KEY`
- `OLLAMA_BASE_URL`

Provider visibility rules:

- OpenAI appears only when `OPENAI_API_KEY` is present
- Google appears only when `GOOGLE_GENERATIVE_AI_API_KEY` is present
- Stability appears only when `STABILITY_API_KEY` is present
- Freepik appears only when `FREEPIK_API_KEY` is present
- Ollama appears only when `OLLAMA_BASE_URL` is present and is flagged experimental

## Error Handling and UX Behavior

The workspace should fail softly.

Rules:

- Missing credentials remove unavailable providers from the catalog instead of rendering broken controls
- Failed requests create durable history entries with `error` status
- Prompt and settings remain in place after failure so the user can retry quickly
- Switching models only resets fields that are invalid for the next model
- The artboard should continue showing the last successful result during subsequent failures
- Experimental providers must be visibly labeled

User-facing errors should be concise and actionable, while logs and raw provider failures stay server-side.

## Testing Strategy

Follow the repo's existing backend-focused testing style using `node:test`.

Add tests for:

- model catalog filtering by configured env
- request validation for generation and transform routes
- normalized result shaping in `lib/paintings/service.ts`
- provider adapter success and failure handling using mocked `fetch`
- persistence behavior for successful and failed runs
- deletion behavior for runs and stored assets

Add migration verification for the new painting tables.

Client-side testing should stay narrow and focus on high-value logic such as capability-based control visibility.

## Verification Targets For Implementation

Before claiming the feature is complete:

- `pnpm lint`
- `pnpm typecheck`
- targeted backend tests for paintings
- schema generation and migration checks for the new tables
- manual browser sanity check covering generate, transform, history reload, retry, delete, and download

## Implementation Slices

The implementation plan should likely break into these slices:

1. Sidebar and route scaffold
2. Data model and migrations
3. Shared paintings types, catalog, and service layer
4. Initial providers: OpenAI and Google
5. Additional providers: Stability and Freepik
6. Experimental Ollama adapter
7. Paintings UI and history workflow
8. Transform flows: edit, remix, upscale
9. Tests and verification

This is one coherent feature area, but it should still be implemented incrementally.

## Final Decision Summary

The approved approach is:

- one top-level `Paintings` workspace
- one shared, capability-driven page rather than provider-specific custom pages
- app-level provider credentials
- user-scoped history and persisted blob-backed assets
- first-release scope limited to generation plus edit/remix/upscale support where the provider supports it
- Ollama included only as experimental
