import { redirect } from 'next/navigation';

export default async function BuilderCloudInfraDetailPage({
  params,
}: {
  params: Promise<{ infraId: string }>;
}) {
  const { infraId } = await params;
  redirect(`/cloud-infrastructure/${infraId}`);
}
