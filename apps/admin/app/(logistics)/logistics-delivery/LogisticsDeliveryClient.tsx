'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  PackageCheck, CheckCircle2, ChevronRight, ScanBarcode, ArrowLeft, Plus, Minus,
} from 'lucide-react';
import { packOrder, completeOrder, batchCompleteOrders } from '@/actions/orders';
import dayjs from 'dayjs';

interface OrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  products: { name: string; barcode: string } | null;
}

interface Shipment {
  id: string;
  status: string;
  created_at: string;
}

interface ShippedOrder {
  id: string;
  order_number: string | null;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  companies: { id: string; name: string } | null;
  order_items: OrderItem[];
  shipments: Shipment[];
}

interface PackedOrder {
  id: string;
  order_number: string | null;
  status: string;
  created_at: string;
  companies: { id: string; name: string } | null;
  order_items: { id: string; quantity: number; products: { name: string } | null }[];
  shipments: { id: string; packed_at: string | null }[];
}

interface CompletedOrder {
  id: string;
  order_number: string | null;
  status: string;
  created_at: string;
  companies: { id: string; name: string } | null;
  order_items: { id: string; quantity: number; products: { name: string } | null }[];
  shipments: { id: string; completed_at: string | null }[];
}

interface Props {
  shippedOrders: ShippedOrder[];
  packedOrders: PackedOrder[];
  completedOrders: CompletedOrder[];
}

// 스캔 확인 상태 (제품별)
interface ScanItem {
  productName: string;
  barcode: string;
  required: number;  // 주문 수량
  scanned: number;   // 스캔 확인 수량
}

