'use client';

import { useState, useMemo, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileDown, CheckCircle, Check, XCircle, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { confirmOrder, cancelOrder } from '@/actions/orders';
import dayjs from 'dayjs';

type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'packed' | 'completed' | 'cancelled';

interface QuotationItem {
  product_id: string | null;
  label: string | null;
  quantity: number;
  unit_price: number;
  is_taxable: boolean;
}
interface Quotation { id: string; number: string; status: string; quotation_items: QuotationItem[]; }
interface OrderItem { quantity: number; unit_price: number; products: { name: string } | null; }
interface Order {
  id: string;
  order_number: string | null;
  status: OrderStatus;
  created_at: string;
  order_items: OrderItem[];
  quotations: Quotation[] | null;
}

interface Props { orders: Order[]; }

const statusLabel: Record<OrderStatus, string> = {
  pending: '견적 대기',
  confirmed: '견적 확정',
  shipped: '출고지시',
  packed: '집하완료',
  completed: '출하완료',
  cancelled: '취소',
};
const statusVariant: Record<OrderStatus, 'outline' | 'default' | 'secondary' | 'destructive'> = {
  pending: 'outline',
  confirmed: 'default',
  shipped: 'secondary',
  packed: 'secondary',
  completed: 'secondary',
  cancelled: 'destructive',
};

const PROGRESS_STEPS = [
  { key: 'pending', label: '견적 대기' },
  { key: 'confirmed', label: '견적 확정' },
  { key: 'shipped', label: '집하 시작' },
  { key: 'completed', label: '출하 완료' },
] as const;

function getProgressIndex(status: OrderStatus): number {
  if (status === 'cancelled') return -1;
  const map: Record<string, number> = { pending: 0, confirmed: 1, shipped: 2, packed: 2, completed: 3 };
  return map[status] ?? 0;
}

function OrderProgress({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') {
    return <p className="text-xs text-red-500 font-medium mt-2">주문이 취소되었습니다</p>;
  }
  const current = getProgressIndex(status);
  const isPacked = status === 'packed';

  return (
    <div className="flex items-center gap-0 mt-3">
      {PROGRESS_STEPS.map((step, i) => {
        const done = i <= current;
        const isActive = i === current;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  done
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-400'
                } ${isActive ? 'ring-2 ring-blue-200' : ''}`}
              >
                {done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </div>
              <span className={`text-[10px] mt-1 whitespace-nowrap ${done ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                {i === 2 && isPacked ? '집하완료' : step.label}
              </span>
            </div>
            {i < PROGRESS_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${i < current ? 'bg-blue-600' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

type StatusFilter = 'all' | 'in_progress' | 'completed' | 'cancelled';

export default function OrdersClient({ orders }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // 기본: 진행중인 발주만 펼침
    const ids = new Set<string>();
    for (const o of orders) {
      if (!['completed', 'cancelled'].includes(o.status)) ids.add(o.id);
    }
    return ids;
  });

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return orders;
    if (statusFilter === 'in_progress') return orders.filter((o) => !['completed', 'cancelled'].includes(o.status));
    if (statusFilter === 'completed') return orders.filter((o) => o.status === 'completed');
    return orders.filter((o) => o.status === 'cancelled');
  }, [orders, statusFilter]);

  const allExpanded = filteredOrders.length > 0 && filteredOrders.every((o) => expandedIds.has(o.id));

  const toggleAll = useCallback(() => {
    if (allExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(filteredOrders.map((o) => o.id)));
    }
  }, [allExpanded, filteredOrders]);

  const toggleOrder = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function handleConfirm(orderId: string) {
    startTransition(async () => {
      const result = await confirmOrder(orderId);
      if (result.error) toast.error(result.error);
      else { toast.success('발주가 확정되었습니다'); router.refresh(); }
    });
  }

  function handleCancel(orderId: string) {
    if (!confirm('이 발주를 취소하시겠습니까?')) return;
    startTransition(async () => {
      const result = await cancelOrder(orderId);
      if (result.error) toast.error(result.error);
      else { toast.success('발주가 취소되었습니다'); router.refresh(); }
    });
  }

  return (
    <div className="space-y-3">
      {/* 상태 필터 + 전체 접기/펼치기 */}
      <div className="flex gap-2">
        <div className="flex flex-1 rounded-md border overflow-hidden">
          {([['all', '전체'], ['in_progress', '진행중'], ['completed', '완료'], ['cancelled', '취소']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-l first:border-l-0 ${
                statusFilter === key ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={toggleAll}
          className="flex items-center gap-1 px-3 py-2 rounded-md border text-xs text-gray-500 hover:bg-gray-50 bg-white whitespace-nowrap"
        >
          <ChevronsUpDown size={14} />
          {allExpanded ? '접기' : '펼치기'}
        </button>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {statusFilter === 'all' ? '발주 내역이 없습니다' : '해당 상태의 발주가 없습니다'}
        </div>
      ) : filteredOrders.map((order) => {
        const orderTotal = order.order_items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
        const quotations = Array.isArray(order.quotations) ? order.quotations : [];
        const quotation = quotations.length > 0
          ? quotations.reduce((a, b) => (a.number > b.number ? a : b))
          : null;
        const hasQuotation = !!quotation;

        let displayTotal: number;
        let extraItems: QuotationItem[] = [];
        if (hasQuotation && quotation.quotation_items.length > 0) {
          const qItems = quotation.quotation_items;
          const supplyAmount = qItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
          const taxableAmount = qItems
            .filter((i) => i.is_taxable !== false)
            .reduce((s, i) => s + i.quantity * i.unit_price, 0);
          displayTotal = supplyAmount + Math.round(taxableAmount * 0.1);
          extraItems = qItems.filter((i) => !i.product_id);
        } else {
          displayTotal = Math.round(orderTotal * 1.1);
        }

        const expanded = expandedIds.has(order.id);

        return (
          <div key={order.id} className="rounded-lg border bg-white overflow-hidden">
            {/* 헤더 (항상 보임, 클릭으로 토글) */}
            <button
              onClick={() => toggleOrder(order.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3 text-left">
                <ChevronDown
                  size={16}
                  className={`text-gray-400 transition-transform ${expanded ? '' : '-rotate-90'}`}
                />
                <div>
                  <p className="font-mono text-sm text-gray-500">{order.order_number ?? `#${order.id.slice(0, 8).toUpperCase()}`}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {dayjs(order.created_at).format('YYYY-MM-DD HH:mm')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {hasQuotation && order.status === 'pending' && (
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                        견적서 도착
                      </span>
                    )}
                    <Badge variant={statusVariant[order.status]}>
                      {statusLabel[order.status]}
                    </Badge>
                  </div>
                  <p className="text-base font-bold mt-0.5">₩{displayTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  {extraItems.length > 0 && (
                    <p className="text-[10px] text-gray-400">기타비용/할인 포함</p>
                  )}
                </div>
              </div>
            </button>

            {/* 상세 (접힘/펼침) */}
            {expanded && (
              <div className="px-4 pb-4">
                {/* 품목 목록 */}
                <div className="border-t pt-3 space-y-1">
                  {order.order_items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm text-gray-600">
                      <span>{item.products?.name ?? '-'} × {item.quantity}</span>
                      <span>₩{(item.quantity * item.unit_price).toLocaleString()}</span>
                    </div>
                  ))}
                  {extraItems.map((item, i) => (
                    <div key={`extra-${i}`} className={`flex justify-between text-sm ${item.unit_price < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                      <span>{item.label ?? '기타'}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</span>
                      <span>{item.unit_price < 0 ? '-' : ''}₩{Math.abs(item.quantity * item.unit_price).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                {/* 진행 상태 */}
                <OrderProgress status={order.status} />

                {/* 액션 영역 */}
                {(hasQuotation || order.status === 'pending') && (
                  <div className="mt-3 pt-3 border-t flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      {hasQuotation && (
                        <>견적번호 <span className="font-mono font-medium text-gray-700">{quotation!.number}</span></>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {hasQuotation && (
                        <a
                          href={`/api/quotations/${quotation!.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button size="sm" variant="outline" className="h-8 text-xs">
                            <FileDown size={14} /> PDF
                          </Button>
                        </a>
                      )}
                      {order.status === 'pending' && hasQuotation && (
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          disabled={isPending}
                          onClick={() => handleConfirm(order.id)}
                        >
                          <CheckCircle size={14} /> 발주 확정
                        </Button>
                      )}
                      {order.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-xs"
                          disabled={isPending}
                          onClick={() => handleCancel(order.id)}
                        >
                          <XCircle size={14} /> 취소
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
