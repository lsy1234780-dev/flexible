'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  PackageOpen, ScanBarcode, ArrowLeft, Plus, Minus,
  CheckCircle2, ChevronRight, Trash2, X, List,
  AlertTriangle, Inbox,
} from 'lucide-react';
import {
  receiveItemByBarcode, completeReceiving, cancelReceiving,
  receiveToStaging, createTempProductAndReceive,
} from '@/actions/receiving';
import dayjs from 'dayjs';

// ── 타입 ──

interface ReceivingItem {
  id: string;
  product_id: string;
  expected_quantity: number;
  received_quantity: number;
  products: { name: string; barcode: string } | null;
}

interface ReceivingOrder {
  id: string;
  title: string | null;
  status: string;
  memo: string | null;
  created_at: string;
  completed_at: string | null;
  receiving_items: ReceivingItem[];
}

interface AggregatedItem {
  product_id: string;
  productName: string;
  barcode: string;
  totalExpected: number;
  totalReceived: number;
  staged: number;
  remaining: number;
}

interface StagingItem {
  id: string;
  product_id: string;
  quantity: number;
  scanned_barcode: string;
  memo: string | null;
  created_at: string;
  products: { name: string; barcode: string; is_temporary: boolean } | null;
}

interface Props {
  orders: ReceivingOrder[];
  pendingItems: AggregatedItem[];
  history: ReceivingOrder[];
  stagingItems: StagingItem[];
}

// ── 스캔 모드 로컬 상태 ──

interface ScanItem {
  productName: string;
  barcode: string;
  expected: number;
  received: number;
}

type ViewMode = 'orders' | 'items';

