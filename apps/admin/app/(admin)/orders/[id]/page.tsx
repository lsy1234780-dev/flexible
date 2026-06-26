import { getAdminOrder } from '@/actions/orders';
import OrderDetailClient from './OrderDetailClient';
import { notFound } from 'next/navigation';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const order = await getAdminOrder(id);
    if (!order) notFound();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <OrderDetailClient order={order as any} />;
  } catch (e) {
    console.error('[OrderDetail]', id, e);
    notFound();
  }
}