export default function LogisticsDeliveryClient({ shippedOrders, packedOrders, completedOrders }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 선택된 주문 (출고 스캔 모드)
  const [activeOrder, setActiveOrder] = useState<ShippedOrder | null>(null);
  const [scanItems, setScanItems] = useState<ScanItem[]>([]);
  const [scanMessage, setScanMessage] = useState('');
  const [scanStatus, setScanStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const barcodeRef = useRef<HTMLInputElement>(null);

  // 스캔 모드 진입 시 바코드 입력에 포커스
  useEffect(() => {
    if (activeOrder) {
      barcodeRef.current?.focus();
    }
  }, [activeOrder]);

  function enterScanMode(order: ShippedOrder) {
    setActiveOrder(order);
    setScanItems(
      order.order_items.map((item) => ({
        productName: item.products?.name ?? '-',
        barcode: item.products?.barcode ?? '',
        required: item.quantity,
        scanned: 0,
      })),
    );
    setScanMessage('');
    setScanStatus('idle');
  }

  function exitScanMode() {
    setActiveOrder(null);
    setScanItems([]);
  }

  // 바코드 스캔 처리
  function handleScan(barcode: string) {
    if (!barcode.trim()) return;

    const qty = 1;
    const idx = scanItems.findIndex((i) => i.barcode === barcode.trim());

    if (idx === -1) {
      setScanStatus('error');
      setScanMessage(`이 주문에 해당하지 않는 바코드입니다: ${barcode}`);
      setTimeout(() => setScanStatus('idle'), 3000);
      if (barcodeRef.current) { barcodeRef.current.value = ''; barcodeRef.current.focus(); }
      return;
    }

    const item = scanItems[idx];
    const newScanned = Math.min(item.scanned + qty, item.required);

    setScanItems((prev) => prev.map((si, i) =>
      i === idx ? { ...si, scanned: newScanned } : si,
    ));

    if (newScanned >= item.required) {
      setScanStatus('success');
      setScanMessage(`${item.productName} 완료 (${newScanned}/${item.required})`);
    } else {
      setScanStatus('success');
      setScanMessage(`${item.productName} +${qty} (${newScanned}/${item.required})`);
    }

    // 바코드만 클리어 (수량은 유지 — PDA 연속 스캔 대응)
    if (barcodeRef.current) { barcodeRef.current.value = ''; barcodeRef.current.focus(); }
    setTimeout(() => setScanStatus('idle'), 2000);
  }

  // 수량 직접 조정
  function adjustScanned(idx: number, delta: number) {
    setScanItems((prev) => prev.map((si, i) => {
      if (i !== idx) return si;
      const next = Math.max(0, Math.min(si.scanned + delta, si.required));
      return { ...si, scanned: next };
    }));
  }

  function setScannedQty(idx: number, value: number) {
    setScanItems((prev) => prev.map((si, i) => {
      if (i !== idx) return si;
      const next = Math.max(0, Math.min(value, si.required));
      return { ...si, scanned: next };
    }));
  }

  const allComplete = scanItems.length > 0 && scanItems.every((i) => i.scanned >= i.required);

  // 일괄 출하완료 선택 상태
  const [selectedPacked, setSelectedPacked] = useState<Set<string>>(new Set());

  function togglePackedSelection(id: string) {
    setSelectedPacked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllPacked() {
    if (selectedPacked.size === packedOrders.length) {
      setSelectedPacked(new Set());
    } else {
      setSelectedPacked(new Set(packedOrders.map((o) => o.id)));
    }
  }

  function handleBatchComplete() {
    if (selectedPacked.size === 0) return;
    if (!confirm(`${selectedPacked.size}건을 일괄 출하완료 처리하시겠습니까?`)) return;

    startTransition(async () => {
      const results = await batchCompleteOrders(Array.from(selectedPacked));
      const successCount = results.filter((r) => r.success).length;
      const errorCount = results.filter((r) => r.error).length;
      if (successCount > 0) toast.success(`${successCount}건 출하 완료`);
      if (errorCount > 0) toast.error(`${errorCount}건 실패`);
      setSelectedPacked(new Set());
      router.refresh();
    });
  }

  function handlePackComplete() {
    if (!activeOrder) return;
    const name = activeOrder.companies?.name ?? '';
    if (!confirm(`${name} 집하를 완료 처리하시겠습니까?`)) return;

    startTransition(async () => {
      const result = await packOrder(activeOrder.id);
      if (result.error) toast.error(result.error);
      else {
        toast.success(`${name} 집하 완료`);
        exitScanMode();
        router.refresh();
      }
    });
  }

  // ── 스캔 모드 UI ──
  if (activeOrder) {
    const orderLabel = activeOrder.order_number ?? activeOrder.id.slice(0, 8).toUpperCase();

    return (
      <div className="flex flex-col h-full">
        {/* 헤더 */}
        <div className="flex-none p-4 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <button onClick={exitScanMode} className="text-gray-400 hover:text-white">
              <ArrowLeft size={22} />
            </button>
            <div>
              <p className="font-bold text-white">{activeOrder.companies?.name ?? '-'}</p>
              <p className="text-xs text-gray-500 font-mono">{orderLabel}</p>
            </div>
          </div>
        </div>

        {/* 스캔 입력 영역 */}
        <div className="flex-none p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ScanBarcode size={18} className="text-gray-500 shrink-0" />
            <input
              ref={barcodeRef}
              type="text"
              placeholder="바코드 스캔 대기 중..."
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleScan(barcodeRef.current?.value ?? '');
              }}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {scanStatus !== 'idle' && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium transition-all ${
              scanStatus === 'success' ? 'bg-green-900/60 text-green-300' : 'bg-red-900/60 text-red-300'
            }`}>
              {scanMessage}
            </div>
          )}
        </div>

        {/* 제품 목록 (스크롤) */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-widest">
            제품 목록 ({scanItems.filter((i) => i.scanned >= i.required).length}/{scanItems.length} 완료)
          </p>

          {scanItems.map((item, idx) => {
            const done = item.scanned >= item.required;
            return (
              <div
                key={idx}
                className={`rounded-xl p-4 transition-colors ${
                  done ? 'bg-green-900/30 border border-green-800/50' : 'bg-gray-900'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className={`font-medium text-sm ${done ? 'text-green-300' : 'text-white'}`}>
                      {item.productName}
                    </p>
                    <p className="text-xs text-gray-500 font-mono">{item.barcode}</p>
                  </div>
                  {done && <CheckCircle2 size={20} className="text-green-400 shrink-0" />}
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    필요: {item.required}개
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => adjustScanned(idx, -1)}
                      className="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 flex items-center justify-center"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={item.required}
                      value={item.scanned}
                      onChange={(e) => setScannedQty(idx, parseInt(e.target.value, 10) || 0)}
                      className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-center text-white text-base focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => adjustScanned(idx, 1)}
                      className="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 flex items-center justify-center"
                    >
                      <Plus size={14} />
                    </button>
                    <span className="text-xs text-gray-500 w-6">
                      /{item.required}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 하단 집하완료 버튼 */}
        <div className="flex-none p-4 border-t border-gray-800 bg-gray-900">
          <button
            type="button"
            onClick={handlePackComplete}
            disabled={!allComplete || isPending}
            className={`w-full h-14 rounded-xl text-lg font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 ${
              allComplete
                ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white'
                : 'bg-gray-800 text-gray-500'
            }`}
          >
            <PackageCheck size={22} />
            {isPending ? '처리 중...' : '집하 완료'}
          </button>
        </div>
      </div>
    );
  }

  // ── 출고지시 목록 UI ──
  return (
    <div className="p-4 space-y-4">
      <p className="text-xs text-gray-500 uppercase tracking-widest">
        출고 지시 ({shippedOrders.length}건)
      </p>

      {shippedOrders.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          출고 지시 건이 없습니다
        </div>
      ) : (
        shippedOrders.map((order) => {
          const itemCount = order.order_items.reduce((s, i) => s + i.quantity, 0);
          const productCount = order.order_items.length;
          const shipment = order.shipments?.[0];

          return (
            <button
              key={order.id}
              type="button"
              onClick={() => enterScanMode(order)}
              className="w-full bg-gray-900 rounded-xl p-4 text-left hover:bg-gray-800 active:bg-gray-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">{order.companies?.name ?? '-'}</p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    {order.order_number ?? order.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
                <ChevronRight size={20} className="text-gray-600" />
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                <span>제품 {productCount}종 / {itemCount}개</span>
                <span>·</span>
                <span>지시: {shipment ? dayjs(shipment.created_at).format('MM.DD HH:mm') : '-'}</span>
              </div>
            </button>
          );
        })
      )}

      {/* 집하완료 (일괄 출하 대기) */}
      {packedOrders.length > 0 && (
        <>
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-widest">
              집하완료 — 출하 대기 ({packedOrders.length}건)
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllPacked}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {selectedPacked.size === packedOrders.length ? '전체 해제' : '전체 선택'}
              </button>
              {selectedPacked.size > 0 && (
                <button
                  type="button"
                  onClick={handleBatchComplete}
                  disabled={isPending}
                  className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold disabled:opacity-50"
                >
                  {isPending ? '처리 중...' : `${selectedPacked.size}건 출하완료`}
                </button>
              )}
            </div>
          </div>
          {packedOrders.map((order) => {
            const itemSummary = order.order_items
              .slice(0, 2)
              .map((i) => `${i.products?.name ?? '?'} ×${i.quantity}`)
              .join(', ') + (order.order_items.length > 2 ? ` 외 ${order.order_items.length - 2}건` : '');
            const shipment = order.shipments?.[0];
            const isSelected = selectedPacked.has(order.id);

            return (
              <button
                key={order.id}
                type="button"
                onClick={() => togglePackedSelection(order.id)}
                className={`w-full rounded-xl p-4 text-left transition-colors ${
                  isSelected
                    ? 'bg-green-900/40 border border-green-700'
                    : 'bg-blue-900/20 border border-blue-900/30 hover:bg-blue-900/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-blue-300 text-sm">{order.companies?.name ?? '-'}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">
                      {order.order_number ?? order.id.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    isSelected ? 'bg-green-500 border-green-500' : 'border-gray-600'
                  }`}>
                    {isSelected && <CheckCircle2 size={14} className="text-white" />}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>{itemSummary}</span>
                  <span>·</span>
                  <span>집하: {shipment?.packed_at ? dayjs(shipment.packed_at).format('MM.DD HH:mm') : '-'}</span>
                </div>
              </button>
            );
          })}
        </>
      )}

      {/* 최근 출하완료 */}
      {completedOrders.length > 0 && (
        <>
          <p className="text-xs text-gray-500 uppercase tracking-widest pt-4">최근 출하완료</p>
          {completedOrders.map((order) => {
            const itemSummary = order.order_items
              .slice(0, 2)
              .map((i) => `${i.products?.name ?? '?'} ×${i.quantity}`)
              .join(', ') + (order.order_items.length > 2 ? ` 외 ${order.order_items.length - 2}건` : '');
            const shipment = order.shipments?.[0];

            return (
              <div key={order.id} className="bg-gray-900/50 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-400 text-sm">{order.companies?.name ?? '-'}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{itemSummary}</p>
                </div>
                <div className="text-right flex items-center gap-1.5 text-green-500">
                  <CheckCircle2 size={16} />
                  <span className="text-xs">
                    {shipment?.completed_at
                      ? dayjs(shipment.completed_at).format('MM.DD HH:mm')
                      : '완료'}
                  </span>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
