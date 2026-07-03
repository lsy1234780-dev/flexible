'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, Plus, Pencil, Check, X, DollarSign, Package, Truck, ExternalLink, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  type PurchaseOrder,
  type PurchaseOrderItem,
  updatePurchaseOrder,
  deletePurchaseOrder,
  addPurchaseOrderItem,
  updatePurchaseOrderItem,
  removePurchaseOrderItem,
  addPayment,
  removePayment,
  finalizePurchaseOrder,
} from '@/actions/purchaseOrders';
import {
  type InboundShipmentDetail,
  changeShipmentStage,
  deleteInboundShipment,
  linkReceivingOrder,
} from '@/actions/inboundShipments';
import { getStageConfig, getShippingTypeLabel, getCustomsStatusLabel, INBOUND_STAGES } from '@/lib/inboundStages';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import CreateShipmentDialog from '../components/CreateShipmentDialog';
import ApprovalPanel from '@/components/ApprovalPanel';
import ShareToChat from '@/components/ShareToChat';
import RecordThread from '@/components/RecordThread';

interface Product {
  id: string;
  name: string;
  barcode: string;
}

interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  country: string | null;
}

interface Props {
  purchaseOrder: PurchaseOrder;
  shipmentDetails: InboundShipmentDetail[];
  products: Product[];
  suppliers: Supplier[];
}

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: '미결제', color: 'bg-red-100 text-red-700' },
  partial: { label: '부분결제', color: 'bg-amber-100 text-amber-700' },
  paid: { label: '결제완료', color: 'bg-green-100 text-green-700' },
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  KRW: '₩', USD: '$', CNY: '¥', EUR: '€', JPY: '¥',
};

