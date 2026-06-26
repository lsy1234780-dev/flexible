import { getAsRequest } from '@/actions/asRequests';
import { getCurrentUser } from '@/actions/auth';
import { notFound, redirect } from 'next/navigation';
import InspectClient from './InspectClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InspectPage({ params }: Props) {
  const { id } = await params;
  const [request, user] = await Promise.all([
    getAsRequest(id).catch(() => null),
    getCurrentUser().catch(() => null),
  ]);

  if (!request) notFound();

  // 검수 단계가 아니면 상세 페이지로 리다이렉트
  if (request.status !== 'inspecting' && request.status !== 'received') {
    redirect(`/as/${id}`);
  }

  return (
    <InspectClient
      request={request as Parameters<typeof InspectClient>[0]['request']}
      currentUserName={user?.name ?? ''}
    />
  );
}
