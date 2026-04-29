import { redirect } from 'next/navigation';

export default async function BuilderCloudDevicePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  redirect(`/cloud-infrastructure/device/${code}`);
}
