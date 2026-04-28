import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/auth-utils';
import { getBuilderProjectByIdForUser } from '@/lib/db/builder-project-queries';
import { getMessagesByChatId } from '@/lib/db/queries';
import { convertToUIMessages } from '@/lib/chat-messages';
import { buildWorkspaceTree } from '@/lib/builder/workspace';
import { BuilderProjectWorkspace } from '@/components/builder-project-workspace';

export default async function BuilderProjectPage({
  params,
}: {
  params: Promise<{ projectid: string }>;
}) {
  const user = await getUser();

  if (!user?.id) {
    redirect('/sign-in?redirectTo=/builder');
  }

  const { projectid } = await params;
  const project = await getBuilderProjectByIdForUser({
    projectId: projectid,
    userId: user.id,
  });

  if (!project) {
    notFound();
  }

  const [dbMessages, initialTree] = await Promise.all([
    getMessagesByChatId({ id: project.chatId, limit: 200 }),
    project.workspacePath ? buildWorkspaceTree(project.workspacePath) : Promise.resolve([]),
  ]);

  return (
    <BuilderProjectWorkspace
      project={project}
      initialMessages={convertToUIMessages(dbMessages)}
      initialTree={initialTree}
    />
  );
}
