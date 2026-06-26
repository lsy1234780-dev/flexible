import { getReceivingOrders, getProductsForReceiving } from '@/actions/receiving';
import ReceivingOrdersClient from './ReceivingOrdersClient';

export default async function ReceivingOrdersPage() {
  const [orders, products] = await Promise.all([
    getReceivingOrders(),
    getProductsForReceiving(),
  ]);

  return (
    <ReceivingOrdersClient
      orders={orders as unknown as Parameters<typeof ReceivingOrdersClient>[0]['orders']}
      products={products}
    />
  );
}
