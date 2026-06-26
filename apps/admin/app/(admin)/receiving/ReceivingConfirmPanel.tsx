'use client';

import { useState, useTransition, useEffect } from 'react';
import { toast } from 'sonner';
import {
  X, Loader2, Plus, Trash2, CheckCircle2, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  getReceivingOrderDetail, confirmReceivingOrder,
} from '@/actions/receiving';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import WarehouseLocationPicker from '@/components/WarehouseLocationPicker';
import dayjs from 'dayjs';

// ── 타입 ──

interface ReceivingItemDetail {
  id: string;
  product_id: string;
  expected_quantity: number;
  received_quantity: number;
  products: { id: string; name: string; barcode: string } | null;
}

interface OrderDetail {
  id: string;
  title: string | null;
  status: string;
  memo: string | null;
  created_at: string;
  completed_at: string | null;
  receiving_items: ReceivingItemDetail[];
}

// 항목별 확정 폼 데이터
interface ItemConfirmData {
  receiving_item_id: string;
  product_id: string;
  productName: string;
  receivedQty: number;
  lots: { quantity: number; manufactured_at: string }[];
  serialText: string; // textarea 원본 (줄바꿈 구분)
}

interface Props {
  orderId: string;
  onClose: () => void;
  onConfirmed: () => void;
}

