import { auth } from '@/lib/auth';
import { redactCloudInfraCommandPayloadForClient } from '@/lib/cloud/command-payloads';
import {
  cancelCloudInfraCommandForUser,
  getCloudInfraCommandByIdForUser,
  getCloudInfraMachineByIdForUser,
  listCloudInfraCommandEvents,
} from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ infraId: string; commandId: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { infraId, commandId } = await params;
  const machine = await getCloudInfraMachineByIdForUser({
    infraId,
    userId: session.user.id,
  });

  if (!machine) {
    return Response.json({ error: 'Infra machine not found.' }, { status: 404 });
  }

  const command = await getCloudInfraCommandByIdForUser({
    commandId,
    infraId: machine.id,
    userId: session.user.id,
  });

  if (!command) {
    return Response.json({ error: 'Command not found.' }, { status: 404 });
  }

  const events = await listCloudInfraCommandEvents({
    commandId: command.id,
    limit: 1000,
  });

  return Response.json({
    command: {
      id: command.id,
      type: command.type,
      status: command.status,
      payload: redactCloudInfraCommandPayloadForClient(command.type, command.payload),
      result: command.result,
      errorMessage: command.errorMessage,
      createdAt: command.createdAt.toISOString(),
      startedAt: command.startedAt?.toISOString() ?? null,
      completedAt: command.completedAt?.toISOString() ?? null,
      events: events.map((event) => ({
        id: event.id,
        stream: event.stream,
        message: event.message,
        sequence: event.sequence,
        createdAt: event.createdAt.toISOString(),
      })),
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ infraId: string; commandId: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { infraId, commandId } = await params;
  const machine = await getCloudInfraMachineByIdForUser({
    infraId,
    userId: session.user.id,
  });

  if (!machine) {
    return Response.json({ error: 'Infra machine not found.' }, { status: 404 });
  }

  const command = await getCloudInfraCommandByIdForUser({
    commandId,
    infraId: machine.id,
    userId: session.user.id,
  });

  if (!command) {
    return Response.json({ error: 'Command not found.' }, { status: 404 });
  }

  if (command.status !== 'queued' && command.status !== 'running') {
    return Response.json({
      command: {
        id: command.id,
        type: command.type,
        status: command.status,
        payload: redactCloudInfraCommandPayloadForClient(command.type, command.payload),
        result: command.result,
        errorMessage: command.errorMessage,
        createdAt: command.createdAt.toISOString(),
        startedAt: command.startedAt?.toISOString() ?? null,
        completedAt: command.completedAt?.toISOString() ?? null,
        events: [],
      },
    });
  }

  const cancelled = await cancelCloudInfraCommandForUser({
    commandId: command.id,
    infraId: machine.id,
    userId: session.user.id,
  });

  if (!cancelled) {
    return Response.json({ error: 'Command not found.' }, { status: 404 });
  }

  return Response.json({
    command: {
      id: cancelled.id,
      type: cancelled.type,
      status: cancelled.status,
      payload: redactCloudInfraCommandPayloadForClient(cancelled.type, cancelled.payload),
      result: cancelled.result,
      errorMessage: cancelled.errorMessage,
      createdAt: cancelled.createdAt.toISOString(),
      startedAt: cancelled.startedAt?.toISOString() ?? null,
      completedAt: cancelled.completedAt?.toISOString() ?? null,
      events: [],
    },
  });
}
