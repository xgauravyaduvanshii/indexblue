import { z } from 'zod';
import { serverEnv } from '@/env/server';
import { prepareCloudInfraCommandPayloadForAgent } from '@/lib/cloud/command-payloads';
import { requirePlatformApiKey } from '@/lib/cloud/platform-auth';
import { claimNextCloudInfraCommand, getCloudInfraMachineById, updateCloudInfraMachine } from '@/lib/db/cloud-infra-queries';

export const runtime = 'nodejs';

const pullSchema = z.object({
  infraId: z.string().min(1),
  waitMs: z.number().int().min(0).max(20000).optional(),
});

const POLL_INTERVAL_MS = 1200;

export async function POST(request: Request) {
  const authResult = await requirePlatformApiKey(request);
  if (authResult.status !== 200) {
    return authResult.response;
  }

  const parsed = pullSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid command-pull payload.', issues: parsed.error.flatten() }, { status: 400 });
  }

  const machine = await getCloudInfraMachineById(parsed.data.infraId);
  if (!machine || machine.userId !== authResult.userId) {
    return Response.json({ error: 'Infra machine not found.' }, { status: 404 });
  }

  const deadline = Date.now() + (parsed.data.waitMs ?? 15000);

  while (Date.now() <= deadline) {
    const command = await claimNextCloudInfraCommand(machine.id);

    if (command) {
      await updateCloudInfraMachine({
        infraId: machine.id,
        status: 'online',
        lastSeenAt: new Date(),
      });

      return Response.json({
        command: {
          id: command.id,
          type: command.type,
          payload: prepareCloudInfraCommandPayloadForAgent(
            command.type,
            command.payload,
            `${serverEnv.BETTER_AUTH_SECRET}:cloud-infra-command-payloads`,
          ),
          createdAt: command.createdAt.toISOString(),
        },
      });
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  await updateCloudInfraMachine({
    infraId: machine.id,
    status: 'online',
    lastSeenAt: new Date(),
  });

  return Response.json({ command: null });
}
