'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Trash2, CheckCircle2, AlertTriangle, Clock, PackageCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { deleteReceivingOrder, receiveItems } from '@/actions/receiving';
import ReceivingConfirmPanel from '../../receiving/ReceivingConfirmPanel';
import dayjs from 'dayjs';

interface ReceivingItem {
  id: string;
  product_id: string;
  expected_quantity: number;
  received_quantity: number;
  products: { id: string; name: string; barcode: string } | null;
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

interface Props {
  order: ReceivingOrder;
}

const statusConfig: Record<string, { label: string; variant: 'outline' | 'default' | 'secondary' | 'destructive' }> = {
  pending: { label: '대기', variant: 'outline' },
  in_progress: { label: '진행중', variant: 'default' },
  awaiting_confirmation: { label: '확인 대기', variant: 'secondary' },
  completed: { label: '완료', variant: 'secondary' },
  cancelled: { label: '취소', variant: 'destructive' },
};

export default function ReceivingOrderDetailClient({ order }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOrderId, setConfirmOrderId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const totalExpected = order.receiving_items.reduce((s, i) => s + i.expected_quantity, 0);
  const totalReceived = order.receiving_items.reduce((s, i) => s + i.received_quantity, 0);
  const progress = totalExpected > 0 ? (totalReceived / totalExpected) * 100 : 0;
  const isComplete = totalReceived >= totalExpected && totalExpected > 0;
  const cfg = statusConfig[order.status] ?? statusConfig.pending;

  // 입고 가능한 항목만 체크 가능
  const receivableItems = order.receiving_items.filter(
    (i) => i.received_quantity < i.expected_quantity,
  );
  const canReceive = ['pending', 'in_progress'].includes(order.status) && receivableItems.length > 0;

  function toggleCheck(itemId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleAll() {
    if (checked.size === receivableItems.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(receivableItems.map((i) => i.id)));
    }
  }

  function handleReceive() {
    if (checked.size === 0) { toast.error('입고할 품목을 선택하세요'); return; }
    const items = [...checked].map((id) => {
      const item = order.receiving_items.find((i) => i.id === id)!;
      const remaining = item.expected_quantity - item.received_quantity;
      return { receivingItemId: id, quantity: remaining };
    });
    const summary = items.length === 1
      ? `${order.receiving_items.find((i) => i.id === items[0].receivingItemId)?.products?.name} ${items[0].quantity}개`
      : `${items.length}개 품목`;
    if (!confirm(`${summary} 입고 처리하시겠습니까?`)) return;
    startTransition(async () => {
      const result = await receiveItems(order.id, items);
      if (result.error) toast.error(result.error);
      else {
        toast.success('입고 처리 완료');
        setChecked(new Set());
        router.refresh();
      }
    });
  }

  function handleDelete() {
    const msg = order.status === 'completed'
      ? '확정된 지시서를 취소하시겠습니까?\n시리얼이 삭제되고 재고가 복원됩니다.'
      : order.status === 'in_progress' || order.status === 'awaiting_confirmation'
        ? '이 입고지시서를 취소하시겠습니까?'
        : '이 입고지시서를 삭제하시겠습니까?';
    if (!confirm(msg)) return;
    startTransition(async () => {
      const result = await deleteReceivingOrder(order.id);
      if (result.error) toast.error(result.error);
      else {
        toast.success(order.status === 'in_progress' ? '취소 완료' : '삭제 완료');
        router.push('/receiving-orders');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => router.push('/receiving-orders')}>
          <ArrowLeft size={16} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
              {order.title ?? dayjs(order.created_at).format('MM.DD') + ' 입고'}
            </h1>
            <Badge variant={cfg.variant} className="shrink-0">{cfg.label}</Badge>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 truncate flex items-center gap-1">
            <Clock size={12} />
            {dayjs(order.created_at).format('YYYY.MM.DD HH:mm')}
            {order.completed_at && ` → ${dayjs(order.completed_at).format('MM.DD HH:mm')} 완료`}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {order.status === 'awaiting_confirmation' && (
            <Button size="sm" onClick={() => setConfirmOrderId(order.id)}>
              확정
            </Button>
          )}
          {['pending', 'in_progress', 'awaiting_confirmation'].includes(order.status) && (
            <Button variant="destructive" size="icon" className="h-8 w-8 sm:hidden" onClick={handleDelete} disabled={isPending}>
              <Trash2 size={14} />
            </Button>
          )}
          {['pending', 'in_progress', 'awaiting_confirmation'].includes(order.status) && (
            <Button variant="destructive" size="sm" className="hidden sm:inline-flex" onClick={handleDelete} disabled={isPending}>
              <Trash2 size={14} className="mr-1" />
              {order.status === 'pending' ? '삭제' : '취소'}
            </Button>
          )}
        </div>
      </div>

      {/* 메모 */}
      {order.memo && (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-2">{order.memo}</p>
      )}

      {/* 진행률 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">입고 진행률</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {order.receiving_items.length}종 / {totalExpected}개
            </span>
            <span className={`font-bold ${isComplete ? 'text-green-600' : 'text-gray-900'}`}>
              {totalReceived}/{totalExpected} ({Math.round(progress)}%)
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* 항목 테이블 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">입고 품목</CardTitle>
            {canReceive && checked.size > 0 && (
              <Button size="sm" onClick={handleReceive} disabled={isPending}>
                <PackageCheck size={14} className="mr-1" />
                선택 입고 ({checked.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-gray-50">
                <tr>
                  {canReceive && (
                    <th className="px-4 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={checked.size === receivableItems.length && receivableItems.length > 0}
                        onChange={toggleAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                  )}
                  <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">제품</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">바코드</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-500 text-xs">지시</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-500 text-xs">입고</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-500 text-xs w-16">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {order.receiving_items.map((item) => {
                  const done = item.received_quantity >= item.expected_quantity;
                  const over = item.received_quantity > item.expected_quantity;
                  const isReceivable = !done;
                  return (
                    <tr
                      key={item.id}
                      className={`${over ? 'bg-amber-50/50' : done ? 'bg-green-50/50' : ''} ${canReceive && isReceivable ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      onClick={() => canReceive && isReceivable && toggleCheck(item.id)}
                    >
                      {canReceive && (
                        <td className="px-4 py-2.5">
                          {isReceivable ? (
                            <input
                              type="checkbox"
                              checked={checked.has(item.id)}
                              onChange={() => toggleCheck(item.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-gray-300"
                            />
                          ) : (
                            <span />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-2.5 font-medium text-gray-900">{item.products?.name ?? '-'}</td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{item.products?.barcode ?? '-'}</td>
                      <td className="px-4 py-2.5 text-center text-gray-700">{item.expected_quantity}</td>
                      <td className={`px-4 py-2.5 text-center font-bold ${over ? 'text-amber-600' : done ? 'text-green-600' : 'text-gray-900'}`}>
                        {item.received_quantity}
                        {over && <span className="text-xs ml-1">+{item.received_quantity - item.expected_quantity}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {over
                          ? <AlertTriangle size={16} className="text-amber-500 mx-auto" />
                          : done
                            ? <CheckCircle2 size={16} className="text-green-500 mx-auto" />
                            : <span className="text-xs text-gray-400">미완료</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 확정 패널 */}
      {confirmOrderId && (
        <ReceivingConfirmPanel
          orderId={confirmOrderId}
          onClose={() => setConfirmOrderId(null)}
          onConfirmed={() => {
            setConfirmOrderId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
