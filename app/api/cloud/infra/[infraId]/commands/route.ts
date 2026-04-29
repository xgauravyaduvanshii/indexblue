import { z } from 'zod';
import { auth } from '@/lib/auth';
import { serverEnv } from '@/env/server';
import {
  prepareCloudInfraCommandPayloadForStorage,
  redactCloudInfraCommandPayloadForClient,
} from '@/lib/cloud/command-payloads';
import { createCloudInfraCommand, getCloudInfraMachineByIdForUser, listCloudInfraCommands } from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

const commandSchema = z.object({
  type: z.enum([
    'exec',
    'sudo:configure',
    'infra:stop',
    'infra:restart',
    'infra:disconnect',
    'fs:list',
    'fs:read',
    'fs:write',
    'fs:delete',
    'fs:mkdir',
    'fs:move',
    'fs:copy',
    'sandbox:list',
    'sandbox:create',
    'sandbox:start',
    'sandbox:stop',
    'sandbox:restart',
    'sandbox:delete',
  ]),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export async function GET(request: Request, { params }: { params: Promise<{ infraId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { infraId } = await params;
  const machine = await getCloudInfraMachineByIdForUser({
    infraId,
    userId: session.user.id,
  });

  if (!machine) {
    return Response.json({ error: 'Infra machine not found.' }, { status: 404 });
  }

  const commands = await listCloudInfraCommands({
    infraId: machine.id,
    userId: session.user.id,
    limit: 80,
    excludeTypes: ['preview:fetch'],
  });

  return Response.json({
    commands: commands.map((command) => ({
      id: command.id,
      type: command.type,
      status: command.status,
      payload: redactCloudInfraCommandPayloadForClient(command.type, command.payload),
      result: command.result,
      errorMessage: command.errorMessage,
      createdAt: command.createdAt.toISOString(),
      startedAt: command.startedAt?.toISOString() ?? null,
      completedAt: command.completedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ infraId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid command payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { infraId } = await params;
  const machine = await getCloudInfraMachineByIdForUser({
    infraId,
    userId: session.user.id,
  });

  if (!machine) {
    return Response.json({ error: 'Infra machine not found.' }, { status: 404 });
  }

  if (parsed.data.type === 'sudo:configure' && parsed.data.payload.forcePasswordless === true) {
    return Response.json(
      { error: 'Force passwordless sudo is not supported through IndexBlue for host safety.' },
      { status: 400 },
    );
  }

  const command = await createCloudInfraCommand({
    infraId: machine.id,
    userId: session.user.id,
    type: parsed.data.type,
    payload: prepareCloudInfraCommandPayloadForStorage(
      parsed.data.type,
      parsed.data.payload,
      `${serverEnv.BETTER_AUTH_SECRET}:cloud-infra-command-payloads`,
    ),
  });

  if (!command) {
    return Response.json({ error: 'Failed to create command.' }, { status: 500 });
  }

  return Response.json({
    command: {
      id: command.id,
      type: command.type,
      status: command.status,
      payload: redactCloudInfraCommandPayloadForClient(command.type, command.payload),
      createdAt: command.createdAt.toISOString(),
    },
  });
}
