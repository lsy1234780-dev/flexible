import { getShippedOrders, getPackedOrders, getRecentCompletedOrders } from '@/actions/orders';
import LogisticsDeliveryClient from './LogisticsDeliveryClient';

export const dynamic = 'force-dynamic';

export default async function LogisticsDeliveryPage() {
  const [shippedOrders, packedOrders, completedOrders] = await Promise.all([
    getShippedOrders(),
    getPackedOrders(),
    getRecentCompletedOrders(10),
  ]);

  return (
    <LogisticsDeliveryClient
      shippedOrders={shippedOrders as unknown as Parameters<typeof LogisticsDeliveryClient>[0]['shippedOrders']}
      packedOrders={packedOrders as unknown as Parameters<typeof LogisticsDeliveryClient>[0]['packedOrders']}
      completedOrders={completedOrders as unknown as Parameters<typeof LogisticsDeliveryClient>[0]['completedOrders']}
    />
  );
}
