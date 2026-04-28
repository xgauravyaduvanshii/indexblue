import { access as accessFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireBuilderProjectAccess } from '@/lib/builder/project-context';
import { BUILDER_REMOTE_PROJECT_PATH } from '@/lib/builder/paths';
import { createBuilderProjectJob, listBuilderProjectEnvVars } from '@/lib/db/builder-app-queries';
import {
  markProjectJobCompleted,
  markProjectJobFailed,
  streamCommandIntoProjectJob,
  syncProjectEnvFiles,
} from '@/lib/builder/app-runtime';
import { decryptBuilderSecret } from '@/lib/builder/secrets';

export const runtime = 'nodejs';

const schema = z.object({
  action: z.enum(['prepare', 'build-preview', 'build-production', 'submit-app-store']),
});

function getPublishCommand(action: z.infer<typeof schema>['action']) {
  switch (action) {
    case 'build-preview':
      return 'set -a; [ -f .env.local ] && source .env.local; set +a; npx --yes eas-cli build --platform ios --profile preview --non-interactive';
    case 'build-production':
      return 'set -a; [ -f .env.local ] && source .env.local; set +a; npx --yes eas-cli build --platform all --profile production --non-interactive';
    case 'submit-app-store':
      return 'set -a; [ -f .env.local ] && source .env.local; set +a; npx --yes eas-cli submit --platform ios --latest --non-interactive';
    default:
      return null;
  }
}

async function ensureEasFiles(workspacePath: string) {
  const easJsonPath = path.join(workspacePath, 'eas.json');

  try {
    await accessFile(easJsonPath, fsConstants.F_OK);
  } catch {
    await writeFile(
      easJsonPath,
      JSON.stringify(
        {
          cli: {
            version: '>= 12.0.0',
          },
          build: {
            preview: {
              distribution: 'internal',
            },
            production: {
              autoIncrement: true,
            },
          },
          submit: {
            production: {},
          },
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  const gitIgnorePath = path.join(workspacePath, '.gitignore');
  try {
    const content = await readFile(gitIgnorePath, 'utf8');
    if (!content.includes('.expo/')) {
      await writeFile(gitIgnorePath, `${content.trimEnd()}\n.expo/\n`, 'utf8');
    }
  } catch {
    await writeFile(gitIgnorePath, '.expo/\n.env.local\nnode_modules/\n', 'utf8');
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const access = await requireBuilderProjectAccess(request, params);
  if (access.status !== 200) {
    return access.response;
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid publish payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  if (!access.project.workspacePath) {
    return Response.json({ error: 'This project does not have a local workspace yet.' }, { status: 400 });
  }

  const envRows = await listBuilderProjectEnvVars({
    projectId: access.project.id,
    userId: access.session.user.id,
  });
  const envs = Object.fromEntries(
    envRows.map((row) => {
      try {
        return [row.key, decryptBuilderSecret(row.encryptedValue)];
      } catch {
        return [row.key, ''];
      }
    }),
  );

  const job = await createBuilderProjectJob({
    projectId: access.project.id,
    userId: access.session.user.id,
    kind: 'expo-publish',
    title: parsed.data.action,
    provider: 'expo-eas',
    status: 'running',
    payload: {
      action: parsed.data.action,
    },
  });

  if (!job) {
    return Response.json({ error: 'Failed to create publish job.' }, { status: 500 });
  }

  try {
    await ensureEasFiles(access.project.workspacePath);
    await syncProjectEnvFiles({
      project: access.project,
      userId: access.session.user.id,
      envs,
      fileName: '.env.local',
      reseedWorkspace: true,
    });

    if (parsed.data.action === 'prepare') {
      await markProjectJobCompleted({
        jobId: job.id,
        projectId: access.project.id,
        userId: access.session.user.id,
        channel: 'publish',
        type: 'expo.prepare.completed',
        message: 'Prepared EAS files and synced project environment.',
        result: {
          prepared: true,
          envCount: Object.keys(envs).length,
        },
      });

      return Response.json({
        jobId: job.id,
        prepared: true,
      });
    }

    const workspaceRoot = BUILDER_REMOTE_PROJECT_PATH;
    const command = getPublishCommand(parsed.data.action);

    if (!command) {
      throw new Error('Unsupported publish action.');
    }

    const result = await streamCommandIntoProjectJob({
      project: access.project,
      userId: access.session.user.id,
      jobId: job.id,
      channel: 'publish',
      type: `expo.${parsed.data.action}`,
      command,
      displayCommand: command.replace(/^set -a; \[ -f \.env\.local \] && source \.env\.local; set \+a; /, ''),
      cwd: workspaceRoot,
      reseedWorkspace: true,
    });

    if (result.exitCode !== 0) {
      throw new Error(result.output || 'Expo publish command failed.');
    }

    await markProjectJobCompleted({
      jobId: job.id,
      projectId: access.project.id,
      userId: access.session.user.id,
      channel: 'publish',
      type: `expo.${parsed.data.action}.completed`,
      message: `Completed ${parsed.data.action}`,
      result: {
        output: result.output,
      },
    });

    return Response.json({
      jobId: job.id,
      output: result.output,
    });
  } catch (error) {
    await markProjectJobFailed({
      jobId: job.id,
      projectId: access.project.id,
      userId: access.session.user.id,
      channel: 'publish',
      type: `expo.${parsed.data.action}.failed`,
      error,
    });

    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to run the Expo publish action.',
      },
      { status: 500 },
    );
  }
}
