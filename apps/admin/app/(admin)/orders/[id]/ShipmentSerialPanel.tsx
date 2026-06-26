'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  X, Loader2, Package, Check, ChevronDown, ChevronUp,
  Zap, Trash2, RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  getShipmentDetail, getAvailableSerials, autoAssignSerials,
  assignSerials, assignQuantityOnly, unassignSerial,
  getShipmentSerials, updateSerialLevel,
  getShipmentSerialCount,
  assignSerialsByText,
} from '@/actions/shipments';

// ── 타입 ──

interface Product {
  id: string;
  name: string;
  barcode: string;
  serial_mode: string;
  base_stock: number;
}

interface OrderItemWithProduct {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  products: Product | null;
}

interface ShipmentInfo {
  id: string;
  serial_level: string;
  memo: string | null;
}

type SerialLevel = 'L0' | 'L1' | 'L2' | 'L3';

interface AvailableSerial {
  id: string;
  serial_number: number;
  unit_barcode: string;
  manufacturer_serial: string | null;
  status: string;
  product_lots: { lot_number: string; manufactured_at: string; received_at: string } | null;
}

interface AssignedSerial {
  id: string;
  quantity: number;
  assigned_by: string | null;
  created_at: string;
  inventory_items: {
    id: string;
    serial_number: number;
    unit_barcode: string;
    manufacturer_serial: string | null;
  } | null;
  products: { id: string; name: string; barcode: string; serial_mode: string } | null;
}

interface Props {
  orderId: string;
  onClose: () => void;
}

