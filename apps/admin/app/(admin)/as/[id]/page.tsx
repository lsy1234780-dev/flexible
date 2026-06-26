import { getAsRequest } from '@/actions/asRequests';
import { notFound } from 'next/navigation';
import AsDetailClient from './AsDetailClient';
import type { ComponentProps } from 'react';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AsDetailPage({ params }: Props) {
  const { id } = await params;
  const request = await getAsRequest(id).catch(() => null);
  if (!request) notFound();
  return (
    <AsDetailClient
      request={request as unknown as ComponentProps<typeof AsDetailClient>['request']}
    />
  );
}
