'use client';

import { useState, useTransition } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateShipmentItem, removeShipmentItem, addShipmentItem } from '@/actions/inboundShipments';
import { toast } from 'sonner';

interface ShipmentItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number | null;
  memo: string | null;
  products: { name: string; barcode: string } | null;
}

interface Product {
  id: string;
  name: string;
  barcode: string;
}

interface Props {
  shipmentId: string;
  items: ShipmentItem[];
  products: Product[];
  onRefresh: () => void;
}

export default function ShipmentItemsTable({ shipmentId, items, products, onRefresh }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [newProductId, setNewProductId] = useState('');
  const [newQuantity, setNewQuantity] = useState(1);

  function handleQtyChange(itemId: string, qty: number) {
    if (qty < 1) return;
    startTransition(async () => {
      const res = await updateShipmentItem(itemId, { quantity: qty });
      if (res.error) toast.error(res.error);
      else onRefresh();
    });
  }

  function handleRemove(itemId: string) {
    startTransition(async () => {
      const res = await removeShipmentItem(itemId);
      if (res.error) toast.error(res.error);
      else onRefresh();
    });
  }

  function handleAdd() {
    if (!newProductId) { toast.error('제품을 선택하세요'); return; }
    startTransition(async () => {
      const res = await addShipmentItem(shipmentId, newProductId, newQuantity);
      if (res.error) toast.error(res.error);
      else {
        setShowAdd(false);
        setNewProductId('');
        setNewQuantity(1);
        onRefresh();
      }
    });
  }

  const totalAmount = items.reduce((s, i) => s + (i.quantity * (i.unit_cost ?? 0)), 0);

  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500">
            <th className="py-1.5 font-medium">제품</th>
            <th className="py-1.5 font-medium w-20 text-right">수량</th>
            <th className="py-1.5 font-medium w-24 text-right">단가</th>
            <th className="py-1.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-gray-100">
              <td className="py-1.5">
                <span className="text-sm">{item.products?.name ?? '(삭제된 제품)'}</span>
              </td>
              <td className="py-1.5 text-right">
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => handleQtyChange(item.id, parseInt(e.target.value) || 1)}
                  className="h-7 w-16 text-right text-sm ml-auto"
                  disabled={isPending}
                />
              </td>
              <td className="py-1.5 text-right text-gray-500">
                {item.unit_cost != null ? `₩${item.unit_cost.toLocaleString()}` : '-'}
              </td>
              <td className="py-1.5">
                <button
                  onClick={() => handleRemove(item.id)}
                  disabled={isPending}
                  className="text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-gray-400 text-xs">
                품목이 없습니다
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalAmount > 0 && (
        <div className="text-right text-xs text-gray-500">
          합계: ₩{totalAmount.toLocaleString()}
        </div>
      )}

      {showAdd ? (
        <div className="flex items-center gap-2">
          <select
            value={newProductId}
            onChange={(e) => setNewProductId(e.target.value)}
            className="flex-1 h-8 rounded-md border px-2 text-sm"
          >
            <option value="">제품 선택</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Input
            type="number"
            min={1}
            value={newQuantity}
            onChange={(e) => setNewQuantity(parseInt(e.target.value) || 1)}
            className="h-8 w-16 text-sm"
          />
          <Button size="sm" variant="outline" onClick={handleAdd} disabled={isPending}>
            추가
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
            취소
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-gray-400"
          onClick={() => setShowAdd(true)}
        >
          <Plus size={14} className="mr-1" />
          품목 추가
        </Button>
      )}
    </div>
  );
}
