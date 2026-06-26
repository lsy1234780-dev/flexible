'use client';

import { useEffect, useState, useTransition } from 'react';
import { Trash2, Plus, DollarSign } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Check, X } from 'lucide-react';
import {
  getPurchaseOrderDetail,
  updatePurchaseOrder,
  deletePurchaseOrder,
  addPurchaseOrderItem,
  updatePurchaseOrderItem,
  removePurchaseOrderItem,
  addPayment,
  removePayment,
  type PurchaseOrder,
} from '@/actions/purchaseOrders';
import { toast } from 'sonner';
import dayjs from 'dayjs';

interface Product {
  id: string;
  name: string;
  barcode: string;
}

interface Props {
  orderId: string | null;
  products: Product[];
  onClose: () => void;
  onRefresh: () => void;
}

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: '미결제', color: 'bg-red-100 text-red-700' },
  partial: { label: '부분결제', color: 'bg-amber-100 text-amber-700' },
  paid: { label: '결제완료', color: 'bg-green-100 text-green-700' },
};

export default function PurchaseOrderSheet({ orderId, products, onClose, onRefresh }: Props) {
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 인라인 편집 상태
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // 품목 추가
  const [addProductId, setAddProductId] = useState('');
  const [addQty, setAddQty] = useState(1);

  // 결제 추가
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payLabel, setPayLabel] = useState('');
  const [payMemo, setPayMemo] = useState('');

  useEffect(() => {
    if (!orderId) { setDetail(null); return; }
    setLoading(true);
    getPurchaseOrderDetail(orderId)
      .then(setDetail)
      .catch(() => toast.error('상세 조회 실패'))
      .finally(() => setLoading(false));
  }, [orderId]);

  function refresh() {
    if (!orderId) return;
    getPurchaseOrderDetail(orderId).then(setDetail);
    onRefresh();
  }

  function handleDelete() {
    if (!orderId || !confirm('이 발주 건을 삭제하시겠습니까?')) return;
    startTransition(async () => {
      const res = await deletePurchaseOrder(orderId);
      if (res.error) { toast.error(res.error); return; }
      toast.success('삭제 완료');
      onClose();
      onRefresh();
    });
  }

  // 필드 인라인 편집
  function startEdit(key: string) {
    if (!detail) return;
    const val = detail[key as keyof PurchaseOrder];
    setEditValue(val != null ? String(val) : '');
    setEditingField(key);
  }

  function cancelEdit() {
    setEditingField(null);
    setEditValue('');
  }

  function saveEdit(key: string, type?: 'number') {
    if (!orderId) return;
    startTransition(async () => {
      const update: Record<string, unknown> = {};
      update[key] = type === 'number' ? (editValue ? parseFloat(editValue) : null) : (editValue || null);
      const res = await updatePurchaseOrder(orderId, update);
      if (res.error) toast.error(res.error);
      else { cancelEdit(); refresh(); }
    });
  }

  // 품목 추가
  function handleAddItem() {
    if (!orderId || !addProductId) return;
    startTransition(async () => {
      const res = await addPurchaseOrderItem(orderId, addProductId, addQty);
      if (res.error) { toast.error(res.error); return; }
      setAddProductId('');
      setAddQty(1);
      refresh();
    });
  }

  function handleRemoveItem(itemId: string) {
    if (!orderId) return;
    startTransition(async () => {
      const res = await removePurchaseOrderItem(itemId);
      if (res.error) { toast.error(res.error); return; }
      refresh();
    });
  }

  // 결제 추가
  function handleAddPayment() {
    if (!orderId || !payAmount) return;
    startTransition(async () => {
      const res = await addPayment(orderId, {
        amount: parseFloat(payAmount),
        paid_at: new Date().toISOString(),
        method: payMethod || undefined,
        label: payLabel || undefined,
        memo: payMemo || undefined,
      });
      if (res.error) { toast.error(res.error); return; }
      toast.success('결제 기록 추가');
      setShowPaymentForm(false);
      setPayAmount('');
      setPayMethod('');
      setPayLabel('');
      setPayMemo('');
      refresh();
    });
  }

  function handleRemovePayment(paymentId: string) {
    if (!orderId || !confirm('결제 기록을 삭제하시겠습니까?')) return;
    startTransition(async () => {
      const res = await removePayment(paymentId, orderId);
      if (res.error) { toast.error(res.error); return; }
      refresh();
    });
  }

  const paymentStatus = detail?.payment_status ?? 'unpaid';
  const paymentConfig = PAYMENT_STATUS_MAP[paymentStatus] ?? PAYMENT_STATUS_MAP.unpaid;
  const currency = detail?.currency ?? 'KRW';
  const symbol = currency === 'KRW' ? '₩' : currency === 'USD' ? '$' : currency;

  const infoFields = [
    { key: 'po_number', label: 'PO 번호' },
    { key: 'supplier', label: '공급처' },
    { key: 'supplier_contact', label: '연락처' },
    { key: 'total_amount', label: '총 금액', type: 'number' as const },
    { key: 'currency', label: '통화' },
    { key: 'exchange_rate', label: '환율', type: 'number' as const },
    { key: 'vat_amount', label: 'VAT', type: 'number' as const },
    { key: 'memo', label: '메모' },
  ];

  return (
    <Sheet open={!!orderId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-lg w-full overflow-hidden flex flex-col">
        {loading || !detail ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-sm text-gray-400">{loading ? '불러오는 중...' : ''}</span>
          </div>
        ) : (
          <>
            <SheetHeader className="shrink-0">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-lg">{detail.title}</SheetTitle>
                <Badge className={paymentConfig.color}>{paymentConfig.label}</Badge>
              </div>
              <SheetDescription className="text-xs text-gray-500">
                {detail.supplier ?? '공급처 미지정'}
                {detail.po_number && ` · ${detail.po_number}`}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto space-y-6 px-4 pb-4">
              {/* 발주 정보 */}
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">발주 정보</h4>
                {infoFields.map((field) => {
                  const val = detail[field.key as keyof PurchaseOrder];
                  const isEditing = editingField === field.key;
                  const display = val != null && val !== ''
                    ? (field.type === 'number' ? `${symbol}${Number(val).toLocaleString()}` : String(val))
                    : null;

                  return (
                    <div key={field.key} className="flex items-center gap-2 text-sm group min-h-[28px]">
                      <span className="text-gray-500 w-20 shrink-0 text-xs">{field.label}</span>
                      {isEditing ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Input
                            type={field.type === 'number' ? 'number' : 'text'}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(field.key, field.type); if (e.key === 'Escape') cancelEdit(); }}
                            className="h-7 text-xs flex-1"
                            autoFocus
                          />
                          <button onClick={() => saveEdit(field.key, field.type)} disabled={isPending} className="text-green-600 hover:text-green-800"><Check size={14} /></button>
                          <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <span className={`text-xs truncate ${display ? 'text-gray-900' : 'text-gray-300 italic'}`}>
                            {display ?? '미입력'}
                          </span>
                          <button onClick={() => startEdit(field.key)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-600 transition-opacity shrink-0">
                            <Pencil size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 품목 */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">품목</h4>
                {detail.purchase_order_items.length > 0 ? (
                  <div className="space-y-1">
                    {detail.purchase_order_items.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-sm group">
                        <span className="flex-1 truncate text-xs">{item.products?.name ?? '?'}</span>
                        <span className="text-xs text-gray-500">{item.quantity}개</span>
                        {item.unit_cost != null && (
                          <span className="text-xs text-gray-400">@{symbol}{item.unit_cost.toLocaleString()}</span>
                        )}
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-300 italic">품목 없음</p>
                )}
                <div className="flex gap-2">
                  <select
                    value={addProductId}
                    onChange={(e) => setAddProductId(e.target.value)}
                    className="flex-1 h-7 rounded border px-2 text-xs"
                  >
                    <option value="">제품 선택</option>
                    {products
                      .filter((p) => !detail.purchase_order_items.some((i) => i.product_id === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </select>
                  <Input
                    type="number"
                    min={1}
                    value={addQty}
                    onChange={(e) => setAddQty(parseInt(e.target.value) || 1)}
                    className="h-7 w-16 text-xs"
                  />
                  <Button size="sm" variant="outline" onClick={handleAddItem} disabled={!addProductId || isPending} className="h-7 text-xs px-2">
                    <Plus size={12} />
                  </Button>
                </div>
              </div>

              {/* 결제 이력 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">결제 이력</h4>
                  <button
                    onClick={() => setShowPaymentForm(!showPaymentForm)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {showPaymentForm ? '취소' : '+ 추가'}
                  </button>
                </div>

                {showPaymentForm && (
                  <div className="space-y-2 p-2 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        placeholder="금액"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        className="h-7 text-xs"
                      />
                      <Input
                        placeholder="결제 방식 (T/T, L/C 등)"
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="라벨 (계약금, 잔금 등)"
                        value={payLabel}
                        onChange={(e) => setPayLabel(e.target.value)}
                        className="h-7 text-xs"
                      />
                      <Input
                        placeholder="메모"
                        value={payMemo}
                        onChange={(e) => setPayMemo(e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <Button size="sm" onClick={handleAddPayment} disabled={!payAmount || isPending} className="w-full h-7 text-xs">
                      결제 기록 추가
                    </Button>
                  </div>
                )}

                {detail.purchase_order_payments.length > 0 ? (
                  <div className="space-y-1">
                    {detail.purchase_order_payments.map((payment) => (
                      <div key={payment.id} className="flex items-center gap-2 text-xs group p-1.5 rounded hover:bg-gray-50">
                        <DollarSign size={12} className="text-green-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{symbol}{payment.amount.toLocaleString()}</span>
                            {payment.label && <span className="text-gray-400">({payment.label})</span>}
                          </div>
                          <div className="text-gray-400">
                            {dayjs(payment.paid_at).format('YY.MM.DD')}
                            {payment.method && ` · ${payment.method}`}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemovePayment(payment.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {detail.total_amount && (
                      <div className="text-xs text-gray-500 pt-1 border-t flex justify-between">
                        <span>합계</span>
                        <span className="font-medium">
                          {symbol}{detail.purchase_order_payments.reduce((s, p) => s + p.amount, 0).toLocaleString()}
                          {' / '}
                          {symbol}{detail.total_amount.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-300 italic">결제 기록 없음</p>
                )}
              </div>

              {/* 연결된 운송 */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">연결된 운송</h4>
                {detail.inbound_shipments.length > 0 ? (
                  <div className="space-y-1">
                    {detail.inbound_shipments.map((s) => (
                      <div key={s.id} className="text-xs flex items-center gap-2 p-1.5 rounded bg-gray-50">
                        <span className="flex-1 truncate">{s.title}</span>
                        <Badge className="text-[10px]">{s.stage}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-300 italic">연결된 운송 없음</p>
                )}
              </div>
            </div>

            <SheetFooter className="shrink-0 border-t pt-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isPending}
              >
                <Trash2 size={14} className="mr-1" />
                삭제
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
