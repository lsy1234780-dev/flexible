'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  PackageCheck, CheckCircle2, ChevronRight, ScanBarcode, ArrowLeft, Plus, Minus,
} from 'lucide-react';
import { packOrder, batchCompleteOrders } from '@/actions/orders';
import { getShipmentSerials, getAvailableSerials, logisticsAssignSerial } from '@/actions/shipments';
import dayjs from 'dayjs';

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  products: { name: string; barcode: string } | null;
}

interface Shipment {
  id: string;
  status: string;
  serial_level: string;
  serial_source: string | null;
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
  shipments: { id: string; packed_at: string | null; serial_level: string; serial_source: string | null }[];
}

interface CompletedOrder {
  id: string;
  order_number: string | null;
  status: string;
  created_at: string;
  companies: { id: string; name: string } | null;
  order_items: { id: string; quantity: number; products: { name: string } | null }[];
  shipments: { id: string; completed_at: string | null; serial_level: string; serial_source: string | null }[];
}

interface Props {
  shippedOrders: ShippedOrder[];
  packedOrders: PackedOrder[];
  completedOrders: CompletedOrder[];
}

interface ScanItem {
  productName: string;
  barcode: string;
  productId: string;
  required: number;
  scanned: number;
}

interface AssignedSerialInfo {
  id: string;
  productName: string;
  productId: string;
  serialNumber: number | null;
  unitBarcode: string | null;
  manufacturerSerial: string | null;
  quantity: number;
}

