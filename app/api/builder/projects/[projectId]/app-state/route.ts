import { NextRequest } from 'next/server';
import { requireBuilderProjectAccess } from '@/lib/builder/project-context';
import { decryptBuilderSecret } from '@/lib/builder/secrets';
import { readProjectWorkspaceEnvFile } from '@/lib/builder/app-runtime';
import { getBuilderProjectAppState, listBuilderProjectEvents } from '@/lib/db/builder-app-queries';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const { project, session } = access;
  const [appState, workspaceEnv, events] = await Promise.all([
    getBuilderProjectAppState({
      projectId: project.id,
      userId: session.user.id,
    }),
    readProjectWorkspaceEnvFile(project),
    listBuilderProjectEvents({
      projectId: project.id,
      userId: session.user.id,
      limit: 80,
    }),
  ]);

  const envFromDb = Object.fromEntries(
    appState.envVars.map((row) => {
      try {
        return [row.key, decryptBuilderSecret(row.encryptedValue)];
      } catch {
        return [row.key, ''];
      }
    }),
  );

  const envRows = Object.entries({
    ...workspaceEnv,
    ...envFromDb,
  }).map(([key, value]) => ({
    key,
    value,
    source: key in envFromDb ? 'database' : 'workspace',
    isSecret: key in envFromDb,
  }));

  const integrations = appState.integrations.map((integration) => ({
    ...integration,
    credentials: integration.encryptedCredentials
      ? (() => {
          try {
            return JSON.parse(decryptBuilderSecret(integration.encryptedCredentials)) as Record<string, string>;
          } catch {
            return {};
          }
        })()
      : {},
  }));

  return Response.json({
    integrations,
    envVars: envRows,
    assets: appState.assets,
    jobs: appState.jobs,
    toolStates: appState.toolStates,
    events,
  });
}
