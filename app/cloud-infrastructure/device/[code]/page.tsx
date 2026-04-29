import { notFound, redirect } from 'next/navigation';
import { CloudDeviceApproval } from '@/components/cloud-device-approval';
import { getUser } from '@/lib/auth-utils';
import { getPlatformDeviceSessionByCode } from '@/lib/db/cloud-infra-queries';

export default async function CloudInfrastructureDeviceRoute({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const user = await getUser();
  const { code } = await params;

  if (!user?.id) {
    redirect(`/sign-in?redirectTo=/cloud-infrastructure/device/${code}`);
  }

  const session = await getPlatformDeviceSessionByCode(code);
  if (!session) {
    notFound();
  }

  return (
    <div className="max-w-2xl">
      <CloudDeviceApproval
        code={session.code}
        requestedLabel={session.requestedLabel}
        status={session.status}
        expired={session.expiresAt.getTime() < Date.now()}
      />
    </div>
  );
}
