import { getMyCompany } from '@/actions/catalog';
import { getOrders } from '@/actions/orders';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import OrdersClient from './OrdersClient';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const company = await getMyCompany();
  if (company.status !== 'active') {
    return (
      <div className="rounded-lg border bg-white p-12 text-center text-gray-400">
        승인 완료 후 발주 내역을 확인할 수 있습니다
      </div>
    );
  }

  const orders = await getOrders();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">발주 내역</h1>
        <Link href="/orders/new">
          <Button size="sm"><Plus size={16} /> 발주 신청</Button>
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border bg-white p-12 text-center text-gray-400">
          발주 내역이 없습니다
        </div>
      ) : (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <OrdersClient orders={orders as any} />
      )}
    </div>
  );
}