export default function PurchaseOrderDetailClient({ purchaseOrder: po, shipmentDetails, products, suppliers }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCreateShipment, setShowCreateShipment] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const currency = po.currency ?? 'KRW';
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency + ' ';
  const paymentConfig = PAYMENT_STATUS_MAP[po.payment_status ?? 'unpaid'] ?? PAYMENT_STATUS_MAP.unpaid;

  // 품목 합계
  const itemsTotal = useMemo(() => {
    return po.purchase_order_items.reduce((sum, item) => {
      return sum + (item.unit_cost ?? 0) * item.quantity;
    }, 0);
  }, [po.purchase_order_items]);

  const selectedItems = useMemo(() => {
    return po.purchase_order_items.filter((i) => selectedItemIds.has(i.id));
  }, [po.purchase_order_items, selectedItemIds]);

  function toggleItem(id: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedItemIds.size === po.purchase_order_items.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(po.purchase_order_items.map((i) => i.id)));
    }
  }

  function handleDelete() {
    if (!confirm('이 발주 건을 삭제하시겠습니까?')) return;
    startTransition(async () => {
      const res = await deletePurchaseOrder(po.id);
      if (res.error) { toast.error(res.error); return; }
      toast.success('삭제 완료');
      router.push('/receiving');
    });
  }

  function handleFinalize() {
    if (!confirm('이 발주를 확정하시겠습니까?')) return;
    startTransition(async () => {
      const res = await finalizePurchaseOrder(po.id);
      if (res?.error) { toast.error(res.error); return; }
      toast.success('발주가 확정되었습니다');
      router.refresh();
    });
  }

  function handleCreateShipmentFromItems() {
    if (selectedItems.length === 0) {
      toast.error('운송할 품목을 선택하세요');
      return;
    }
    setShowCreateShipment(true);
  }

  // 총 금액 자동 동기화
  function syncTotalAmount() {
    if (itemsTotal === 0) return;
    startTransition(async () => {
      const res = await updatePurchaseOrder(po.id, { total_amount: itemsTotal });
      if (res.error) toast.error(res.error);
      else { toast.success('총 금액 동기화 완료'); router.refresh(); }
    });
  }

  // 선택된 품목을 CreateShipmentDialog에 넘길 형태로 변환
  const preSelectedItems = selectedItems.map((item) => ({
    product_id: item.product_id,
    quantity: item.quantity,
    unit_cost: item.unit_cost ?? undefined,
  }));

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => router.push('/receiving')}>
          <ArrowLeft size={16} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{po.title}</h1>
            <Badge variant={po.status === 'approved' ? 'default' : 'secondary'} className="shrink-0">
              {po.status === 'approved' ? '확정' : '초안'}
            </Badge>
            <Badge className={`${paymentConfig.color} shrink-0`}>{paymentConfig.label}</Badge>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 truncate">
            {po.po_number && <span className="font-mono mr-2">{po.po_number}</span>}
            {po.companies?.name ?? po.supplier ?? '공급처 미지정'}
            <span className="mx-1 sm:mx-2">·</span>
            {dayjs(po.created_at).format('YYYY.MM.DD')}
          </p>
        </div>
        <ShareToChat entityType="purchase_order" entityId={po.id} label={po.title} />
        {po.status === 'draft' && (
          <Button size="sm" className="shrink-0" onClick={handleFinalize} disabled={isPending}>
            <CheckCircle size={14} className="mr-1" /> 발주 확정
          </Button>
        )}
        <Button variant="destructive" size="icon" className="h-8 w-8 sm:hidden shrink-0" onClick={handleDelete} disabled={isPending}>
          <Trash2 size={14} />
        </Button>
        <Button variant="destructive" size="sm" className="hidden sm:inline-flex shrink-0" onClick={handleDelete} disabled={isPending}>
          <Trash2 size={14} className="mr-1" />
          삭제
        </Button>
      </div>

      {/* 승인 워크플로우 — 초안 상태일 때만 의미 있음 */}
      {po.status === 'draft' && (
        <ApprovalPanel
          entityType="purchase_order"
          entityId={po.id}
          entityLabel={po.title}
          onChange={() => router.refresh()}
        />
      )}

      {/* 발주 정보 (compact) + 통화 설정 */}
      <PurchaseInfoCompact po={po} symbol={symbol} currency={currency} suppliers={suppliers} />

      {/* 품목 + 결제 */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] xl:grid-cols-[4fr_1fr] gap-4">
        <ItemsSection
          po={po}
          products={products}
          symbol={symbol}
          currency={currency}
          itemsTotal={itemsTotal}
          selectedItemIds={selectedItemIds}
          onToggleItem={toggleItem}
          onToggleAll={toggleAll}
          onCreateShipment={handleCreateShipmentFromItems}
          onSyncTotal={syncTotalAmount}
          selectedCount={selectedItems.length}
        />
        <PaymentSection po={po} symbol={symbol} itemsTotal={itemsTotal} />
      </div>

      {/* 운송 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Truck size={16} />
              운송
              {shipmentDetails.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-normal">
                  {shipmentDetails.length}건
                </span>
              )}
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => { setSelectedItemIds(new Set()); setShowCreateShipment(true); }}
            >
              <Plus size={12} className="mr-1" />
              운송 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {shipmentDetails.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              등록된 운송 건이 없습니다
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 snap-x">
              {shipmentDetails.map((shipment) => (
                <div key={shipment.id} className="w-[260px] sm:w-[calc(50%-6px)] xl:w-[calc(25%-9px)] shrink-0 snap-start">
                  <ShipmentCard shipment={shipment} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 레코드 스레드 — 이 발주에 붙는 대화 + 역링크 (승인 요청도 여기 남는다) */}
      <Card>
        <CardContent className="py-4">
          <RecordThread entityType="purchase_order" entityId={po.id} entityLabel={po.title} />
        </CardContent>
      </Card>

      {/* 운송 생성 다이얼로그 */}
      <CreateShipmentDialog
        open={showCreateShipment}
        products={products}
        purchaseOrders={[po]}
        preSelectedItems={preSelectedItems.length > 0 ? preSelectedItems : undefined}
        onClose={() => { setShowCreateShipment(false); setSelectedItemIds(new Set()); }}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}

// ─── 발주 정보 (compact) ───