export default function ReceivingClient({ orders, pendingItems, history, stagingItems }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [viewMode, setViewMode] = useState<ViewMode>('orders');
  const [activeOrder, setActiveOrder] = useState<ReceivingOrder | null>(null);
  const [scanItems, setScanItems] = useState<ScanItem[]>([]);
  const [scanMessage, setScanMessage] = useState('');
  const [scanStatus, setScanStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [quantityInput, setQuantityInput] = useState(1);

  // 스테이징 스캔 모드
  const [stagingScanMode, setStagingScanMode] = useState(false);
  const [stagingLog, setStagingLog] = useState<{ name: string; qty: number; isTemp: boolean; autoMatched?: boolean }[]>([]);
  const [tempPrompt, setTempPrompt] = useState<{ barcode: string; qty: number } | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const stagingBarcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeOrder) barcodeRef.current?.focus();
    if (stagingScanMode) stagingBarcodeRef.current?.focus();
  }, [activeOrder, stagingScanMode]);

  // ── 스캔 모드 진입 ──
  function enterScanMode(order: ReceivingOrder) {
    setActiveOrder(order);
    setScanItems(
      order.receiving_items.map((item) => ({
        productName: item.products?.name ?? '-',
        barcode: item.products?.barcode ?? '',
        expected: item.expected_quantity,
        received: item.received_quantity,
      })),
    );
    setScanMessage('');
    setScanStatus('idle');
  }

  function exitScanMode() {
    setActiveOrder(null);
    setScanItems([]);
    router.refresh();
  }

  // ── 바코드 스캔 ──
  function handleScan(barcode: string) {
    if (!barcode.trim() || !activeOrder) return;
    const qty = quantityInput;

    startTransition(async () => {
      const result = await receiveItemByBarcode(activeOrder.id, barcode.trim(), qty);

      if (result.error) {
        setScanStatus('error');
        setScanMessage(result.error);
        setTimeout(() => setScanStatus('idle'), 3000);
      } else {
        setScanStatus('success');
        setScanMessage(result.message ?? '스캔 완료');

        // 로컬 카운트 업데이트 (초과입고 허용)
        setScanItems((prev) => prev.map((si) => {
          if (si.barcode === barcode.trim()) {
            return { ...si, received: si.received + qty };
          }
          return si;
        }));

        setTimeout(() => setScanStatus('idle'), 2000);
        setQuantityInput(1);
      }

      if (barcodeRef.current) {
        barcodeRef.current.value = '';
        barcodeRef.current.focus();
      }
    });
  }

  // ── 입고완료 ──
  function handleComplete() {
    if (!activeOrder) return;
    const totalExp = scanItems.reduce((s, i) => s + i.expected, 0);
    const totalRec = scanItems.reduce((s, i) => s + i.received, 0);
    const msg = allComplete
      ? '입고 완료 처리하시겠습니까?'
      : `미입고 항목이 있습니다 (${totalRec}/${totalExp}개 스캔).\n현재 상태로 완료 처리하시겠습니까?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      const result = await completeReceiving(activeOrder.id);
      if (result.error) toast.error(result.error);
      else {
        toast.success(`입고 완료 (${result.totalReceived}/${result.totalExpected}) — 확인 대기`);
        exitScanMode();
      }
    });
  }

  // ── 취소 ──
  function handleCancel(orderId: string) {
    if (!confirm('이 입고지시서를 취소하시겠습니까?')) return;
    startTransition(async () => {
      const result = await cancelReceiving(orderId);
      if (result.error) toast.error(result.error);
      else {
        toast.success('입고 취소 완료');
        if (activeOrder?.id === orderId) exitScanMode();
        router.refresh();
      }
    });
  }

  const allComplete = scanItems.length > 0 && scanItems.every((i) => i.received >= i.expected);
  const hasAnyReceived = scanItems.some((i) => i.received > 0);

  // ── 스테이징 스캔 ──
  function handleStagingScan(barcode: string) {
    if (!barcode.trim()) return;
    const qty = quantityInput;

    startTransition(async () => {
      const result = await receiveToStaging(barcode.trim(), qty);

      if (result.needTempProduct) {
        // 임시상품 생성 프롬프트
        setTempPrompt({ barcode: barcode.trim(), qty });
        setScanStatus('error');
        setScanMessage(result.error ?? '');
        if (stagingBarcodeRef.current) {
          stagingBarcodeRef.current.value = '';
        }
        return;
      }

      if (result.error) {
        setScanStatus('error');
        setScanMessage(result.error);
        setTimeout(() => setScanStatus('idle'), 3000);
      } else {
        setScanStatus('success');
        const isAutoMatch = result.autoMatched === true;
        setScanMessage((isAutoMatch ? '✓ ' : '') + (result.message ?? '스테이징 입고'));
        setStagingLog((prev) => [{
          name: result.message ?? barcode,
          qty,
          isTemp: false,
          autoMatched: isAutoMatch,
        }, ...prev]);
        setTimeout(() => setScanStatus('idle'), 2000);
        setQuantityInput(1);
      }

      if (stagingBarcodeRef.current) {
        stagingBarcodeRef.current.value = '';
        stagingBarcodeRef.current.focus();
      }
    });
  }

  function handleTempProductConfirm() {
    if (!tempPrompt) return;
    startTransition(async () => {
      const result = await createTempProductAndReceive(tempPrompt.barcode, tempPrompt.qty);
      setTempPrompt(null);

      if (result.error) {
        setScanStatus('error');
        setScanMessage(result.error);
        setTimeout(() => setScanStatus('idle'), 3000);
      } else {
        setScanStatus('success');
        setScanMessage(result.message ?? '임시상품 입고');
        setStagingLog((prev) => [{ name: result.message ?? tempPrompt.barcode, qty: tempPrompt.qty, isTemp: true }, ...prev]);
        setTimeout(() => setScanStatus('idle'), 2000);
        setQuantityInput(1);
      }

      if (stagingBarcodeRef.current) {
        stagingBarcodeRef.current.value = '';
        stagingBarcodeRef.current.focus();
      }
    });
  }

  function exitStagingScan() {
    setStagingScanMode(false);
    setStagingLog([]);
    setScanMessage('');
    setScanStatus('idle');
    setTempPrompt(null);
    router.refresh();
  }

  // ═══════════════════════════════════
  // 스캔 모드 UI (출고관리와 동일 패턴)
  // ═══════════════════════════════════
  if (activeOrder) {
    const orderLabel = activeOrder.title ?? dayjs(activeOrder.created_at).format('MM.DD') + ' 입고';
    const totalExpected = scanItems.reduce((s, i) => s + i.expected, 0);
    const totalReceived = scanItems.reduce((s, i) => s + i.received, 0);

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* 헤더 */}
        <div className="flex-none p-4 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <button onClick={exitScanMode} className="text-gray-400 hover:text-white">
              <ArrowLeft size={22} />
            </button>
            <div className="flex-1">
              <p className="font-bold text-white">{orderLabel}</p>
              <p className="text-xs text-gray-500">
                {totalReceived}/{totalExpected}개 입고
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCancel(activeOrder.id)}
              disabled={isPending}
              className="text-red-400 hover:text-red-300 p-1.5"
              title="입고 취소"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* 바코드 + 수량 */}
        <div className="flex-none p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ScanBarcode size={18} className="text-gray-500 shrink-0" />
            <input
              ref={barcodeRef}
              type="text"
              placeholder="바코드 스캔 대기 중..."
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleScan(barcodeRef.current?.value ?? '');
                }
              }}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">수량</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantityInput((q) => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 flex items-center justify-center"
              >
                <Minus size={14} />
              </button>
              <input
                type="number"
                min={1}
                value={quantityInput}
                onChange={(e) => setQuantityInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-center text-white text-base focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => setQuantityInput((q) => q + 1)}
                className="w-9 h-9 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 flex items-center justify-center"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {scanStatus !== 'idle' && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
              scanStatus === 'success' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'
            }`}>
              {scanMessage}
            </div>
          )}

        </div>

        {/* 제품 목록 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-widest">
            입고 항목 ({scanItems.filter((i) => i.received >= i.expected).length}/{scanItems.length} 완료)
          </p>
          {scanItems.map((item, idx) => {
            const done = item.received >= item.expected;
            const over = item.received > item.expected;
            return (
              <div key={idx} className={`rounded-xl p-4 transition-colors ${
                over ? 'bg-amber-900/30 border border-amber-800/50'
                : done ? 'bg-emerald-900/30 border border-emerald-800/50'
                : 'bg-gray-900'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className={`font-medium text-sm ${over ? 'text-amber-300' : done ? 'text-emerald-300' : 'text-white'}`}>
                      {item.productName}
                    </p>
                    <p className="text-xs text-gray-500 font-mono">{item.barcode}</p>
                  </div>
                  {over
                    ? <span className="text-xs text-amber-400 font-bold shrink-0">초과 +{item.received - item.expected}</span>
                    : done && <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
                  }
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">지시: {item.expected}개</p>
                  <p className={`text-base font-bold ${over ? 'text-amber-400' : done ? 'text-emerald-400' : 'text-white'}`}>
                    {item.received}/{item.expected}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* 하단 완료 버튼 */}
        <div className="flex-none p-4 border-t border-gray-800 bg-gray-900">
          <button
            type="button"
            onClick={handleComplete}
            disabled={!hasAnyReceived || isPending}
            className={`w-full h-14 rounded-xl text-lg font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 ${
              allComplete
                ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white'
                : hasAnyReceived
                  ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white'
                  : 'bg-gray-800 text-gray-500'
            }`}
          >
            <PackageOpen size={22} />
            {isPending ? '처리 중...' : allComplete ? '입고 완료' : '부분 입고 완료'}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // 스테이징 스캔 모드 UI
  // ═══════════════════════════════════
  if (stagingScanMode) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {/* 헤더 */}
        <div className="flex-none p-4 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <button onClick={exitStagingScan} className="text-gray-400 hover:text-white">
              <ArrowLeft size={22} />
            </button>
            <div className="flex-1">
              <p className="font-bold text-white">스테이징 입고</p>
              <p className="text-xs text-gray-500">지시서 무관 — 스캔 후 사무실에서 매칭</p>
            </div>
          </div>
        </div>

        {/* 바코드 + 수량 */}
        <div className="flex-none p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ScanBarcode size={18} className="text-gray-500 shrink-0" />
            <input
              ref={stagingBarcodeRef}
              type="text"
              placeholder="바코드 스캔 대기 중..."
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleStagingScan(stagingBarcodeRef.current?.value ?? '');
                }
              }}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">수량</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantityInput((q) => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 flex items-center justify-center"
              >
                <Minus size={14} />
              </button>
              <input
                type="number"
                min={1}
                value={quantityInput}
                onChange={(e) => setQuantityInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-center text-white text-base focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setQuantityInput((q) => q + 1)}
                className="w-9 h-9 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 flex items-center justify-center"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* 임시상품 생성 프롬프트 */}
          {tempPrompt && (
            <div className="bg-amber-900/60 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-200">미등록 바코드</p>
                  <p className="text-xs text-amber-300/80 mt-0.5 font-mono">{tempPrompt.barcode}</p>
                  <p className="text-xs text-amber-300/80 mt-1">임시 상품을 생성하고 입고를 진행하시겠습니까?</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleTempProductConfirm}
                  disabled={isPending}
                  className="flex-1 py-2 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  예, 임시상품 추가
                </button>
                <button
                  type="button"
                  onClick={() => { setTempPrompt(null); setScanStatus('idle'); stagingBarcodeRef.current?.focus(); }}
                  className="px-4 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {scanStatus !== 'idle' && !tempPrompt && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
              scanStatus === 'success' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'
            }`}>
              {scanMessage}
            </div>
          )}

        </div>

        {/* 스캔 로그 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-widest">
            스캔 이력 ({stagingLog.length}건)
          </p>
          {stagingLog.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <Inbox size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">바코드를 스캔하세요</p>
            </div>
          ) : (
            stagingLog.map((log, idx) => (
              <div key={idx} className={`rounded-xl p-3 ${
                log.autoMatched ? 'bg-emerald-900/20 border border-emerald-800/30'
                : log.isTemp ? 'bg-amber-900/20 border border-amber-800/30'
                : 'bg-gray-900'
              }`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium ${
                    log.autoMatched ? 'text-emerald-300'
                    : log.isTemp ? 'text-amber-300'
                    : 'text-white'
                  }`}>
                    {log.isTemp && <AlertTriangle size={12} className="inline mr-1" />}
                    {log.autoMatched && <CheckCircle2 size={12} className="inline mr-1" />}
                    {log.name}
                  </p>
                  <span className="text-xs text-gray-500">{log.qty}개</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 미매칭 스테이징 현황 */}
        {stagingItems.length > 0 && (
          <div className="flex-none p-4 border-t border-gray-800 bg-gray-900">
            <p className="text-xs text-gray-500 mb-1">
              미매칭 스테이징: {stagingItems.length}건
            </p>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════
  // 목록 UI — 탭: 지시서별 / 전체 물품
  // ═══════════════════════════════════
  return (
    <div className="p-4 space-y-4">
      {/* 뷰 전환 탭 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setViewMode('orders')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            viewMode === 'orders'
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          입고지시서 ({orders.length})
        </button>
        <button
          type="button"
          onClick={() => setViewMode('items')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            viewMode === 'items'
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          전체 미입고 ({pendingItems.length})
        </button>
      </div>

      {/* ── 지시서별 보기 ── */}
      {viewMode === 'orders' && (
        <>
          {orders.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <PackageOpen size={48} className="mx-auto mb-3 opacity-30" />
              <p>대기 중인 입고지시서가 없습니다</p>
            </div>
          ) : (
            orders.map((order) => {
              const totalExpected = order.receiving_items.reduce((s, i) => s + i.expected_quantity, 0);
              const totalReceived = order.receiving_items.reduce((s, i) => s + i.received_quantity, 0);
              const productCount = order.receiving_items.length;
              const isInProgress = order.status === 'in_progress';

              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => enterScanMode(order)}
                  className={`w-full rounded-xl p-4 text-left transition-colors ${
                    isInProgress
                      ? 'bg-emerald-900/30 border border-emerald-800/50 hover:bg-emerald-900/50'
                      : 'bg-gray-900 hover:bg-gray-800 active:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-bold ${isInProgress ? 'text-emerald-300' : 'text-white'}`}>
                        {order.title ?? dayjs(order.created_at).format('MM.DD') + ' 입고'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {dayjs(order.created_at).format('MM.DD HH:mm')}
                        {isInProgress && ' · 진행 중'}
                      </p>
                    </div>
                    <ChevronRight size={20} className="text-gray-600" />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">
                      {productCount}종 / {totalExpected}개
                    </span>
                    {totalReceived > 0 && (
                      <span className="text-xs text-emerald-400 font-bold">
                        {totalReceived}/{totalExpected} 입고
                      </span>
                    )}
                  </div>
                  {/* 진행 바 */}
                  {totalExpected > 0 && (
                    <div className="mt-2 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (totalReceived / totalExpected) * 100)}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </>
      )}

      {/* ── 전체 미입고 물품 보기 ── */}
      {viewMode === 'items' && (
        <>
          {/* 스테이징 스캔 버튼 */}
          <button
            type="button"
            onClick={() => setStagingScanMode(true)}
            className="w-full py-3 rounded-xl bg-amber-600 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-amber-700 active:bg-amber-800 transition-colors"
          >
            <ScanBarcode size={18} />
            바코드 스캔 입고
          </button>

          {/* 미매칭 스테이징 현황 */}
          {stagingItems.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl p-3">
              <p className="text-xs text-amber-400 font-bold mb-1">
                미매칭 스테이징 {stagingItems.length}건
              </p>
              <p className="text-xs text-gray-500">사무실에서 입고지시서와 매칭 대기 중</p>
            </div>
          )}

          {pendingItems.length === 0 && stagingItems.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <List size={48} className="mx-auto mb-3 opacity-30" />
              <p>미입고 물품이 없습니다</p>
            </div>
          ) : pendingItems.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                전체 지시서 합산 · 미입고 수량 기준
              </p>
              {pendingItems.map((item) => {
                const totalDone = item.totalReceived + item.staged;
                const hasStaging = item.staged > 0;
                const onlyStaging = item.totalExpected === 0 && item.staged > 0;
                return (
                  <div key={item.product_id} className={`rounded-xl p-4 ${hasStaging ? 'bg-gray-900 border border-amber-800/30' : 'bg-gray-900'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white text-sm">{item.productName}</p>
                        <p className="text-xs text-gray-500 font-mono">{item.barcode}</p>
                      </div>
                      <div className="text-right">
                        {onlyStaging ? (
                          <>
                            <p className="text-base font-bold text-amber-400">{item.staged}개</p>
                            <p className="text-xs text-amber-500">스테이징</p>
                          </>
                        ) : (
                          <>
                            <p className={`text-base font-bold ${item.remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {totalDone}/{item.totalExpected}
                            </p>
                            <div className="flex items-center gap-1.5 justify-end">
                              {item.totalReceived > 0 && (
                                <span className="text-xs text-emerald-500">{item.totalReceived} 확정</span>
                              )}
                              {hasStaging && (
                                <span className="text-xs text-amber-400">{item.staged} 스테이징</span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {/* 진행 바 */}
                    {item.totalExpected > 0 && (
                      <div className="mt-2 h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
                        {item.totalReceived > 0 && (
                          <div
                            className="h-full bg-emerald-500 rounded-l-full"
                            style={{ width: `${Math.min(100, (item.totalReceived / item.totalExpected) * 100)}%` }}
                          />
                        )}
                        {hasStaging && (
                          <div
                            className="h-full bg-amber-500"
                            style={{ width: `${Math.min(100 - (item.totalReceived / item.totalExpected) * 100, (item.staged / item.totalExpected) * 100)}%` }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      )}

      {/* ── 최근 완료 이력 ── */}
      {history.length > 0 && (
        <>
          <p className="text-xs text-gray-500 uppercase tracking-widest pt-2">최근 입고 이력</p>
          {history.map((order) => {
            const totalQty = order.receiving_items.reduce((s, i) => s + i.received_quantity, 0);
            const isCancelled = order.status === 'cancelled';
            return (
              <div
                key={order.id}
                className={`rounded-xl p-4 flex items-center justify-between ${
                  isCancelled ? 'bg-red-900/20' : 'bg-gray-900/50'
                }`}
              >
                <div>
                  <p className={`font-medium text-sm ${isCancelled ? 'text-red-400 line-through' : 'text-gray-400'}`}>
                    {order.title ?? dayjs(order.created_at).format('MM.DD') + ' 입고'} — {totalQty}개
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {order.completed_at ? dayjs(order.completed_at).format('MM.DD HH:mm') : dayjs(order.created_at).format('MM.DD HH:mm')}
                    {isCancelled && ' (취소됨)'}
                  </p>
                </div>
                {isCancelled
                  ? <X size={18} className="text-red-500" />
                  : <CheckCircle2 size={18} className="text-emerald-500" />
                }
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
