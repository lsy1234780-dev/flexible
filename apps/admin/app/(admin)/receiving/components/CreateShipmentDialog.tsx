'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createInboundShipment } from '@/actions/inboundShipments';
import { SHIPPING_TYPES } from '@/lib/inboundStages';
import type { PurchaseOrder } from '@/actions/purchaseOrders';
import { toast } from 'sonner';

interface Product {
  id: string;
  name: string;
  barcode: string;
}

interface NewItem {
  product_id: string;
  quantity: number;
  unit_cost?: number;
}

interface Props {
  open: boolean;
  products: Product[];
  purchaseOrders: PurchaseOrder[];
  preSelectedItems?: NewItem[];
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateShipmentDialog({ open, products, purchaseOrders, preSelectedItems, onClose, onCreated }: Props) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [shippingType, setShippingType] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [blNumber, setBlNumber] = useState('');
  const [eta, setEta] = useState('');
  const [memo, setMemo] = useState('');
  const [items, setItems] = useState<NewItem[]>([]);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [addProductId, setAddProductId] = useState('');
  const [addQty, setAddQty] = useState(1);

  // 연결된 발주의 품목 수량 맵
  const poItemQtyMap = useMemo(() => {
    if (!purchaseOrderId) return new Map<string, number>();
    const po = purchaseOrders.find((p) => p.id === purchaseOrderId);
    if (!po) return new Map<string, number>();
    return new Map(po.purchase_order_items.map((i) => [i.product_id, i.quantity]));
  }, [purchaseOrderId, purchaseOrders]);

  // 다이얼로그 열릴 때 초기화
  useEffect(() => {
    if (!open) return;
    // 발주가 1개면 항상 자동 연결
    if (purchaseOrders.length === 1) {
      setPurchaseOrderId(purchaseOrders[0].id);
      if (!title) setTitle(purchaseOrders[0].title);
    }
    // 선택된 품목이 있으면 세팅
    if (preSelectedItems && preSelectedItems.length > 0) {
      setItems(preSelectedItems);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function reset() {
    setTitle('');
    setShippingType('');
    setPurchaseOrderId('');
    setBlNumber('');
    setEta('');
    setMemo('');
    setItems([]);
    setShowAddItemDialog(false);
    setAddProductId('');
    setAddQty(1);
  }

  // 발주 선택 시 품목 자동 채우기
  function handlePurchaseOrderChange(poId: string) {
    setPurchaseOrderId(poId);
    if (!poId) return;
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;
    if (!title) setTitle(po.title);
    if (items.length === 0 && po.purchase_order_items.length > 0) {
      setItems(
        po.purchase_order_items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost ?? undefined,
        })),
      );
    }
  }

  function handleAddItem() {
    if (!addProductId) return;
    if (items.some((i) => i.product_id === addProductId)) {
      toast.error('이미 추가된 제품입니다');
      return;
    }
    setItems([...items, { product_id: addProductId, quantity: addQty }]);
    setAddProductId('');
    setAddQty(1);
    setShowAddItemDialog(false);
  }

  function updateItemQty(idx: number, qty: number) {
    if (qty < 1) return;
    setItems(items.map((item, i) => i === idx ? { ...item, quantity: qty } : item));
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    if (!title.trim()) { toast.error('제목을 입력하세요'); return; }

    startTransition(async () => {
      const res = await createInboundShipment({
        title: title.trim(),
        purchase_order_id: purchaseOrderId || undefined,
        shipping_type: shippingType || undefined,
        bl_number: blNumber || undefined,
        estimated_arrival: eta || undefined,
        memo: memo || undefined,
        items: items.length > 0 ? items : undefined,
      });

      if (res.error) { toast.error(res.error); return; }
      toast.success('운송 건 등록 완료');
      reset();
      onClose();
      onCreated();
    });
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>새 운송 건 등록</DialogTitle>
          <DialogDescription className="sr-only">운송 건 정보 입력</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 기본 정보 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">제목 *</label>
            <Input
              placeholder="예: 3월 2차 해외 입고"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">연결 발주</label>
              <select
                value={purchaseOrderId}
                onChange={(e) => handlePurchaseOrderChange(e.target.value)}
                className="w-full h-9 rounded-md border px-2 text-sm"
              >
                <option value="">선택 안함</option>
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.po_number ? `${po.po_number} - ` : ''}{po.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">운송 타입</label>
              <select
                value={shippingType}
                onChange={(e) => setShippingType(e.target.value)}
                className="w-full h-9 rounded-md border px-2 text-sm"
              >
                <option value="">선택</option>
                {SHIPPING_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">B/L · AWB 번호</label>
            <Input
              placeholder="예: MSKU1234567"
              value={blNumber}
              onChange={(e) => setBlNumber(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">도착 예정일</label>
              <Input
                type="date"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">메모</label>
              <Input
                placeholder="메모 (선택)"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
          </div>

          {/* 품목 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">품목</label>
            {items.length > 0 && (
              <div className="space-y-1">
                {items.map((item, idx) => {
                  const product = products.find((p) => p.id === item.product_id);
                  const poQty = poItemQtyMap.get(item.product_id);
                  const overQty = poQty != null && item.quantity > poQty;
                  return (
                    <div key={item.product_id} className="flex items-center gap-2 text-sm group">
                      <span className="flex-1 truncate">{product?.name ?? '?'}</span>
                      <span className="tabular-nums text-gray-600 text-xs">{item.quantity}개</span>
                      {overQty && (
                        <span className="text-amber-500 flex items-center gap-0.5 shrink-0" title={`발주 수량: ${poQty}`}>
                          <AlertTriangle size={10} />
                          <span className="text-[10px]">{poQty}</span>
                        </span>
                      )}
                      <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs"
              onClick={() => { setAddProductId(''); setAddQty(1); setShowAddItemDialog(true); }}
            >
              <Plus size={12} className="mr-1" />
              품목 추가
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>취소</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? '등록 중...' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 품목 추가 중첩 다이얼로그 */}
    <Dialog open={showAddItemDialog} onOpenChange={(v) => !v && setShowAddItemDialog(false)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>품목 추가</DialogTitle>
          <DialogDescription className="sr-only">운송 품목 추가</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-xs text-gray-500">제품</label>
            <select
              value={addProductId}
              onChange={(e) => setAddProductId(e.target.value)}
              className="w-full h-9 rounded-md border px-2 text-sm"
            >
              <option value="">제품 선택</option>
              {products
                .filter((p) => !items.some((i) => i.product_id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-gray-500">수량</label>
            <Input
              type="number"
              min={1}
              value={addQty}
              onChange={(e) => setAddQty(parseInt(e.target.value) || 1)}
              className="h-9 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowAddItemDialog(false)}>취소</Button>
          <Button onClick={handleAddItem} disabled={!addProductId} className="bg-[#1e2a3a] hover:bg-[#2a3a4a]">
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
