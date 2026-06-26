import { getAdminOrders } from '@/actions/orders';
import { getInventory } from '@/actions/inventory';
import OrdersClient from './OrdersClient';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product } = await searchParams;
  const [orders, products] = await Promise.all([getAdminOrders(), getInventory()]);
  const productFilter = product?.split(',').filter(Boolean) ?? [];

  return (
    <OrdersClient
      orders={orders as unknown as Parameters<typeof OrdersClient>[0]['orders']}
      products={products.map((p) => ({ id: p.id, name: p.name }))}
      initialProductFilter={productFilter}
    />
  );
}
