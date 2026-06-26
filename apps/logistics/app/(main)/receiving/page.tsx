import {
  getReceivingOrders,
  getPendingReceivingItems,
  getReceivingHistory,
  getStagingItems,
} from '@/actions/receiving';
import ReceivingClient from './ReceivingClient';

export default async function ReceivingPage() {
  const [orders, pendingItems, history, stagingItems] = await Promise.all([
    getReceivingOrders(),
    getPendingReceivingItems(),
    getReceivingHistory(),
    getStagingItems(),
  ]);

  return (
    <ReceivingClient
      orders={orders as unknown as Parameters<typeof ReceivingClient>[0]['orders']}
      pendingItems={pendingItems}
      history={history as unknown as Parameters<typeof ReceivingClient>[0]['history']}
      stagingItems={stagingItems as unknown as Parameters<typeof ReceivingClient>[0]['stagingItems']}
    />
  );
}
