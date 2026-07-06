'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Trash2, Plus, X, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { createReceivingOrder, deleteReceivingOrder } from '@/actions/receiving';
import dayjs from 'dayjs';

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
  confirmed_at?: string | null;
  receiving_items: ReceivingItem[];
}

interface Product {
  id: string;
  name: string;
  barcode: string;
  base_stock: number;
}

interface NewItem {
  product_id: string;
  expected_quantity: number;
}

interface Props {
  orders: ReceivingOrder[];
  products: Product[];
}

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'awaiting_confirmation' | 'completed' | 'cancelled';

const statusConfig: Record<string, { label: string; variant: 'outline' | 'default' | 'secondary' | 'destructive' }> = {
  pending: { label: '대기', variant: 'outline' },
  in_progress: { label: '진행중', variant: 'default' },
  awaiting_confirmation: { label: '확인대기', variant: 'secondary' },
  completed: { label: '완료', variant: 'secondary' },
  cancelled: { label: '취소', variant: 'destructive' },
};

export default function ReceivingOrdersClient({ orders, products }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // 생성 폼 상태
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((o) =>
        (o.title ?? '').toLowerCase().includes(q) ||
        o.receiving_items.some((i) => i.products?.name.toLowerCase().includes(q)),
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter((o) => o.status === statusFilter);
    }
    return result;
  }, [orders, search, statusFilter]);

  const emptyMessage = search || statusFilter !== 'all'
    ? '조건에 맞는 입고지시서가 없습니다'
    : '입고지시서가 없습니다';

  function addItem() {
    if (!selectedProductId) return;
    if (newItems.some((i) => i.product_id === selectedProductId)) {
      toast.error('이미 추가된 제품입니다');
      return;
    }
    setNewItems((prev) => [...prev, { product_id: selectedProductId, expected_quantity: 1 }]);
    setSelectedProductId('');
  }

  function removeItem(productId: string) {
    setNewItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

  function updateItemQty(productId: string, qty: number) {
    setNewItems((prev) =>
      prev.map((i) =>
        i.product_id === productId ? { ...i, expected_quantity: Math.max(1, qty) } : i,
      ),
    );
  }

  function resetForm() {
    setTitle('');
    setMemo('');
    setNewItems([]);
    setSelectedProductId('');
    setShowCreate(false);
  }

  function handleCreate() {
    if (!title.trim()) { toast.error('제목을 입력하세요'); return; }
    if (newItems.length === 0) { toast.error('입고 항목을 추가하세요'); return; }
    startTransition(async () => {
      const items = newItems.map((i) => ({
        product_id: i.product_id,
        expected_quantity: i.expected_quantity,
      }));
      const result = await createReceivingOrder(title, items, memo);
      if (result.error) toast.error(result.error);
      else { toast.success('입고지시서 생성 완료'); resetForm(); router.refresh(); }
    });
  }

  // 삭제/취소 — 확정 완료건은 재고까지 복원되므로 상태에 맞춰 경고 문구를 다르게 보여준다.
  function handleDelete(order: ReceivingOrder) {
    const isConfirmed = order.status === 'completed';
    const msg = isConfirmed
      ? `"${order.title ?? '입고지시서'}"를 취소하면 반영된 재고와 시리얼이 복원됩니다. 계속하시겠습니까?`
      : `"${order.title ?? '입고지시서'}"를 삭제하시겠습니까?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      const result = await deleteReceivingOrder(order.id);
      if (result.error) toast.error(result.error);
      else { toast.success(isConfirmed ? '취소 및 재고 복원 완료' : '삭제 완료'); router.refresh(); }
    });
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">입고 작업</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} className="mr-1" />
          새 입고지시서
        </Button>
      </div>

      {/* 생성 폼 */}
      {showCreate && (
        <div className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900">새 입고지시서 작성</h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">제목 *</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 3월 2차 입고"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
              <Input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="비고 사항"
              />
            </div>
          </div>

          {/* 제품 추가 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">입고 품목</label>
            <div className="flex gap-2">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">제품 선택...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.barcode})
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                onClick={addItem}
                disabled={!selectedProductId}
              >
                추가
              </Button>
            </div>
          </div>

          {/* 추가된 항목 목록 */}
          {newItems.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">제품</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">바코드</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600 w-32">수량</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {newItems.map((item) => {
                    const product = productMap.get(item.product_id);
                    return (
                      <tr key={item.product_id}>
                        <td className="px-4 py-2 font-medium">{product?.name ?? '-'}</td>
                        <td className="px-4 py-2 text-gray-500 font-mono text-xs">{product?.barcode ?? '-'}</td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="number"
                            min={1}
                            value={item.expected_quantity}
                            onChange={(e) => updateItemQty(item.product_id, parseInt(e.target.value, 10) || 1)}
                            className="w-20 border rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button onClick={() => removeItem(item.product_id)} className="text-red-400 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={resetForm}>
              취소
            </Button>
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending && <Loader2 size={14} className="animate-spin mr-1" />}
              생성
            </Button>
          </div>
        </div>
      )}

      {/* 검색 및 필터 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제목 또는 제품명 검색"
            className="h-9 pl-9"
          />
        </div>
        <div className="flex rounded-md border overflow-hidden shrink-0">
          {([['all', '전체'], ['pending', '대기'], ['in_progress', '진행'], ['awaiting_confirmation', '확인'], ['completed', '완료'], ['cancelled', '취소']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-2.5 py-2 text-xs font-medium transition-colors border-l first:border-l-0 ${
                statusFilter === key ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 카드 목록 */}
      {filteredOrders.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center text-sm text-gray-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredOrders.map((order) => {
            const cfg = statusConfig[order.status] ?? statusConfig.pending;
            const totalExpected = order.receiving_items.reduce((s, i) => s + i.expected_quantity, 0);
            const totalReceived = order.receiving_items.reduce((s, i) => s + i.received_quantity, 0);
            const pct = totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0;
            const title = order.title ?? dayjs(order.created_at).format('MM.DD') + ' 입고';
            const itemCount = order.receiving_items.length;
            const totalItems = order.receiving_items.reduce((s, i) => s + i.expected_quantity, 0);

            return (
              <div
                key={order.id}
                onClick={() => router.push(`/receiving-orders/${order.id}`)}
                className="rounded-lg border bg-white p-4 space-y-3 cursor-pointer hover:shadow-md transition-shadow"
              >
                {/* 헤더: 제목 + 상태 + 삭제 */}
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
                      <Badge variant={cfg.variant} className="shrink-0">{cfg.label}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {dayjs(order.created_at).format('YYYY.MM.DD HH:mm')}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(order);
                    }}
                    disabled={isPending}
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors shrink-0 disabled:opacity-40"
                    title={order.status === 'completed' ? '취소 (재고 복원)' : '삭제'}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* 요약 */}
                <p className="text-sm text-gray-500">
                  {itemCount}종 / {totalItems}개
                </p>

                {/* 진행률 바 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-gray-900 h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 ml-2 shrink-0 tabular-nums">
                      {totalReceived}/{totalExpected} ({pct}%)
                    </span>
                  </div>
                </div>

                {/* 품목 테이블 */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b">
                      <th className="text-left py-1 font-medium">제품</th>
                      <th className="text-left py-1 font-medium">바코드</th>
                      <th className="text-center py-1 font-medium">지시</th>
                      <th className="text-center py-1 font-medium">입고</th>
                      <th className="text-center py-1 font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.receiving_items.map((item) => {
                      const done = item.received_quantity >= item.expected_quantity;
                      return (
                        <tr key={item.id} className="border-b last:border-b-0">
                          <td className="py-1.5 text-gray-900">{item.products?.name ?? '-'}</td>
                          <td className="py-1.5 text-gray-600 font-mono text-xs">{item.products?.barcode ?? '-'}</td>
                          <td className="py-1.5 text-center text-gray-600">{item.expected_quantity}</td>
                          <td className="py-1.5 text-center text-gray-900 font-medium">{item.received_quantity}</td>
                          <td className="py-1.5 text-center text-xs">
                            {done
                              ? <span className="text-green-600">완료</span>
                              : <span className="text-gray-400">미완료</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
