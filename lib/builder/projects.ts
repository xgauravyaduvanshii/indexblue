import 'server-only';

import path from 'node:path';
import { createBuilderProjectWorkspace, type BuilderProjectSourceType } from '@/lib/db/builder-project-queries';

export function deriveBuilderProjectName({
  sourceType,
  workspacePath,
  fallbackName,
}: {
  sourceType: BuilderProjectSourceType;
  workspacePath?: string | null;
  fallbackName?: string | null;
}) {
  const fromPath = workspacePath ? path.basename(workspacePath) : null;
  const baseName = fallbackName?.trim() || fromPath || `${sourceType}-workspace`;
  return baseName.replace(/[-_]+/g, ' ').trim();
}

export async function createBuilderProjectFromWorkspace({
  userId,
  sourceType,
  workspacePath,
  fallbackName,
  metadata,
}: {
  userId: string;
  sourceType: BuilderProjectSourceType;
  workspacePath?: string | null;
  fallbackName?: string | null;
  metadata?: {
    sourceLabel?: string;
    sourceUrl?: string;
    sourceBranch?: string | null;
    importMeta?: Record<string, unknown>;
  };
}) {
  const name = deriveBuilderProjectName({
    sourceType,
    workspacePath,
    fallbackName,
  });

  const project = await createBuilderProjectWorkspace({
    userId,
    name,
    sourceType,
    workspacePath,
    metadata,
  });

  return {
    project,
    redirectTo: `/builder/projects/${project.id}`,
  };
}