function PurchaseInfoCompact({ po, symbol, currency, suppliers }: { po: PurchaseOrder; symbol: string; currency: string; suppliers: Supplier[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    po_number: po.po_number ?? '',
    supplier_id: po.supplier_id ?? '',
    currency: po.currency ?? 'KRW',
    exchange_rate: po.exchange_rate != null ? String(po.exchange_rate) : '',
    memo: po.memo ?? '',
  });

  function startEdit() {
    setForm({
      po_number: po.po_number ?? '',
      supplier_id: po.supplier_id ?? '',
      currency: po.currency ?? 'KRW',
      exchange_rate: po.exchange_rate != null ? String(po.exchange_rate) : '',
      memo: po.memo ?? '',
    });
    setEditing(true);
  }

  function handleSave() {
    startTransition(async () => {
      const selected = suppliers.find((s) => s.id === form.supplier_id);
      const update: Record<string, unknown> = {
        po_number: form.po_number || null,
        supplier_id: form.supplier_id || null,
        supplier: selected?.name ?? null,
        currency: form.currency || 'KRW',
        exchange_rate: form.exchange_rate ? parseFloat(form.exchange_rate) : null,
        memo: form.memo || null,
      };
      const res = await updatePurchaseOrder(po.id, update);
      if (res.error) toast.error(res.error);
      else { setEditing(false); router.refresh(); }
    });
  }

  const supplierName = po.companies?.name ?? po.supplier;

  if (editing) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-gray-500">발주 정보 수정</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">PO번호</label>
              <Input value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} placeholder="PO-2026-001" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">공급처</label>
              <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} className="w-full h-8 rounded-md border px-2 text-sm">
                <option value="">선택 안함</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">통화</label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full h-8 rounded-md border px-2 text-sm">
                  <option value="KRW">KRW (원)</option>
                  <option value="USD">USD ($)</option>
                  <option value="CNY">CNY (¥)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="JPY">JPY (¥)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">환율</label>
                <Input type="number" value={form.exchange_rate} onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })} placeholder="0" className="h-8 text-sm" />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">메모</label>
            <textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} rows={2} className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="h-7 text-xs">취소</Button>
            <Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 text-xs bg-[#1e2a3a] hover:bg-[#2a3a4a]">저장</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-gray-500">발주 정보</CardTitle>
          <button onClick={startEdit} className="text-gray-300 hover:text-gray-600 transition-colors shrink-0">
            <Pencil size={12} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
          <InfoField label="PO번호" value={po.po_number} />
          <InfoField label="공급처" value={supplierName} />
          <InfoField label="통화" value={po.currency} />
          <InfoField label="환율" value={po.exchange_rate != null ? `₩${po.exchange_rate.toLocaleString()} = 1 ${po.currency ?? 'KRW'}` : null} />
          {po.memo && <div className="sm:col-span-2"><InfoField label="메모" value={po.memo} /></div>}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-gray-400 text-xs w-12 shrink-0">{label}</span>
      <span className={`text-sm ${value ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>
        {value ?? '-'}
      </span>
    </div>
  );
}

// ─── 품목 섹션 ───

function ItemsSection({
  po, products, symbol, currency, itemsTotal,
  selectedItemIds, onToggleItem, onToggleAll,
  onCreateShipment, onSyncTotal, selectedCount,
}: {
  po: PurchaseOrder;
  products: Product[];
  symbol: string;
  currency: string;
  itemsTotal: number;
  selectedItemIds: Set<string>;
  onToggleItem: (id: string) => void;
  onToggleAll: () => void;
  onCreateShipment: () => void;
  onSyncTotal: () => void;
  selectedCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addProductId, setAddProductId] = useState('');
  const [addQty, setAddQty] = useState(1);
  const [addUnitCost, setAddUnitCost] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(0);
  const [editUnitCost, setEditUnitCost] = useState('');

  function handleAddItem() {
    if (!addProductId) return;
    startTransition(async () => {
      const res = await addPurchaseOrderItem(
        po.id,
        addProductId,
        addQty,
        addUnitCost ? parseFloat(addUnitCost) : undefined,
      );
      if (res.error) { toast.error(res.error); return; }
      setAddProductId('');
      setAddQty(1);
      setAddUnitCost('');
      setShowAddDialog(false);
      router.refresh();
    });
  }

  function startEditItem(item: PurchaseOrderItem) {
    setEditingItemId(item.id);
    setEditQty(item.quantity);
    setEditUnitCost(item.unit_cost != null ? String(item.unit_cost) : '');
  }

  function saveEditItem(itemId: string) {
    startTransition(async () => {
      const res = await updatePurchaseOrderItem(itemId, {
        quantity: editQty,
        unit_cost: editUnitCost ? parseFloat(editUnitCost) : undefined,
      });
      if (res.error) { toast.error(res.error); return; }
      setEditingItemId(null);
      router.refresh();
    });
  }

  function handleRemoveItem(itemId: string) {
    startTransition(async () => {
      const res = await removePurchaseOrderItem(itemId);
      if (res.error) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  const allSelected = po.purchase_order_items.length > 0 && selectedItemIds.size === po.purchase_order_items.length;

  return (
    <>
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Package size={16} />
            품목
            <span className="text-xs text-gray-400 font-normal">
              {po.purchase_order_items.length}종
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <Button size="sm" className="h-7 text-xs bg-[#1e2a3a] hover:bg-[#2a3a4a]" onClick={onCreateShipment}>
                <Truck size={12} className="mr-1" />
                선택 품목 → 운송 추가 ({selectedCount})
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
        {/* 테이블 헤더 */}
        <div className="grid grid-cols-[40px_1fr_100px_120px_100px_40px] items-center px-4 py-2 border-b bg-gray-50 text-xs text-gray-500 font-medium min-w-[540px]">
          <div>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleAll}
              className="h-3.5 w-3.5"
            />
          </div>
          <div>제품명</div>
          <div className="text-right">수량</div>
          <div className="text-right">단가 ({currency})</div>
          <div className="text-right">소계</div>
          <div />
        </div>

        {/* 품목 행 */}
        {po.purchase_order_items.map((item) => {
          const isEditing = editingItemId === item.id;
          const subtotal = (item.unit_cost ?? 0) * item.quantity;

          return (
            <div
              key={item.id}
              className={`grid grid-cols-[40px_1fr_100px_120px_100px_40px] items-center px-4 py-2.5 border-b last:border-0 group transition-colors min-w-[540px] ${
                selectedItemIds.has(item.id) ? 'bg-blue-50/50' : 'hover:bg-gray-50/50'
              }`}
            >
              <div>
                <input
                  type="checkbox"
                  checked={selectedItemIds.has(item.id)}
                  onChange={() => onToggleItem(item.id)}
                  className="h-3.5 w-3.5"
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{item.products?.name ?? '?'}</p>
                <p className="text-[10px] text-gray-400 font-mono">{item.products?.barcode}</p>
              </div>
              {(() => {
                const rate = po.exchange_rate;
                const showKrw = currency !== 'KRW' && rate != null && rate > 0;
                const krwUnit = showKrw && item.unit_cost != null ? Math.round(item.unit_cost * rate) : null;
                const krwSubtotal = showKrw && subtotal > 0 ? Math.round(subtotal * rate) : null;

                if (isEditing) return (
                  <>
                    <div className="text-right">
                      <Input
                        type="number" min={1}
                        value={editQty}
                        onChange={(e) => setEditQty(parseInt(e.target.value) || 1)}
                        className="h-7 w-20 text-xs text-right ml-auto"
                      />
                    </div>
                    <div className="text-right">
                      <Input
                        type="number" min={0}
                        value={editUnitCost}
                        onChange={(e) => setEditUnitCost(e.target.value)}
                        placeholder="0"
                        className="h-7 w-24 text-xs text-right ml-auto"
                      />
                    </div>
                    <div className="text-right flex items-center justify-end gap-1">
                      <button onClick={() => saveEditItem(item.id)} disabled={isPending} className="text-green-600 hover:text-green-800"><Check size={14} /></button>
                      <button onClick={() => setEditingItemId(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                    </div>
                  </>
                );

                return (
                  <>
                    <div className="text-right text-sm tabular-nums">{item.quantity.toLocaleString()}</div>
                    <div className="text-right">
                      <div className="text-sm tabular-nums text-gray-600">
                        {item.unit_cost != null ? `${symbol}${item.unit_cost.toLocaleString()}` : <span className="text-gray-300">-</span>}
                      </div>
                      {krwUnit != null && (
                        <div className="text-[10px] tabular-nums text-gray-400">₩{krwUnit.toLocaleString()}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm tabular-nums font-medium">
                        {subtotal > 0 ? `${symbol}${subtotal.toLocaleString()}` : <span className="text-gray-300">-</span>}
                      </div>
                      {krwSubtotal != null && (
                        <div className="text-[10px] tabular-nums text-gray-400">₩{krwSubtotal.toLocaleString()}</div>
                      )}
                    </div>
                  </>
                );
              })()}
              <div className="flex items-center justify-end gap-0.5">
                {!isEditing && (
                  <>
                    <button onClick={() => startEditItem(item)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-600 transition-opacity p-0.5">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => handleRemoveItem(item.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity p-0.5">
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* 합계 */}
        {po.purchase_order_items.length > 0 && (
          <div className="grid grid-cols-[40px_1fr_100px_120px_100px_40px] items-center px-4 py-3 border-t bg-gray-50 min-w-[540px]">
            <div />
            <div className="text-sm font-semibold text-gray-700">합계</div>
            <div className="text-right text-sm tabular-nums text-gray-500">
              {po.purchase_order_items.reduce((s, i) => s + i.quantity, 0).toLocaleString()}
            </div>
            <div />
            <div className="text-right">
              <div className="text-sm tabular-nums font-bold">{symbol}{itemsTotal.toLocaleString()}</div>
              {currency !== 'KRW' && po.exchange_rate != null && po.exchange_rate > 0 && (
                <div className="text-[10px] tabular-nums text-gray-400">₩{Math.round(itemsTotal * po.exchange_rate).toLocaleString()}</div>
              )}
            </div>
            <div>
              {po.total_amount !== itemsTotal && itemsTotal > 0 && (
                <button onClick={onSyncTotal} className="text-blue-500 hover:text-blue-700 transition-colors p-0.5" title="총 금액 동기화">
                  <Check size={12} />
                </button>
              )}
            </div>
          </div>
        )}
        </div>
        {/* 품목 추가 버튼 */}
        <div className="px-4 py-3 border-t">
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 text-xs"
            onClick={() => { setAddProductId(''); setAddQty(1); setAddUnitCost(''); setShowAddDialog(true); }}
          >
            <Plus size={12} className="mr-1" />
            품목 추가
          </Button>
        </div>
      </CardContent>
    </Card>

    {/* 품목 추가 다이얼로그 */}
    <Dialog open={showAddDialog} onOpenChange={(v) => !v && setShowAddDialog(false)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>품목 추가</DialogTitle>
          <DialogDescription className="sr-only">품목 정보 입력</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-xs text-gray-500">제품</label>
            <select value={addProductId} onChange={(e) => setAddProductId(e.target.value)} className="w-full h-9 rounded-md border px-2 text-sm">
              <option value="">제품 선택</option>
              {products.filter((p) => !po.purchase_order_items.some((i) => i.product_id === p.id)).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">수량</label>
              <Input type="number" min={1} value={addQty} onChange={(e) => setAddQty(parseInt(e.target.value) || 1)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">단가 ({currency})</label>
              <Input type="number" min={0} value={addUnitCost} onChange={(e) => setAddUnitCost(e.target.value)} placeholder="0" className="h-9 text-sm" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowAddDialog(false)}>취소</Button>
          <Button onClick={handleAddItem} disabled={!addProductId || isPending} className="bg-[#1e2a3a] hover:bg-[#2a3a4a]">
            {isPending ? '추가 중...' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── 결제 섹션 ───

function PaymentSection({ po, symbol, itemsTotal }: { po: PurchaseOrder; symbol: string; itemsTotal: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [showDialog, setShowDialog] = useState(false);
  const [payMode, setPayMode] = useState<'full' | 'partial' | 'items'>('full');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payLabel, setPayLabel] = useState('');
  const [selectedPayItemIds, setSelectedPayItemIds] = useState<Set<string>>(new Set());

  const totalPaid = po.purchase_order_payments.reduce((s, p) => s + p.amount, 0);
  const totalTarget = po.total_amount ?? itemsTotal;
  const remaining = totalTarget - totalPaid;

  // 품목 선택 시 자동 금액 계산
  const selectedItemsAmount = useMemo(() => {
    return po.purchase_order_items
      .filter((i) => selectedPayItemIds.has(i.id))
      .reduce((s, i) => s + (i.unit_cost ?? 0) * i.quantity, 0);
  }, [po.purchase_order_items, selectedPayItemIds]);

  function openDialog(mode: 'full' | 'partial' | 'items') {
    setPayMode(mode);
    setPayAmount(mode === 'full' && remaining > 0 ? String(remaining) : '');
    setPayLabel('');
    setPayMethod('');
    setSelectedPayItemIds(new Set());
    setShowDialog(true);
  }

  function togglePayItem(id: string) {
    setSelectedPayItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAddPayment() {
    const amount = payMode === 'items' ? selectedItemsAmount : parseFloat(payAmount);
    if (!amount || amount <= 0) { toast.error('금액을 입력하세요'); return; }
    startTransition(async () => {
      const itemNames = payMode === 'items'
        ? po.purchase_order_items
            .filter((i) => selectedPayItemIds.has(i.id))
            .map((i) => i.products?.name ?? '?')
            .join(', ')
        : undefined;
      const res = await addPayment(po.id, {
        amount,
        paid_at: new Date().toISOString(),
        method: payMethod || undefined,
        label: payLabel || (itemNames ? `품목: ${itemNames}` : undefined),
      });
      if (res.error) { toast.error(res.error); return; }
      toast.success('결제 기록 추가');
      setShowDialog(false);
      router.refresh();
    });
  }

  function handleRemovePayment(paymentId: string) {
    if (!confirm('결제 기록을 삭제하시겠습니까?')) return;
    startTransition(async () => {
      const res = await removePayment(paymentId, po.id);
      if (res.error) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  const paidPercent = totalTarget > 0 ? Math.min(100, (totalPaid / totalTarget) * 100) : 0;

  return (
    <>
      <Card className="h-fit">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <DollarSign size={16} />
            결제
            {totalTarget > 0 && (
              <span className="text-xs text-gray-400 font-normal">
                {Math.round(paidPercent)}%
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          {/* 진행률 바 */}
          {totalTarget > 0 && (
            <div className="space-y-1.5">
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-[#1e2a3a] h-2 rounded-full transition-all"
                  style={{ width: `${paidPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs tabular-nums text-gray-400">
                <span>{symbol}{totalPaid.toLocaleString()}</span>
                <span>{symbol}{totalTarget.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* 결제 로그 */}
          {po.purchase_order_payments.length === 0 && totalTarget === 0 && (
            <p className="text-xs text-center text-gray-300 py-2">기록 없음</p>
          )}
          {po.purchase_order_payments.length > 0 && (
            <div className="space-y-1.5">
              {po.purchase_order_payments.map((payment) => (
                <div key={payment.id} className="flex items-start gap-2 text-sm group">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 mt-1.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium tabular-nums">{symbol}{payment.amount.toLocaleString()}</span>
                      {payment.label && <span className="text-xs text-gray-400 truncate">{payment.label}</span>}
                    </div>
                    <span className="text-xs text-gray-400">
                      {dayjs(payment.paid_at).format('YY.MM.DD')}
                      {payment.method && ` · ${payment.method}`}
                    </span>
                  </div>
                  <button onClick={() => handleRemovePayment(payment.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity shrink-0 mt-0.5">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 액션 */}
          {remaining > 0 ? (
            <div className="space-y-1.5">
              <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => openDialog('full')}>
                일괄 ({symbol}{remaining.toLocaleString()})
              </Button>
              <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => openDialog('partial')}>
                부분 결제
              </Button>
            </div>
          ) : totalTarget > 0 ? (
            <p className="text-sm text-green-600 font-medium text-center">결제 완료</p>
          ) : (
            <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => openDialog('partial')}>
              <Plus size={12} className="mr-1" />
              결제 추가
            </Button>
          )}
        </CardContent>
      </Card>

      {/* 결제 다이얼로그 */}
      <Dialog open={showDialog} onOpenChange={(v) => !v && setShowDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {payMode === 'full' ? '일괄 결제' : payMode === 'items' ? '품목 선택 결제' : '부분 결제'}
            </DialogTitle>
            <DialogDescription className="sr-only">결제 정보 입력</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 모드 선택 탭 */}
            {payMode !== 'full' && (
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                <button
                  onClick={() => setPayMode('partial')}
                  className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${payMode === 'partial' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  금액 입력
                </button>
                <button
                  onClick={() => setPayMode('items')}
                  className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${payMode === 'items' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  품목 선택
                </button>
              </div>
            )}

            {/* 품목 선택 모드 */}
            {payMode === 'items' && po.purchase_order_items.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {po.purchase_order_items.map((item) => {
                  const subtotal = (item.unit_cost ?? 0) * item.quantity;
                  return (
                    <label key={item.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={selectedPayItemIds.has(item.id)}
                        onChange={() => togglePayItem(item.id)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="flex-1 truncate">{item.products?.name ?? '?'}</span>
                      <span className="text-xs text-gray-400">{item.quantity}개</span>
                      <span className="text-xs tabular-nums font-medium">
                        {subtotal > 0 ? `${symbol}${subtotal.toLocaleString()}` : '-'}
                      </span>
                    </label>
                  );
                })}
                {selectedPayItemIds.size > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t text-sm font-semibold">
                    <span>합계</span>
                    <span className="tabular-nums">{symbol}{selectedItemsAmount.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}

            {/* 금액 입력 (full / partial 모드) */}
            {payMode !== 'items' && (
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">결제 금액</label>
                <Input
                  type="number"
                  placeholder="금액"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">결제 방식</label>
                <Input placeholder="T/T, L/C 등" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">라벨</label>
                <Input placeholder="계약금, 잔금 등" value={payLabel} onChange={(e) => setPayLabel(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>취소</Button>
            <Button
              onClick={handleAddPayment}
              disabled={isPending || (payMode === 'items' ? selectedItemsAmount <= 0 : !payAmount || parseFloat(payAmount) <= 0)}
              className="bg-[#1e2a3a] hover:bg-[#2a3a4a]"
            >
              {isPending ? '처리 중...' : payMode === 'items' ? `${symbol}${selectedItemsAmount.toLocaleString()} 결제` : '결제 기록 추가'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── 운송 행 ───

function ShipmentCard({ shipment }: { shipment: InboundShipmentDetail }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [newStage, setNewStage] = useState('');

  const stageConfig = getStageConfig(shipment.stage);
  const items = shipment.inbound_shipment_items ?? [];

  function handleStageChange() {
    if (!newStage) return;
    startTransition(async () => {
      const res = await changeShipmentStage(shipment.id, newStage);
      if (res.error) { toast.error(res.error); return; }
      toast.success('스테이지 변경');
      setNewStage('');
      router.refresh();
    });
  }

  function handleLinkReceiving() {
    startTransition(async () => {
      const res = await linkReceivingOrder(shipment.id);
      if (res.error) { toast.error(res.error); return; }
      toast.success('입고지시서 생성 완료');
      router.refresh();
    });
  }

  function handleDeleteShipment() {
    if (!confirm('이 운송 건을 삭제하시겠습니까?')) return;
    startTransition(async () => {
      const res = await deleteInboundShipment(shipment.id);
      if (res.error) { toast.error(res.error); return; }
      toast.success('삭제 완료');
      router.refresh();
    });
  }

  return (
    <Card className="group relative h-full">
      <CardContent className="p-3 space-y-2">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-xs truncate">{shipment.title}</span>
              <Badge className={`${stageConfig.color} text-[10px] px-1.5 py-0`}>{stageConfig.label}</Badge>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
              {shipment.shipping_type && <span>{getShippingTypeLabel(shipment.shipping_type)}</span>}
              {shipment.bl_number && <span className="font-mono">B/L {shipment.bl_number}</span>}
              {shipment.estimated_arrival && <span>ETA {dayjs(shipment.estimated_arrival).format('MM/DD')}</span>}
            </div>
          </div>
          <button onClick={handleDeleteShipment} disabled={isPending} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity shrink-0">
            <Trash2 size={12} />
          </button>
        </div>

        {/* 품목 */}
        {items.length > 0 && (
          <div className="bg-gray-50 rounded p-2 space-y-0.5">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-1.5 text-[11px]">
                <span className="flex-1 truncate text-gray-600">{item.products?.name ?? '?'}</span>
                <span className="tabular-nums text-gray-500 shrink-0">{item.quantity.toLocaleString()}개</span>
              </div>
            ))}
          </div>
        )}

        {/* 하단: 입고 + 스테이지 */}
        <div className="flex items-center gap-1.5">
          {shipment.receiving_order_id ? (
            <Link
              href={`/receiving-orders/${shipment.receiving_order_id}`}
              className="text-green-600 text-[10px] font-medium flex items-center gap-0.5 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <Check size={10} />
              입고연결
              <ExternalLink size={9} />
            </Link>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleLinkReceiving}
              disabled={isPending || items.length === 0}
              className="h-6 text-[10px] px-1.5"
            >
              입고생성
            </Button>
          )}
          <div className="flex items-center gap-1 ml-auto">
            <select value={newStage} onChange={(e) => setNewStage(e.target.value)} className="h-6 rounded border px-1 text-[10px] max-w-[90px]">
              <option value="">스테이지</option>
              {INBOUND_STAGES.filter((s) => s.key !== shipment.stage).map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            {newStage && (
              <Button size="sm" variant="outline" onClick={handleStageChange} disabled={isPending} className="h-6 text-[10px] px-1.5">
                변경
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
