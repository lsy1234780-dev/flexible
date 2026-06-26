'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, X, Search } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import dayjs from 'dayjs';
import type { OrderStatus } from '@/types/database';

interface OrderItem { quantity: number; unit_price: number; products: { name: string } | null; }
interface Order {
  id: string;
  order_number: string | null;
  status: OrderStatus;
  created_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  companies: { id: string; name: string } | null;
  order_items: OrderItem[];
}

interface ProductRef { id: string; name: string; }

interface Props {
  orders: Order[];
  products: ProductRef[];
  initialProductFilter: string[];
}

const statusLabel: Record<OrderStatus, string> = {
  pending: '접수',
  confirmed: '확정',
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

type OStatusFilter = 'all' | OrderStatus;

export default function OrdersClient({ orders, products, initialProductFilter }: Props) {
  const router = useRouter();
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set(initialProductFilter));
  const [search, setSearch] = useState('');
  const [oStatusFilter, setOStatusFilter] = useState<OStatusFilter>('all');

  // 제품 이름 → id 맵 (필터 매칭용)
  const productNameMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => map.set(p.name, p.id));
    return map;
  }, [products]);

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((order) =>
        (order.order_number ?? '').toLowerCase().includes(q) ||
        (order.companies?.name ?? '').toLowerCase().includes(q),
      );
    }
    if (oStatusFilter !== 'all') {
      result = result.filter((order) => order.status === oStatusFilter);
    }
    if (selectedProducts.size > 0) {
      result = result.filter((order) =>
        order.order_items.some((item) => {
          const name = item.products?.name;
          if (!name) return false;
          const pid = productNameMap.get(name);
          return pid ? selectedProducts.has(pid) : false;
        }),
      );
    }
    return result;
  }, [orders, search, oStatusFilter, selectedProducts, productNameMap]);

  const columns = useMemo<ColumnDef<Order, unknown>[]>(() => [
    {
      accessorKey: 'order_number',
      header: '발주번호',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-gray-500">
          {row.original.order_number ?? '-'}
        </span>
      ),
    },
    {
      id: 'company',
      header: '업체명',
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.companies?.name ?? '-'}
        </span>
      ),
    },
    {
      id: 'items',
      header: '품목',
      cell: ({ row }) => {
        const items = row.original.order_items;
        const itemSummary = items
          .slice(0, 2)
          .map((i) => `${i.products?.name ?? '?'} ×${i.quantity}`)
          .join(', ') + (items.length > 2 ? ` 외 ${items.length - 2}건` : '');
        return (
          <span className="text-sm text-gray-600 max-w-[200px] truncate block">
            {itemSummary}
          </span>
        );
      },
    },
    {
      id: 'total',
      header: () => <span className="w-full text-right block">합계</span>,
      cell: ({ row }) => {
        const total = row.original.order_items.reduce(
          (s, i) => s + i.quantity * i.unit_price, 0,
        );
        return (
          <span className="text-right text-sm font-semibold block">
            ₩{(total * 1.1).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        );
      },
    },
    {
      id: 'confirmed_by',
      header: '수주자',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.confirmed_by ? row.original.confirmed_by.split('@')[0] : '-'}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: '접수일',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {dayjs(row.original.created_at).format('MM-DD HH:mm')}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: '상태',
      cell: ({ row }) => (
        <Badge variant={statusVariant[row.original.status]}>
          {statusLabel[row.original.status]}
        </Badge>
      ),
    },
  ], []);

  function toggleProduct(id: string) {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilter() {
    setSelectedProducts(new Set());
    router.replace('/orders');
  }

  const filterNames = [...selectedProducts]
    .map((id) => products.find((p) => p.id === id)?.name)
    .filter(Boolean);

  const emptyMessage = search || oStatusFilter !== 'all' || selectedProducts.size > 0
    ? '조건에 맞는 발주가 없습니다'
    : '접수된 발주가 없습니다';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">수주 관리</h1>
      </div>

      {/* 검색 및 필터 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="발주번호 또는 업체명 검색"
            className="h-9 pl-9"
          />
        </div>
        <div className="flex items-center gap-2 justify-between sm:justify-end">
          <div className="flex rounded-md border overflow-hidden shrink-0">
            {([['all', '전체'], ['pending', '접수'], ['confirmed', '확정'], ['shipped', '출고'], ['completed', '완료'], ['cancelled', '취소']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setOStatusFilter(key)}
                className={`px-2.5 py-2 text-xs font-medium transition-colors border-l first:border-l-0 ${
                  oStatusFilter === key ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={() => setFilterOpen(true)}>
            <Filter size={14} />
            제품
            {selectedProducts.size > 0 && (
              <Badge variant="default" className="ml-1 h-5 w-5 rounded-full p-0 text-[10px] justify-center">
                {selectedProducts.size}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* 활성 필터 태그 */}
      {filterNames.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">필터:</span>
          {filterNames.map((name, i) => (
            <Badge key={i} variant="secondary" className="text-xs gap-1">
              {name}
              <button
                onClick={() => {
                  const id = [...selectedProducts][i];
                  toggleProduct(id);
                }}
                className="hover:text-red-500"
              >
                <X size={12} />
              </button>
            </Badge>
          ))}
          <button onClick={clearFilter} className="text-xs text-gray-400 hover:text-gray-600">
            전체 해제
          </button>
        </div>
      )}

      <div className="rounded-lg border bg-white overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredOrders}
          onRowClick={(order) => router.push(`/orders/${order.order_number ?? order.id}`)}
          emptyMessage={emptyMessage}
        />
      </div>

      {/* 제품 필터 Dialog */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="max-w-sm max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>제품으로 필터링</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-1 py-2">
            {products.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedProducts.has(p.id)}
                  onChange={() => toggleProduct(p.id)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">{p.name}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-between pt-2 border-t">
            <button onClick={clearFilter} className="text-sm text-gray-400 hover:text-gray-600">
              전체 해제
            </button>
            <Button size="sm" onClick={() => setFilterOpen(false)}>
              닫기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
