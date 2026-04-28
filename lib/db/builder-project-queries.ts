import 'server-only';

import { cache } from 'react';
import { and, asc, desc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { maindb } from './index';
import { buildSession, builderProject, chat } from './schema';
import { createBuildSession, saveNewChatWithStream } from './queries';
import { ChatSDKError } from '@/lib/errors';

export type BuilderProjectSourceType = 'github' | 'zip' | 'template' | 'local' | 'ssh' | 'empty';

type BuilderProjectMetadata = typeof builderProject.$inferInsert['metadata'];

export async function createBuilderProjectWorkspace({
  userId,
  name,
  sourceType,
  workspacePath,
  theme,
  metadata,
}: {
  userId: string;
  name: string;
  sourceType: BuilderProjectSourceType;
  workspacePath?: string | null;
  theme?: string | null;
  metadata?: BuilderProjectMetadata;
}) {
  const chatId = uuidv7();
  const streamId = `stream-${uuidv7()}`;

  try {
    await saveNewChatWithStream({
      chatId,
      userId,
      title: name,
      visibility: 'private',
      streamId,
    });

    await createBuildSession({
      chatId,
      userId,
      runtime: 'node',
    });

    const [project] = await maindb
      .insert(builderProject)
      .values({
        userId,
        chatId,
        name,
        sourceType,
        workspacePath: workspacePath ?? null,
        theme: theme ?? null,
        metadata: metadata ?? {},
      })
      .returning();

    return project;
  } catch (error) {
    console.error('Failed to create builder project workspace:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to create builder project');
  }
}

export const getBuilderProjectByIdForUser = cache(async ({ projectId, userId }: { projectId: string; userId: string }) => {
  try {
    const [project] = await maindb
      .select({
        id: builderProject.id,
        userId: builderProject.userId,
        chatId: builderProject.chatId,
        name: builderProject.name,
        sourceType: builderProject.sourceType,
        workspacePath: builderProject.workspacePath,
        theme: builderProject.theme,
        metadata: builderProject.metadata,
        createdAt: builderProject.createdAt,
        updatedAt: builderProject.updatedAt,
        chatUpdatedAt: chat.updatedAt,
        buildStatus: buildSession.status,
        buildRuntime: buildSession.runtime,
        boxId: buildSession.boxId,
      })
      .from(builderProject)
      .innerJoin(chat, eq(builderProject.chatId, chat.id))
      .leftJoin(buildSession, eq(buildSession.chatId, builderProject.chatId))
      .where(and(eq(builderProject.id, projectId), eq(builderProject.userId, userId)))
      .limit(1);

    return project ?? null;
  } catch (error) {
    console.error('Failed to fetch builder project:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to load builder project');
  }
});

export async function updateBuilderProjectTheme({
  projectId,
  userId,
  theme,
  metadata,
}: {
  projectId: string;
  userId: string;
  theme: string | null;
  metadata?: BuilderProjectMetadata;
}) {
  try {
    const [project] = await maindb
      .update(builderProject)
      .set({
        theme,
        ...(metadata !== undefined ? { metadata } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(builderProject.id, projectId), eq(builderProject.userId, userId)))
      .returning();

    return project ?? null;
  } catch (error) {
    console.error('Failed to update builder project theme:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to update builder project theme');
  }
}

export async function listBuilderProjectsByUserId({ userId, limit = 24 }: { userId: string; limit?: number }) {
  try {
    return await maindb
      .select({
        id: builderProject.id,
        name: builderProject.name,
        sourceType: builderProject.sourceType,
        workspacePath: builderProject.workspacePath,
        theme: builderProject.theme,
        createdAt: builderProject.createdAt,
        updatedAt: builderProject.updatedAt,
        chatId: builderProject.chatId,
      })
      .from(builderProject)
      .where(eq(builderProject.userId, userId))
      .orderBy(desc(builderProject.updatedAt), asc(builderProject.name))
      .limit(limit);
  } catch (error) {
    console.error('Failed to list builder projects:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to list builder projects');
  }
}