function levelChipColor(level: string): string {
  switch (level) {
    case 'L0': return 'bg-emerald-500/20 text-emerald-400';
    case 'L1': return 'bg-cyan-500/20 text-cyan-400';
    case 'L2': return 'bg-amber-500/20 text-amber-400';
    case 'L3': return 'bg-red-500/20 text-red-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}

export default function DeliveryClient({ shippedOrders, packedOrders, completedOrders }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeOrder, setActiveOrder] = useState<ShippedOrder | null>(null);
  const [scanItems, setScanItems] = useState<ScanItem[]>([]);
  const [scanMessage, setScanMessage] = useState('');
  const [scanStatus, setScanStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const [assignedSerials, setAssignedSerials] = useState<AssignedSerialInfo[]>([]);

  // 물류 시리얼 선택 모드
  interface AvailableSerial { id: string; serial_number: number; unit_barcode: string; manufacturer_serial: string | null }
  const [serialPickerOpen, setSerialPickerOpen] = useState(false);
  const [serialPickerProduct, setSerialPickerProduct] = useState<{ id: string; name: string } | null>(null);
  const [availableSerialsList, setAvailableSerialsList] = useState<AvailableSerial[]>([]);
  const [loadingSerials, setLoadingSerials] = useState(false);

  // L1 admin 체크리스트
  const [checkedSerials, setCheckedSerials] = useState<Set<string>>(new Set());
  function toggleChecked(id: string) {
    setCheckedSerials((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeOrder) barcodeRef.current?.focus();
  }, [activeOrder]);

  function enterScanMode(order: ShippedOrder) {
    setActiveOrder(order);
    setScanItems(
      order.order_items.map((item) => ({
        productName: item.products?.name ?? '-',
        barcode: item.products?.barcode ?? '',
        productId: item.product_id,
        required: item.quantity,
        scanned: 0,
      })),
    );
    setScanMessage('');
    setScanStatus('idle');
    setCheckedSerials(new Set());

    // 시리얼 배정 정보 로드
    const shipment = order.shipments?.[0];
    if (shipment && shipment.serial_level !== 'L0') {
      getShipmentSerials(shipment.id).then((data) => {
        const serials: AssignedSerialInfo[] = (data as unknown as {
          id: string; quantity: number;
          inventory_items: { serial_number: number; unit_barcode: string; manufacturer_serial: string | null } | null;
          products: { name: string } | null;
        }[]).map((s) => ({
          id: s.id,
          productName: s.products?.name ?? '-',
          productId: (s.products as unknown as { id: string } | null)?.id ?? '',
          serialNumber: s.inventory_items?.serial_number ?? null,
          unitBarcode: s.inventory_items?.unit_barcode ?? null,
          manufacturerSerial: s.inventory_items?.manufacturer_serial ?? null,
          quantity: s.quantity,
        }));
        setAssignedSerials(serials);
      }).catch(() => { /* ignore */ });
    } else {
      setAssignedSerials([]);
    }
  }

  function exitScanMode() {
    setActiveOrder(null);
    setScanItems([]);
  }

  const activeLevel = activeOrder?.shipments?.[0]?.serial_level ?? 'L0';
  // L1/L3: 물류가 시리얼 스캔/입력 → 시리얼 선택 팝업
  const isLogisticsSerial = activeLevel === 'L1' || activeLevel === 'L3';
  // L2: 어드민이 배정 → 물류는 체크리스트만
  const isAdminSerial = activeLevel === 'L2';

  function handleScan(barcode: string) {
    if (!barcode.trim()) return;
    const idx = scanItems.findIndex((i) => i.barcode === barcode.trim());

    if (idx === -1) {
      setScanStatus('error');
      setScanMessage(`이 주문에 해당하지 않는 바코드입니다: ${barcode}`);
      setTimeout(() => setScanStatus('idle'), 3000);
      if (barcodeRef.current) { barcodeRef.current.value = ''; barcodeRef.current.focus(); }
      return;
    }

    const item = scanItems[idx];

    // serial_source = logistics: 시리얼 선택 팝업
    if (isLogisticsSerial) {
      setSerialPickerProduct({ id: item.productId, name: item.productName });
      setSerialPickerOpen(true);
      setLoadingSerials(true);
      getAvailableSerials(item.productId, 50).then((data) => {
        setAvailableSerialsList(data as unknown as AvailableSerial[]);
      }).catch(() => {
        toast.error('시리얼 조회 실패');
      }).finally(() => {
        setLoadingSerials(false);
      });
      if (barcodeRef.current) { barcodeRef.current.value = ''; }
      return;
    }

    // 일반 모드: 수량만 증가
    const newScanned = Math.min(item.scanned + 1, item.required);
    setScanItems((prev) => prev.map((si, i) =>
      i === idx ? { ...si, scanned: newScanned } : si,
    ));

    setScanStatus('success');
    setScanMessage(
      newScanned >= item.required
        ? `${item.productName} 완료 (${newScanned}/${item.required})`
        : `${item.productName} +1 (${newScanned}/${item.required})`,
    );

    if (barcodeRef.current) { barcodeRef.current.value = ''; barcodeRef.current.focus(); }
    setTimeout(() => setScanStatus('idle'), 2000);
  }

  // 물류가 시리얼 선택
  function handleSelectSerial(serial: AvailableSerial) {
    const shipment = activeOrder?.shipments?.[0];
    if (!shipment || !serialPickerProduct) return;
    startTransition(async () => {
      const result = await logisticsAssignSerial(shipment.id, serial.id, serialPickerProduct.id);
      if (result.error) { toast.error(result.error); return; }

      toast.success(`${serial.unit_barcode} 배정`);
      setSerialPickerOpen(false);
      setSerialPickerProduct(null);

      // 스캔 수량 증가
      const idx = scanItems.findIndex((i) => i.productId === serialPickerProduct.id);
      if (idx !== -1) {
        setScanItems((prev) => prev.map((si, i) =>
          i === idx ? { ...si, scanned: Math.min(si.scanned + 1, si.required) } : si,
        ));
      }

      // 배정 시리얼 목록 새로고침
      const data = await getShipmentSerials(shipment.id);
      const serials: AssignedSerialInfo[] = (data as unknown as {
        id: string; quantity: number;
        inventory_items: { serial_number: number; unit_barcode: string; manufacturer_serial: string | null } | null;
        products: { id: string; name: string } | null;
      }[]).map((s) => ({
        id: s.id,
        productName: s.products?.name ?? '-',
        productId: s.products?.id ?? '',
        serialNumber: s.inventory_items?.serial_number ?? null,
        unitBarcode: s.inventory_items?.unit_barcode ?? null,
        manufacturerSerial: s.inventory_items?.manufacturer_serial ?? null,
        quantity: s.quantity,
      }));
      setAssignedSerials(serials);

      if (barcodeRef.current) barcodeRef.current.focus();
    });
  }

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

  const allComplete = isAdminSerial
    ? assignedSerials.length > 0 && checkedSerials.size === assignedSerials.length
    : scanItems.length > 0 && scanItems.every((i) => i.scanned >= i.required);

  const [selectedPacked, setSelectedPacked] = useState<Set<string>>(new Set());

  function togglePackedSelection(id: string) {
    setSelectedPacked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllPacked() {
    if (selectedPacked.size === packedOrders.length) setSelectedPacked(new Set());
    else setSelectedPacked(new Set(packedOrders.map((o) => o.id)));
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
      else { toast.success(`${name} 집하 완료`); exitScanMode(); router.refresh(); }
    });
  }

  // ── 스캔 모드 ──
  if (activeOrder) {
    const orderLabel = activeOrder.order_number ?? activeOrder.id.slice(0, 8).toUpperCase();
    return (
      <div className="flex flex-col h-full">
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

        {isAdminSerial ? (
          /* ── L1 어드민 배정: 체크리스트 모드 ── */
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 uppercase tracking-widest">
                배정 시리얼 확인 ({checkedSerials.size}/{assignedSerials.length})
              </p>
              <span className="text-xs text-amber-400 font-medium">L2 · 어드민 배정</span>
            </div>
            {assignedSerials.length === 0 ? (
              <p className="text-center text-gray-600 py-8">배정된 시리얼이 없습니다</p>
            ) : (
              assignedSerials.map((s) => {
                const checked = checkedSerials.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleChecked(s.id)}
                    className={`w-full rounded-xl p-4 text-left transition-colors ${
                      checked
                        ? 'bg-green-900/30 border border-green-800/50'
                        : 'bg-gray-900 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`font-medium text-sm ${checked ? 'text-green-300' : 'text-white'}`}>
                          {s.productName}
                        </p>
                        {s.unitBarcode ? (
                          <p className="text-xs font-mono text-gray-400 mt-0.5">{s.unitBarcode}</p>
                        ) : (
                          <p className="text-xs text-gray-500 mt-0.5">수량: {s.quantity}개</p>
                        )}
                        {s.manufacturerSerial && (
                          <p className="text-xs text-gray-600 font-mono mt-0.5">{s.manufacturerSerial}</p>
                        )}
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        checked ? 'bg-green-500 border-green-500' : 'border-gray-600'
                      }`}>
                        {checked && <CheckCircle2 size={16} className="text-white" />}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          /* ── L0 / L1 물류: 바코드 스캔 모드 ── */
          <>
            <div className="flex-none p-4 space-y-3">
              <div className="space-y-1">
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
              </div>

              {scanStatus !== 'idle' && (
                <div className={`rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                  scanStatus === 'success' ? 'bg-green-900/60 text-green-300' : 'bg-red-900/60 text-red-300'
                }`}>
                  {scanMessage}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-widest">
                제품 목록 ({scanItems.filter((i) => i.scanned >= i.required).length}/{scanItems.length} 완료)
              </p>
              {scanItems.map((item, idx) => {
                const done = item.scanned >= item.required;
                return (
                  <div key={idx} className={`rounded-xl p-4 transition-colors ${
                    done ? 'bg-green-900/30 border border-green-800/50' : 'bg-gray-900'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className={`font-medium text-sm ${done ? 'text-green-300' : 'text-white'}`}>{item.productName}</p>
                        <p className="text-xs text-gray-500 font-mono">{item.barcode}</p>
                      </div>
                      {done && <CheckCircle2 size={20} className="text-green-400 shrink-0" />}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400">필요: {item.required}개</p>
                      <div className="flex items-center gap-2">
                        <button onClick={() => adjustScanned(idx, -1)} className="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 flex items-center justify-center">
                          <Minus size={14} />
                        </button>
                        <input
                          type="number" min={0} max={item.required} value={item.scanned}
                          onChange={(e) => setScannedQty(idx, parseInt(e.target.value, 10) || 0)}
                          className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-center text-white text-base focus:outline-none focus:border-blue-500"
                        />
                        <button onClick={() => adjustScanned(idx, 1)} className="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 flex items-center justify-center">
                          <Plus size={14} />
                        </button>
                        <span className="text-xs text-gray-500 w-6">/{item.required}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 배정된 시리얼 참고 목록 (L1 물류 모드) */}
            {assignedSerials.length > 0 && (
              <div className="flex-none px-4 pb-4 space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-widest">
                  배정 시리얼 ({assignedSerials.length}건)
                </p>
                {assignedSerials.map((s) => (
                  <div key={s.id} className="bg-gray-900 rounded-lg px-3 py-2 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400">{s.productName}</p>
                      {s.unitBarcode ? (
                        <p className="text-sm font-mono text-white">{s.unitBarcode}</p>
                      ) : (
                        <p className="text-sm text-gray-500">수량: {s.quantity}개</p>
                      )}
                    </div>
                    {s.manufacturerSerial && (
                      <span className="text-xs text-gray-500 font-mono">{s.manufacturerSerial}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex-none p-4 border-t border-gray-800 bg-gray-900">
          <button
            type="button"
            onClick={handlePackComplete}
            disabled={!allComplete || isPending}
            className={`w-full h-14 rounded-xl text-lg font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 ${
              allComplete ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white' : 'bg-gray-800 text-gray-500'
            }`}
          >
            <PackageCheck size={22} />
            {isPending ? '처리 중...' : '집하 완료'}
          </button>
        </div>

        {/* 시리얼 선택 팝업 (serial_source = logistics) */}
        {serialPickerOpen && serialPickerProduct && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
            <div className="bg-gray-900 w-full max-h-[70vh] rounded-t-2xl flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <div>
                  <p className="font-bold text-white text-sm">{serialPickerProduct.name}</p>
                  <p className="text-xs text-gray-500">시리얼을 선택하세요</p>
                </div>
                <button
                  onClick={() => { setSerialPickerOpen(false); barcodeRef.current?.focus(); }}
                  className="text-gray-500 hover:text-white text-sm px-3 py-1"
                >
                  닫기
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {loadingSerials ? (
                  <p className="text-center text-gray-500 py-8">로딩 중...</p>
                ) : availableSerialsList.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">가용 시리얼 없음</p>
                ) : (
                  availableSerialsList.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectSerial(s)}
                      disabled={isPending}
                      className="w-full bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-xl px-4 py-3 text-left transition-colors disabled:opacity-50"
                    >
                      <p className="font-mono text-white text-sm">{s.unit_barcode}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>#{s.serial_number}</span>
                        {s.manufacturer_serial && <span>{s.manufacturer_serial}</span>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 목록 UI ──
  return (
    <div className="p-4 space-y-4">
      <p className="text-xs text-gray-500 uppercase tracking-widest">출고 지시 ({shippedOrders.length}건)</p>

      {shippedOrders.length === 0 ? (
        <div className="text-center py-16 text-gray-600">출고 지시 건이 없습니다</div>
      ) : (
        shippedOrders.map((order) => {
          const itemCount = order.order_items.reduce((s, i) => s + i.quantity, 0);
          const productCount = order.order_items.length;
          const shipment = order.shipments?.[0];
          return (
            <button key={order.id} type="button" onClick={() => enterScanMode(order)}
              className="w-full bg-gray-900 rounded-xl p-4 text-left hover:bg-gray-800 active:bg-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">{order.companies?.name ?? '-'}</p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{order.order_number ?? order.id.slice(0, 8).toUpperCase()}</p>
                </div>
                <ChevronRight size={20} className="text-gray-600" />
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                <span>제품 {productCount}종 / {itemCount}개</span>
                <span>·</span>
                <span>지시: {shipment ? dayjs(shipment.created_at).format('MM.DD HH:mm') : '-'}</span>
                {shipment && (
                  <>
                    <span>·</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                      levelChipColor(shipment.serial_level)
                    }`}>
                      {shipment.serial_level}
                    </span>
                  </>
                )}
              </div>
            </button>
          );
        })
      )}

      {packedOrders.length > 0 && (
        <>
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-widest">집하완료 — 출하 대기 ({packedOrders.length}건)</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={selectAllPacked} className="text-xs text-blue-400 hover:text-blue-300">
                {selectedPacked.size === packedOrders.length ? '전체 해제' : '전체 선택'}
              </button>
              {selectedPacked.size > 0 && (
                <button type="button" onClick={handleBatchComplete} disabled={isPending}
                  className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold disabled:opacity-50">
                  {isPending ? '처리 중...' : `${selectedPacked.size}건 출하완료`}
                </button>
              )}
            </div>
          </div>
          {packedOrders.map((order) => {
            const itemSummary = order.order_items.slice(0, 2).map((i) => `${i.products?.name ?? '?'} ×${i.quantity}`).join(', ')
              + (order.order_items.length > 2 ? ` 외 ${order.order_items.length - 2}건` : '');
            const shipment = order.shipments?.[0];
            const isSelected = selectedPacked.has(order.id);
            return (
              <button key={order.id} type="button" onClick={() => togglePackedSelection(order.id)}
                className={`w-full rounded-xl p-4 text-left transition-colors ${
                  isSelected ? 'bg-green-900/40 border border-green-700' : 'bg-blue-900/20 border border-blue-900/30 hover:bg-blue-900/30'
                }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-blue-300 text-sm">{order.companies?.name ?? '-'}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{order.order_number ?? order.id.slice(0, 8).toUpperCase()}</p>
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
                  {shipment && (
                    <>
                      <span>·</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                        levelChipColor(shipment.serial_level)
                      }`}>
                        {shipment.serial_level}
                      </span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </>
      )}

      {completedOrders.length > 0 && (
        <>
          <p className="text-xs text-gray-500 uppercase tracking-widest pt-4">최근 출하완료</p>
          {completedOrders.map((order) => {
            const itemSummary = order.order_items.slice(0, 2).map((i) => `${i.products?.name ?? '?'} ×${i.quantity}`).join(', ')
              + (order.order_items.length > 2 ? ` 외 ${order.order_items.length - 2}건` : '');
            const shipment = order.shipments?.[0];
            return (
              <div key={order.id} className="bg-gray-900/50 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-400 text-sm">{order.companies?.name ?? '-'}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{itemSummary}</p>
                </div>
                <div className="text-right flex items-center gap-1.5 text-green-500">
                  <CheckCircle2 size={16} />
                  <span className="text-xs">{shipment?.completed_at ? dayjs(shipment.completed_at).format('MM.DD HH:mm') : '완료'}</span>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