export default function ShipmentSerialPanel({ orderId, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);

  // 데이터
  const [orderItems, setOrderItems] = useState<OrderItemWithProduct[]>([]);
  const [shipment, setShipment] = useState<ShipmentInfo | null>(null);
  const [assignedSerials, setAssignedSerials] = useState<AssignedSerial[]>([]);

  // UI 상태
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [availableSerials, setAvailableSerials] = useState<AvailableSerial[]>([]);
  const [selectedSerials, setSelectedSerials] = useState<Set<string>>(new Set());
  const [loadingSerials, setLoadingSerials] = useState(false);
  const [inputMode, setInputMode] = useState<'select' | 'text'>('select');
  const [serialText, setSerialText] = useState('');

  // 데이터 로드
  const loadData = useCallback(async () => {
    try {
      const detail = await getShipmentDetail(orderId);
      if (!detail) return;
      const items = (detail.order_items ?? []) as unknown as OrderItemWithProduct[];
      const ship = Array.isArray(detail.shipments) ? detail.shipments[0] : (detail.shipments as unknown as ShipmentInfo);
      setOrderItems(items);
      setShipment(ship ?? null);

      if (ship) {
        const assigned = await getShipmentSerials(ship.id);
        setAssignedSerials(assigned as unknown as AssignedSerial[]);
      }
    } catch (err) {
      toast.error('출고 정보 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { loadData(); }, [loadData]);

  // 제품 확장 → 가용 시리얼 로드
  async function handleExpandProduct(productId: string) {
    if (expandedProduct === productId) {
      setExpandedProduct(null);
      return;
    }
    setExpandedProduct(productId);
    setSelectedSerials(new Set());
    setLoadingSerials(true);
    try {
      const serials = await getAvailableSerials(productId, 200);
      setAvailableSerials(serials as unknown as AvailableSerial[]);
    } catch {
      toast.error('시리얼 조회 실패');
    } finally {
      setLoadingSerials(false);
    }
  }

  // 시리얼 선택 토글
  function toggleSerial(serialId: string) {
    setSelectedSerials((prev) => {
      const next = new Set(prev);
      if (next.has(serialId)) next.delete(serialId);
      else next.add(serialId);
      return next;
    });
  }

  // 수동 배정
  function handleAssignSelected(productId: string) {
    if (!shipment || selectedSerials.size === 0) return;
    startTransition(async () => {
      const items = Array.from(selectedSerials).map((inventory_item_id) => ({
        inventory_item_id,
        product_id: productId,
      }));
      const result = await assignSerials(shipment.id, items);
      if (result.error) toast.error(result.error);
      else {
        toast.success(`${result.count}건 시리얼 배정 완료`);
        setSelectedSerials(new Set());
        await loadData();
        // 가용 시리얼 새로고침
        const serials = await getAvailableSerials(productId, 200);
        setAvailableSerials(serials as unknown as AvailableSerial[]);
      }
    });
  }

  // FIFO 자동 배정
  function handleAutoAssign(productId: string, quantity: number) {
    if (!shipment) return;
    startTransition(async () => {
      const result = await autoAssignSerials(shipment.id, productId, quantity);
      if (result.error) toast.error(result.error);
      else {
        toast.success(`FIFO ${result.count}건 자동 배정`);
        await loadData();
        if (expandedProduct === productId) {
          const serials = await getAvailableSerials(productId, 200);
          setAvailableSerials(serials as unknown as AvailableSerial[]);
        }
      }
    });
  }

  // none 모드 수량 배정
  function handleAssignQuantity(productId: string, quantity: number) {
    if (!shipment) return;
    startTransition(async () => {
      const result = await assignQuantityOnly(shipment.id, productId, quantity);
      if (result.error) toast.error(result.error);
      else {
        toast.success('수량 배정 완료');
        await loadData();
      }
    });
  }

  // 직접 입력 배정
  function handleTextAssign(productId: string) {
    if (!shipment || !serialText.trim()) return;
    const lines = serialText.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error('시리얼을 입력하세요'); return; }

    startTransition(async () => {
      const result = await assignSerialsByText(shipment.id, productId, lines);
      if (result.error) {
        toast.error(result.error);
      } else {
        let msg = `${result.assigned}건 배정 완료`;
        if (result.skipped && result.skipped > 0) msg += `, ${result.skipped}건 이미 배정됨`;
        if (result.notFound && result.notFound.length > 0) {
          msg += `\n미발견: ${result.notFound.join(', ')}`;
        }
        toast.success(msg);
        setSerialText('');
        await loadData();
        if (expandedProduct === productId) {
          const serials = await getAvailableSerials(productId, 200);
          setAvailableSerials(serials as unknown as AvailableSerial[]);
        }
      }
    });
  }

  // 배정 해제
  function handleUnassign(shipmentSerialId: string) {
    startTransition(async () => {
      const result = await unassignSerial(shipmentSerialId);
      if (result.error) toast.error(result.error);
      else {
        toast.success('배정 해제');
        await loadData();
        if (expandedProduct) {
          const serials = await getAvailableSerials(expandedProduct, 200);
          setAvailableSerials(serials as unknown as AvailableSerial[]);
        }
      }
    });
  }

  // 레벨 변경 (L0~L3)
  async function handleLevelChange(newLevel: SerialLevel) {
    if (!shipment) return;
    if (shipment.serial_level === newLevel) return;

    // 기존 배정이 있는지 확인 → 경고
    const countResult = await getShipmentSerialCount(shipment.id);
    if (countResult.error) {
      toast.error(countResult.error);
      return;
    }

    if ((countResult.count ?? 0) > 0) {
      const confirmed = confirm(
        `현재 ${countResult.count}건의 시리얼이 배정되어 있습니다.\n레벨을 변경하면 모든 배정이 초기화됩니다. 계속하시겠습니까?`,
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      const result = await updateSerialLevel(shipment.id, newLevel);
      if (result.error) toast.error(result.error);
      else {
        const cleared = result.cleared ?? 0;
        toast.success(cleared > 0 ? `${newLevel} 변경 완료 (${cleared}건 초기화)` : `${newLevel} 변경 완료`);
        await loadData();
      }
    });
  }

  function currentLevel(): SerialLevel {
    return (shipment?.serial_level as SerialLevel) ?? 'L0';
  }

  // 제품별 배정 현황
  function getAssignedForProduct(productId: string) {
    return assignedSerials.filter((a) =>
      a.products?.id === productId || (!a.products && !a.inventory_items),
    );
  }

  function getAssignedCountForProduct(productId: string) {
    return assignedSerials
      .filter((a) => a.products?.id === productId)
      .reduce((sum, a) => sum + a.quantity, 0);
  }

  // ── 렌더 ──

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8">
          <Loader2 size={24} className="animate-spin text-gray-400 mx-auto" />
          <p className="text-sm text-gray-500 mt-2">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 text-center">
          <p className="text-sm text-gray-500">출고 정보가 없습니다</p>
          <button onClick={onClose} className="mt-3 text-sm text-gray-500 hover:text-gray-700">닫기</button>
        </div>
      </div>
    );
  }

  const levelLabel: Record<SerialLevel, string> = { L0: '시리얼 미추적', L1: '출고후 매칭', L2: '출고목록 지정', L3: '개별지정' };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-t-2xl sm:rounded-2xl flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Package size={18} />
              시리얼 관리
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          {/* 레벨 셀렉터 */}
          <select
            value={currentLevel()}
            disabled={isPending}
            onChange={(e) => handleLevelChange(e.target.value as SerialLevel)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
          >
            <option value="L0">L0 — 시리얼 미추적</option>
            <option value="L1">L1 — 출고후 매칭</option>
            <option value="L2">L2 — 출고목록 지정</option>
            <option value="L3">L3 — 개별지정</option>
          </select>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {currentLevel() === 'L0' ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">미추적 모드입니다</p>
              <p className="text-xs text-gray-400 mt-1">시리얼 배정이 필요하면 위에서 레벨을 변경하세요</p>
            </div>
          ) : (currentLevel() === 'L1' || currentLevel() === 'L3') ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">
                {currentLevel() === 'L1'
                  ? '물류가 스캔 후 시리얼 선택 → 어드민이 사후 매칭'
                  : '물류가 바코드·고객·시리얼 모두 입력'}
              </p>
              <p className="text-xs text-gray-400 mt-1">물류 앱에서 시리얼이 입력되면 여기에 표시됩니다</p>
              {assignedSerials.length > 0 && (
                <div className="mt-4 text-left max-w-md mx-auto">
                  <p className="text-xs font-medium text-gray-600 mb-2">물류팀 입력 현황</p>
                  {assignedSerials.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-sm py-1 border-b">
                      <span className="font-mono text-xs">{a.inventory_items?.unit_barcode ?? `수량: ${a.quantity}개`}</span>
                      <span className="text-xs text-gray-400">{a.products?.name ?? '-'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : orderItems.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">주문 항목이 없습니다</p>
          ) : (
            orderItems.map((item) => {
              const product = item.products as unknown as Product | null;
              if (!product) return null;

              const serialMode = product.serial_mode ?? 'pool';
              const isExpanded = expandedProduct === product.id;
              const assignedCount = getAssignedCountForProduct(product.id);
              const remaining = item.quantity - assignedCount;
              const isComplete = remaining <= 0;
              const productAssigned = assignedSerials.filter((a) => a.products?.id === product.id);

              return (
                <div key={item.id} className="border rounded-xl overflow-hidden">
                  {/* 제품 헤더 */}
                  <button
                    type="button"
                    onClick={() => serialMode !== 'none' ? handleExpandProduct(product.id) : undefined}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">{product.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {serialMode === 'none' ? '수량관리' : serialMode === 'pool' ? '자체시리얼' : '제조사시리얼'}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        주문: {item.quantity}개
                      </span>
                      {isComplete && <Check size={16} className="text-green-500" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        isComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        배정 {assignedCount}/{item.quantity}
                      </span>
                      {serialMode !== 'none' && (
                        isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />
                      )}
                    </div>
                  </button>

                  {/* none 모드: 수량만 배정 */}
                  {serialMode === 'none' && !isComplete && (
                    <div className="px-4 py-3 border-t bg-gray-50/50">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={isPending}
                        onClick={() => handleAssignQuantity(product.id, item.quantity)}
                      >
                        <Check size={12} /> 수량 배정 ({item.quantity}개)
                      </Button>
                    </div>
                  )}

                  {/* 배정된 시리얼 목록 */}
                  {productAssigned.length > 0 && (
                    <div className="border-t">
                      <div className="px-4 py-2 bg-green-50/50">
                        <p className="text-xs font-medium text-green-700 mb-1">배정됨</p>
                        <div className="space-y-1">
                          {productAssigned.map((a) => (
                            <div key={a.id} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-3">
                                {a.inventory_items ? (
                                  <>
                                    <span className="font-mono text-xs text-gray-600">
                                      #{a.inventory_items.serial_number}
                                    </span>
                                    <span className="font-mono text-xs">
                                      {a.inventory_items.unit_barcode}
                                    </span>
                                    {a.inventory_items.manufacturer_serial && (
                                      <span className="text-xs text-gray-400">
                                        ({a.inventory_items.manufacturer_serial})
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-xs text-gray-500">수량: {a.quantity}개</span>
                                )}
                                <Badge variant="outline" className="text-[10px] h-4">
                                  {a.assigned_by === 'auto' ? 'FIFO' : a.assigned_by === 'admin' ? '수동' : a.assigned_by ?? '-'}
                                </Badge>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                                disabled={isPending}
                                onClick={() => handleUnassign(a.id)}
                              >
                                <Trash2 size={12} />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 시리얼 배정 영역 (pool/strict 모드) */}
                  {isExpanded && serialMode !== 'none' && (
                    <div className="border-t px-4 py-3 space-y-3">
                      {/* 입력 방식 탭 */}
                      <div className="flex items-center gap-1 border-b pb-2">
                        <button
                          type="button"
                          onClick={() => setInputMode('select')}
                          className={`px-3 py-1 rounded-t text-xs font-medium transition-colors ${
                            inputMode === 'select'
                              ? 'bg-gray-100 text-gray-900'
                              : 'text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          목록 선택
                        </button>
                        <button
                          type="button"
                          onClick={() => setInputMode('text')}
                          className={`px-3 py-1 rounded-t text-xs font-medium transition-colors ${
                            inputMode === 'text'
                              ? 'bg-gray-100 text-gray-900'
                              : 'text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          직접 입력
                        </button>
                      </div>

                      {inputMode === 'select' ? (
                        <>
                          {/* 액션 바 */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {remaining > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={isPending}
                                  onClick={() => handleAutoAssign(product.id, remaining)}
                                >
                                  <Zap size={12} /> FIFO 자동 ({remaining}개)
                                </Button>
                              )}
                              {selectedSerials.size > 0 && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={isPending}
                                  onClick={() => handleAssignSelected(product.id)}
                                >
                                  <Check size={12} /> 선택 배정 ({selectedSerials.size}건)
                                </Button>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-gray-400"
                              disabled={loadingSerials}
                              onClick={() => handleExpandProduct(product.id)}
                            >
                              <RefreshCw size={12} className={loadingSerials ? 'animate-spin' : ''} />
                            </Button>
                          </div>

                          {/* 가용 시리얼 테이블 */}
                          {loadingSerials ? (
                            <div className="py-4 text-center">
                              <Loader2 size={16} className="animate-spin text-gray-400 mx-auto" />
                            </div>
                          ) : availableSerials.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-4">가용 시리얼 없음</p>
                          ) : (
                            <div className="max-h-60 overflow-y-auto border rounded-lg">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-50 sticky top-0">
                                  <tr>
                                    <th className="w-8 px-2 py-1.5"></th>
                                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">#</th>
                                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">개별 바코드</th>
                                    {serialMode === 'strict' && (
                                      <th className="text-left px-2 py-1.5 font-medium text-gray-600">제조사 시리얼</th>
                                    )}
                                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">LOT</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {availableSerials.map((s) => {
                                    const isSelected = selectedSerials.has(s.id);
                                    return (
                                      <tr
                                        key={s.id}
                                        className={`border-t cursor-pointer hover:bg-blue-50/50 ${isSelected ? 'bg-blue-50' : ''}`}
                                        onClick={() => toggleSerial(s.id)}
                                      >
                                        <td className="px-2 py-1.5">
                                          <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={() => toggleSerial(s.id)}
                                          />
                                        </td>
                                        <td className="px-2 py-1.5 text-gray-500">{s.serial_number}</td>
                                        <td className="px-2 py-1.5 font-mono">{s.unit_barcode}</td>
                                        {serialMode === 'strict' && (
                                          <td className="px-2 py-1.5 font-mono text-gray-500">
                                            {s.manufacturer_serial ?? <span className="text-gray-300">-</span>}
                                          </td>
                                        )}
                                        <td className="px-2 py-1.5 text-gray-500">
                                          {(s.product_lots as unknown as { lot_number: string } | null)?.lot_number ?? '-'}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      ) : (
                        /* 직접 입력 모드 */
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500">
                            제조사 시리얼 또는 개별 바코드를 입력하세요 (줄바꿈 또는 쉼표로 구분)
                          </p>
                          <textarea
                            value={serialText}
                            onChange={(e) => setSerialText(e.target.value)}
                            placeholder={'SN-001\nSN-002\nSN-003'}
                            className="w-full h-32 border rounded-lg px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-gray-300"
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400">
                              {serialText.trim() ? `${serialText.split(/[\n,]+/).filter((l) => l.trim()).length}건 입력됨` : ''}
                            </span>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={isPending || !serialText.trim()}
                              onClick={() => handleTextAssign(product.id)}
                            >
                              <Check size={12} /> 배정
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 하단 요약 */}
        {/* NOTE: 위 본문 영역은 none/logistics/admin 3분기 */}
        <div className="flex items-center justify-between px-6 py-4 border-t shrink-0 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>레벨: <strong>{levelLabel[currentLevel()]}</strong></span>
            <span>
              배정: {assignedSerials.reduce((s, a) => s + a.quantity, 0)} /
              {orderItems.reduce((s, i) => s + i.quantity, 0)}개
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
