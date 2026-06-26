'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { PurchaseOrder } from '@/actions/purchaseOrders';
import PurchaseOrderTable from './components/PurchaseOrderTable';
import CreatePurchaseOrderDialog from './components/CreatePurchaseOrderDialog';

interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  country: string | null;
}

interface Props {
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
}

export default function InboundManagementClient({
  purchaseOrders,
  suppliers,
}: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">발주 관리</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} className="mr-1" />
          새 발주
        </Button>
      </div>

      {/* 발주 목록 테이블 */}
      <Card>
        <CardContent className="p-0">
          <PurchaseOrderTable
            orders={purchaseOrders}
            onRowClick={(po) => router.push(`/receiving/${po.id}`)}
          />
        </CardContent>
      </Card>

      {/* 생성 다이얼로그 */}
      <CreatePurchaseOrderDialog
        open={showCreate}
        suppliers={suppliers}
        onClose={() => setShowCreate(false)}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
