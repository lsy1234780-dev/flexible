import { getReceivingOrderDetail } from '@/actions/receiving';
import ReceivingOrderDetailClient from './ReceivingOrderDetailClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReceivingOrderDetailPage({ params }: Props) {
  const { id } = await params;
  const order = await getReceivingOrderDetail(id);

  return <ReceivingOrderDetailClient order={order as unknown as Parameters<typeof ReceivingOrderDetailClient>[0]['order']} />;
}
