import { redirect } from 'next/navigation';
import { CloudInfrastructurePage } from '@/components/cloud-infrastructure-page';
import { getUser } from '@/lib/auth-utils';

export default async function CloudInfrastructureConsolePage() {
  const user = await getUser();

  if (!user?.id) {
    redirect('/sign-in?redirectTo=/cloud-infrastructure');
  }

  return <CloudInfrastructurePage />;
}
