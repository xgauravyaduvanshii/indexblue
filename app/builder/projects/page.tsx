import { redirect } from 'next/navigation';
import { BuilderPageHeader } from '@/components/builder-page-header';
import { BuilderProjectsDashboard, type BuilderProjectsDashboardItem } from '@/components/builder-projects-dashboard';
import { getUser } from '@/lib/auth-utils';
import { listBuilderProjectsByUserId } from '@/lib/db/builder-project-queries';
import { getBuilderProjectMode, getBuilderProjectRuntimeProvider } from '@/lib/builder/project-metadata';

function normalizeSourceType(value: string): BuilderProjectsDashboardItem['sourceType'] {
  if (value === 'github' || value === 'zip' || value === 'template' || value === 'local' || value === 'ssh') {
    return value;
  }

  return 'empty';
}

export default async function BuilderProjectsPage() {
  const user = await getUser();

  if (!user?.id) {
    redirect('/sign-in?redirectTo=/builder/projects');
  }

  const projects = await listBuilderProjectsByUserId({
    userId: user.id,
    limit: 120,
  });

  const dashboardProjects: BuilderProjectsDashboardItem[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    mode: getBuilderProjectMode(project),
    sourceType: normalizeSourceType(project.sourceType),
    sourceLabel:
      typeof project.metadata?.sourceLabel === 'string' && project.metadata.sourceLabel.trim().length > 0
        ? project.metadata.sourceLabel
        : null,
    sourceUrl:
      typeof project.metadata?.sourceUrl === 'string' && project.metadata.sourceUrl.trim().length > 0
        ? project.metadata.sourceUrl
        : null,
    previewUrl:
      typeof project.metadata?.liveSession?.previewUrl === 'string' &&
      project.metadata.liveSession.previewUrl.trim().length > 0
        ? project.metadata.liveSession.previewUrl
        : null,
    runtimeProvider: getBuilderProjectRuntimeProvider(project),
    buildStatus: project.buildStatus,
    buildRuntime: project.buildRuntime,
    boxId: project.boxId,
    hasWorkspace: Boolean(project.workspacePath),
    updatedAt: project.updatedAt.toISOString(),
    createdAt: project.createdAt.toISOString(),
  }));

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col p-4 sm:p-6">
        <BuilderPageHeader active="projects" className="shrink-0 pt-2 sm:pt-4" />

        <div className="mt-8 flex flex-1 flex-col gap-8">
          <section className="rounded-[32px] border border-border/60 bg-card/35 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.18)] sm:p-8">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Builder Projects
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                See every builder workspace in one place
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                Open a project, launch its preview, stop its runtime, rerun the workspace, or remove it entirely. Web,
                app, local, and SSH builder projects all live here instead of inside the start screen.
              </p>
            </div>
          </section>

          <BuilderProjectsDashboard initialProjects={dashboardProjects} />
        </div>
      </div>
    </div>
  );
}
