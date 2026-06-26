'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus, Trash2, CheckCircle2, X, PackageOpen, Clock, Loader2,
  AlertTriangle, Inbox, ArrowRight, Wand2,
} from 'lucide-react';
import {
  createReceivingOrder, deleteReceivingOrder,
  matchStagingToReceivingItem, autoMatchStaging,
} from '@/actions/receiving';
import dayjs from 'dayjs';
import ReceivingConfirmPanel from './ReceivingConfirmPanel';

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

interface Product {
  id: string;
  name: string;
  barcode: string;
  base_stock: number;
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
  products: Product[];
  stagingItems: StagingItem[];
}

// ── 신규 항목 (로컬) ──
interface NewItem {
  product_id: string;
  expected_quantity: number;
}

export default function ReceivingClient({ orders, products, stagingItems }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 생성 모달
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');

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
    setNewItems((prev) => prev.map((i) =>
      i.product_id === productId ? { ...i, expected_quantity: Math.max(1, qty) } : i,
    ));
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

  function handleDelete(id: string, status: string) {
    const msg = status === 'completed'
      ? '확정된 지시서를 취소하시겠습니까?\n시리얼이 삭제되고 재고가 복원됩니다.'
      : status === 'in_progress' || status === 'awaiting_confirmation'
        ? '이 입고지시서를 취소하시겠습니까?'
        : '이 입고지시서를 삭제하시겠습니까?';
    if (!confirm(msg)) return;
    startTransition(async () => {
      const result = await deleteReceivingOrder(id);
      if (result.error) toast.error(result.error);
      else { toast.success(status === 'in_progress' ? '취소 완료' : '삭제 완료'); router.refresh(); }
    });
  }

  // 확정 패널
  const [confirmOrderId, setConfirmOrderId] = useState<string | null>(null);

  const statusLabel: Record<string, { text: string; color: string }> = {
    pending: { text: '대기', color: 'bg-gray-100 text-gray-600' },
    in_progress: { text: '진행 중', color: 'bg-blue-50 text-blue-700' },
    awaiting_confirmation: { text: '확인 대기', color: 'bg-amber-50 text-amber-700' },
    completed: { text: '완료', color: 'bg-green-50 text-green-700' },
    cancelled: { text: '취소', color: 'bg-red-50 text-red-600' },
  };

  // 매칭용: 스테이징 항목을 입고지시서 항목에 수동 매칭
  const [matchingStaging, setMatchingStaging] = useState<StagingItem | null>(null);

  function handleMatch(stagingId: string, receivingItemId: string) {
    if (!confirm('이 스테이징 항목을 선택한 입고지시서 항목에 매칭하시겠습니까?')) return;
    startTransition(async () => {
      const result = await matchStagingToReceivingItem(stagingId, receivingItemId);
      if (result.error) toast.error(result.error);
      else {
        toast.success('매칭 완료');
        setMatchingStaging(null);
        router.refresh();
      }
    });
  }

  function handleAutoMatch() {
    if (!confirm('미매칭 스테이징을 자동으로 입고지시서에 매칭합니다.\n같은 제품의 미완료 항목에 오래된 순으로 배정됩니다.')) return;
    startTransition(async () => {
      const result = await autoMatchStaging();
      if (result.error) toast.error(result.error);
      else {
        toast.success(`${result.matchedCount}/${result.total}건 자동 매칭`);
        router.refresh();
      }
    });
  }

  // 매칭 후보: 선택한 스테이징과 같은 제품의 미완료 지시서 항목
  const matchCandidates = matchingStaging
    ? orders
        .filter((o) => o.status === 'pending' || o.status === 'in_progress')
        .flatMap((o) =>
          o.receiving_items
            .filter((item) => item.product_id === matchingStaging.product_id)
            .map((item) => ({ ...item, orderTitle: o.title ?? dayjs(o.created_at).format('MM.DD') + ' 입고' })),
        )
    : [];

  // 제품 ID → 이름 맵
  const productMap = new Map(products.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">입고지시서</h1>
          <p className="text-sm text-gray-500">입고 지시를 생성하면 물류팀에서 처리합니다</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} />
          새 입고지시서
        </button>
      </div>

      {/* 생성 폼 */}
      {showCreate && (
        <div className="bg-white border rounded-xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900">새 입고지시서 작성</h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">제목 *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 3월 2차 입고"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="비고 사항"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
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
              <button
                type="button"
                onClick={addItem}
                disabled={!selectedProductId}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-40 transition-colors"
              >
                추가
              </button>
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
                          <button
                            onClick={() => removeItem(item.product_id)}
                            className="text-red-400 hover:text-red-600"
                          >
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
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending}
              className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              생성
            </button>
          </div>
        </div>
      )}

      {/* ── 스테이징 (미매칭 입고) ── */}
      {stagingItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Inbox size={18} className="text-amber-600" />
              <h2 className="font-bold text-amber-900">
                미매칭 스테이징 ({stagingItems.length}건)
              </h2>
            </div>
            <button
              type="button"
              onClick={handleAutoMatch}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              <Wand2 size={14} />
              자동 매칭
            </button>
          </div>
          <p className="text-xs text-amber-700">
            물류팀이 스캔했으나 아직 입고지시서와 매칭되지 않은 항목입니다
          </p>

          <div className="border border-amber-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-amber-100/50">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium text-amber-800 text-xs">제품</th>
                  <th className="text-left px-3 py-1.5 font-medium text-amber-800 text-xs">바코드</th>
                  <th className="text-center px-3 py-1.5 font-medium text-amber-800 text-xs">수량</th>
                  <th className="text-center px-3 py-1.5 font-medium text-amber-800 text-xs">시각</th>
                  <th className="text-center px-3 py-1.5 font-medium text-amber-800 text-xs w-24">매칭</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {stagingItems.map((item) => {
                  const isTemp = item.products?.is_temporary;
                  return (
                    <tr key={item.id} className={isTemp ? 'bg-amber-50' : ''}>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {isTemp && <AlertTriangle size={12} className="inline text-amber-500 mr-1" />}
                        {item.products?.name ?? '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-500 font-mono text-xs">{item.scanned_barcode}</td>
                      <td className="px-3 py-2 text-center text-gray-700 font-bold">{item.quantity}</td>
                      <td className="px-3 py-2 text-center text-gray-500 text-xs">{dayjs(item.created_at).format('MM.DD HH:mm')}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setMatchingStaging(item)}
                          className="px-2 py-1 bg-amber-600 text-white text-xs font-bold rounded hover:bg-amber-700"
                        >
                          매칭
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 수동 매칭 모달 */}
          {matchingStaging && (
            <div className="bg-white border border-amber-300 rounded-xl p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 text-sm">
                  매칭 대상: {matchingStaging.products?.name} × {matchingStaging.quantity}개
                </h3>
                <button onClick={() => setMatchingStaging(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>

              {matchCandidates.length === 0 ? (
                <p className="text-sm text-gray-500">해당 제품이 포함된 미완료 입고지시서가 없습니다</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">매칭할 입고지시서 항목을 선택하세요:</p>
                  {matchCandidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleMatch(matchingStaging.id, c.id)}
                      disabled={isPending}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors disabled:opacity-50"
                    >
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-900">{c.orderTitle}</p>
                        <p className="text-xs text-gray-500">
                          {c.products?.name} — {c.received_quantity}/{c.expected_quantity} 입고됨
                        </p>
                      </div>
                      <ArrowRight size={16} className="text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 지시서 목록 */}
      {orders.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <PackageOpen size={48} className="mx-auto mb-3 opacity-30" />
          <p>입고지시서가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const st = statusLabel[order.status] ?? statusLabel.pending;
            const totalExpected = order.receiving_items.reduce((s, i) => s + i.expected_quantity, 0);
            const totalReceived = order.receiving_items.reduce((s, i) => s + i.received_quantity, 0);
            const progress = totalExpected > 0 ? (totalReceived / totalExpected) * 100 : 0;
            const isComplete = totalReceived >= totalExpected && totalExpected > 0;

            return (
              <div key={order.id} className="bg-white border rounded-xl p-5 space-y-3">
                {/* 상단: 제목 + 상태 */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900">
                        {order.title ?? dayjs(order.created_at).format('MM.DD') + ' 입고'}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>
                        {st.text}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                      <Clock size={12} />
                      {dayjs(order.created_at).format('YYYY.MM.DD HH:mm')}
                      {order.completed_at && ` → ${dayjs(order.completed_at).format('MM.DD HH:mm')} 완료`}
                    </p>
                    {order.memo && (
                      <p className="text-xs text-gray-400 mt-1">{order.memo}</p>
                    )}
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex items-center gap-1">
                    {order.status === 'awaiting_confirmation' && (
                      <button
                        type="button"
                        onClick={() => setConfirmOrderId(order.id)}
                        className="px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700"
                      >
                        확정
                      </button>
                    )}
                    {['pending', 'in_progress', 'awaiting_confirmation'].includes(order.status) && (
                      <button
                        type="button"
                        onClick={() => handleDelete(order.id, order.status)}
                        disabled={isPending}
                        className="text-red-400 hover:text-red-600 p-1.5"
                        title={order.status === 'pending' ? '삭제' : '취소'}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* 진행률 바 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">
                      {order.receiving_items.length}종 / {totalExpected}개
                    </span>
                    <span className={`font-bold ${isComplete ? 'text-green-600' : 'text-gray-900'}`}>
                      {totalReceived}/{totalExpected} ({Math.round(progress)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.min(100, progress)}%` }}
                    />
                  </div>
                </div>

                {/* 항목 테이블 */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500 text-xs">제품</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500 text-xs">바코드</th>
                        <th className="text-center px-3 py-1.5 font-medium text-gray-500 text-xs">지시</th>
                        <th className="text-center px-3 py-1.5 font-medium text-gray-500 text-xs">입고</th>
                        <th className="text-center px-3 py-1.5 font-medium text-gray-500 text-xs w-16">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {order.receiving_items.map((item) => {
                        const done = item.received_quantity >= item.expected_quantity;
                        const over = item.received_quantity > item.expected_quantity;
                        return (
                          <tr key={item.id} className={over ? 'bg-amber-50/50' : done ? 'bg-green-50/50' : ''}>
                            <td className="px-3 py-2 font-medium text-gray-900">{item.products?.name ?? '-'}</td>
                            <td className="px-3 py-2 text-gray-500 font-mono text-xs">{item.products?.barcode ?? '-'}</td>
                            <td className="px-3 py-2 text-center text-gray-700">{item.expected_quantity}</td>
                            <td className={`px-3 py-2 text-center font-bold ${over ? 'text-amber-600' : done ? 'text-green-600' : 'text-gray-900'}`}>
                              {item.received_quantity}
                              {over && <span className="text-xs ml-1">+{item.received_quantity - item.expected_quantity}</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
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
              </div>
            );
          })}
        </div>
      )}

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
