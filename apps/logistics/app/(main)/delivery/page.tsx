import { getShippedOrders, getPackedOrders, getRecentCompletedOrders } from '@/actions/orders';
import DeliveryClient from './DeliveryClient';

export const dynamic = 'force-dynamic';

export default async function DeliveryPage() {
  const [shippedOrders, packedOrders, completedOrders] = await Promise.all([
    getShippedOrders(),
    getPackedOrders(),
    getRecentCompletedOrders(10),
  ]);

  return (
    <DeliveryClient
      shippedOrders={shippedOrders as unknown as Parameters<typeof DeliveryClient>[0]['shippedOrders']}
      packedOrders={packedOrders as unknown as Parameters<typeof DeliveryClient>[0]['packedOrders']}
      completedOrders={completedOrders as unknown as Parameters<typeof DeliveryClient>[0]['completedOrders']}
    />
  );
}
