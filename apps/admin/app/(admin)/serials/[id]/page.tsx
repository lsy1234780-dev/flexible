import { getProductForSerials, getSerialStatusCounts } from '@/actions/products';
import { notFound } from 'next/navigation';
import SerialDetailClient from './SerialDetailClient';
import type { ComponentProps } from 'react';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SerialDetailPage({ params }: Props) {
  const { id } = await params;
  try {
    const [product, statusCounts] = await Promise.all([
      getProductForSerials(id),
      getSerialStatusCounts(id),
    ]);
    return <SerialDetailClient product={product as unknown as ComponentProps<typeof SerialDetailClient>['product']} statusCounts={statusCounts} />;
  } catch {
    notFound();
  }
}
