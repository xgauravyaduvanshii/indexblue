import { redirect } from 'next/navigation';
import { CloudInfraDetailPage } from '@/components/cloud-infra-detail-page';
import { getUser } from '@/lib/auth-utils';

export default async function CloudInfrastructureDetailRoute({
  params,
}: {
  params: Promise<{ infraId: string }>;
}) {
  const { infraId } = await params;
  const user = await getUser();

  if (!user?.id) {
    redirect(`/sign-in?redirectTo=/cloud-infrastructure/${infraId}`);
  }

  return <CloudInfraDetailPage infraId={infraId} />;
}