export default function ReceivingConfirmPanel({ orderId, onClose, onConfirmed }: Props) {
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [itemForms, setItemForms] = useState<ItemConfirmData[]>([]);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [generateUnitBarcode, setGenerateUnitBarcode] = useState(false);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);

  // 데이터 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getReceivingOrderDetail(orderId);
        if (cancelled) return;
        const detail = data as unknown as OrderDetail;
        setOrder(detail);

        // 항목별 폼 초기화
        const forms: ItemConfirmData[] = detail.receiving_items
          .filter((item) => item.received_quantity > 0)
          .map((item) => {
            const product = item.products as unknown as { id: string; name: string; barcode: string } | null;
            return {
              receiving_item_id: item.id,
              product_id: item.product_id,
              productName: product?.name ?? '-',
              receivedQty: item.received_quantity,
              lots: [{ quantity: item.received_quantity, manufactured_at: dayjs().format('YYYY-MM-DD') }],
              serialText: '',
            };
          });
        setItemForms(forms);
        if (forms.length > 0) setExpandedItem(forms[0].receiving_item_id);
      } catch (err) {
        toast.error('입고지시서 조회 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  // LOT 그룹 추가
  function addLot(itemId: string) {
    setItemForms((prev) => prev.map((f) => {
      if (f.receiving_item_id !== itemId) return f;
      return { ...f, lots: [...f.lots, { quantity: 1, manufactured_at: dayjs().format('YYYY-MM-DD') }] };
    }));
  }

  // LOT 그룹 삭제
  function removeLot(itemId: string, lotIdx: number) {
    setItemForms((prev) => prev.map((f) => {
      if (f.receiving_item_id !== itemId) return f;
      return { ...f, lots: f.lots.filter((_, i) => i !== lotIdx) };
    }));
  }

  // LOT 수량 변경
  function updateLotQty(itemId: string, lotIdx: number, qty: number) {
    setItemForms((prev) => prev.map((f) => {
      if (f.receiving_item_id !== itemId) return f;
      const lots = f.lots.map((l, i) => i === lotIdx ? { ...l, quantity: Math.max(1, qty) } : l);
      return { ...f, lots };
    }));
  }

  // LOT 제조일 변경
  function updateLotDate(itemId: string, lotIdx: number, date: string) {
    setItemForms((prev) => prev.map((f) => {
      if (f.receiving_item_id !== itemId) return f;
      const lots = f.lots.map((l, i) => i === lotIdx ? { ...l, manufactured_at: date } : l);
      return { ...f, lots };
    }));
  }

  // 시리얼 텍스트 변경
  function updateSerialText(itemId: string, text: string) {
    setItemForms((prev) => prev.map((f) =>
      f.receiving_item_id === itemId ? { ...f, serialText: text } : f,
    ));
  }

  // 시리얼 파싱 (줄바꿈 구분)
  function parseSerials(text: string): string[] {
    return text
      .split(/[\r\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  // 검증 — 시리얼은 경고만 (LOT/제조일은 필수)
  function validate(): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const f of itemForms) {
      const serials = parseSerials(f.serialText);

      // 시리얼 개수 체크 — 경고 (블로커 아님)
      if (serials.length === 0) {
        warnings.push(`${f.productName}: 시리얼을 입력하지 않았습니다.`);
      } else if (serials.length < f.receivedQty) {
        warnings.push(`${f.productName}: 시리얼 개수가 모자랍니다. (${serials.length}/${f.receivedQty}개)`);
      } else if (serials.length > f.receivedQty) {
        warnings.push(`${f.productName}: 시리얼 초과 — 입고 수량(${f.receivedQty}개)만 적용되고 나머지는 무시됩니다.`);
      }

      // 중복 시리얼 체크
      if (serials.length > 0) {
        const unique = new Set(serials);
        if (unique.size !== serials.length) {
          errors.push(`${f.productName}: 중복된 시리얼이 있습니다.`);
        }
      }

      // LOT 수량 합 체크 — 필수
      const lotTotal = f.lots.reduce((s, l) => s + l.quantity, 0);
      if (lotTotal !== f.receivedQty) {
        errors.push(`${f.productName}: LOT 수량 합(${lotTotal})이 입고 수량(${f.receivedQty})과 다릅니다.`);
      }

      // LOT 제조일 체크 — 필수
      for (const lot of f.lots) {
        if (!lot.manufactured_at) {
          errors.push(`${f.productName}: LOT 제조일을 입력하세요.`);
          break;
        }
      }
    }

    return { errors, warnings };
  }

  // 확정 처리
  function handleConfirm() {
    const { errors, warnings } = validate();

    // 필수 에러는 블로커
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    // 시리얼 경고가 있으면 전부 확인 필요
    if (warnings.length > 0) {
      const msg = warnings.join('\n') + '\n\n그래도 확정하시겠습니까?';
      if (!confirm(msg)) return;
    } else {
      if (!confirm('입고를 확정하시겠습니까?\n시리얼 생성 + LOT 지정 + 재고 반영이 진행됩니다.')) return;
    }

    startTransition(async () => {
      const confirmItems = itemForms.map((f) => {
        const serials = parseSerials(f.serialText);
        return {
          receiving_item_id: f.receiving_item_id,
          product_id: f.product_id,
          lots: f.lots,
          // 초과분 잘라냄
          manufacturer_serials: serials.slice(0, f.receivedQty),
        };
      });

      const result = await confirmReceivingOrder(orderId, confirmItems, {
        generateUnitBarcode,
        warehouse_id: warehouseId,
        location_id: locationId,
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        if (result.partial) {
          toast.success(`부분 입고 확정 (${result.totalReceived}/${result.totalExpected})`);
          toast.info('미입고분 → 잔여 지시서 자동 생성됨');
        } else {
          toast.success('입고 확정 완료');
        }
        onConfirmed();
      }
    });
  }

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

  if (!order) {
    return (
      <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8">
          <p className="text-sm text-red-500">입고지시서를 찾을 수 없습니다</p>
          <button onClick={onClose} className="mt-3 text-sm text-gray-500 hover:text-gray-700">닫기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-t-2xl sm:rounded-2xl flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">
              입고 확정: {order.title ?? dayjs(order.created_at).format('MM.DD') + ' 입고'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              시리얼 입력 + LOT 지정 → 확정 시 재고 반영
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {itemForms.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">입고된 항목이 없습니다</p>
          ) : (
            itemForms.map((form) => {
              const isExpanded = expandedItem === form.receiving_item_id;
              const serials = parseSerials(form.serialText);
              const serialOk = serials.length === form.receivedQty;
              const serialOver = serials.length > form.receivedQty;
              const serialNone = serials.length === 0;
              const serialColor = serialOk
                ? 'bg-green-100 text-green-700'
                : serialOver
                  ? 'bg-amber-100 text-amber-700'
                  : serialNone
                    ? 'bg-gray-100 text-gray-500'
                    : 'bg-red-100 text-red-700';
              const lotTotal = form.lots.reduce((s, l) => s + l.quantity, 0);
              const lotOk = lotTotal === form.receivedQty && form.lots.every((l) => l.manufactured_at);

              return (
                <div key={form.receiving_item_id} className="border rounded-xl overflow-hidden">
                  {/* 항목 헤더 */}
                  <button
                    type="button"
                    onClick={() => setExpandedItem(isExpanded ? null : form.receiving_item_id)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">{form.productName}</span>
                      <span className="text-sm text-gray-500">입고: {form.receivedQty}개</span>
                      {serialOk && lotOk && (
                        <CheckCircle2 size={16} className="text-green-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {serialOver ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`text-xs px-2 py-0.5 rounded-full cursor-help ${serialColor}`}>
                              시리얼 {serials.length}/{form.receivedQty} (초과)
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            입고 수량만큼만 적용되며 초과된 시리얼은 무시됩니다
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${serialColor}`}>
                          시리얼 {serials.length}/{form.receivedQty}
                          {serialNone && ' (미입력)'}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${lotOk ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        LOT {form.lots.length}건
                      </span>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>

                  {/* 확장 폼 */}
                  {isExpanded && (
                    <div className="px-4 py-4 space-y-4">
                      {/* LOT 그룹 */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">LOT 그룹</label>
                          <button
                            type="button"
                            onClick={() => addLot(form.receiving_item_id)}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                          >
                            <Plus size={12} /> 그룹 추가
                          </button>
                        </div>
                        <div className="space-y-2">
                          {form.lots.map((lot, lotIdx) => (
                            <div key={lotIdx} className="flex items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                value={lot.quantity}
                                onChange={(e) => updateLotQty(form.receiving_item_id, lotIdx, parseInt(e.target.value, 10) || 1)}
                                className="w-20 border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
                                placeholder="수량"
                              />
                              <span className="text-xs text-gray-400">개</span>
                              <input
                                type="date"
                                value={lot.manufactured_at}
                                onChange={(e) => updateLotDate(form.receiving_item_id, lotIdx, e.target.value)}
                                className="flex-1 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                              />
                              {lot.manufactured_at && (
                                <span className="text-xs text-gray-400 font-mono whitespace-nowrap">
                                  LOT-{dayjs(lot.manufactured_at).format('YYMMDD')}
                                </span>
                              )}
                              {form.lots.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeLot(form.receiving_item_id, lotIdx)}
                                  className="text-red-400 hover:text-red-600 shrink-0"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        {lotTotal !== form.receivedQty && (
                          <p className="text-xs text-red-500 mt-1">
                            LOT 수량 합: {lotTotal} (필요: {form.receivedQty})
                          </p>
                        )}
                      </div>

                      {/* 시리얼 입력 */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">
                            제조사 시리얼 (줄바꿈 구분)
                          </label>
                          <span className={`text-xs font-medium ${
                            serialOk ? 'text-green-600' : serialOver ? 'text-amber-600' : serialNone ? 'text-gray-400' : 'text-red-600'
                          }`}>
                            {serials.length} / {form.receivedQty}
                            {serialOver && ` (+${serials.length - form.receivedQty} 초과)`}
                          </span>
                        </div>
                        <textarea
                          value={form.serialText}
                          onChange={(e) => updateSerialText(form.receiving_item_id, e.target.value)}
                          placeholder={`시리얼 번호를 한 줄에 하나씩 입력하세요\n예:\nSN-001\nSN-002\nSN-003`}
                          rows={Math.min(8, Math.max(3, form.receivedQty))}
                          className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 resize-y"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 하단 옵션 + 버튼 */}
        <div className="px-6 py-4 border-t shrink-0 bg-gray-50 rounded-b-2xl space-y-3">
          <WarehouseLocationPicker
            warehouseId={warehouseId}
            locationId={locationId}
            onWarehouseChange={setWarehouseId}
            onLocationChange={setLocationId}
            horizontal
            compact
          />
          <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-gray-500">
              {itemForms.length}개 상품 / 총 {itemForms.reduce((s, f) => s + f.receivedQty, 0)}개
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={generateUnitBarcode}
                onChange={(e) => setGenerateUnitBarcode(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 accent-gray-900"
              />
              <span className="text-xs text-gray-600">개별 바코드 생성</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              확정
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
