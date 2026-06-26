'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { type ColumnDef } from '@tanstack/react-table';
import { ScanBarcode, Plus, Minus, ArrowUp, ArrowDown, Search, Truck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { processBarcodeScan, directShipProduct } from '@/actions/inventory';
import dayjs from 'dayjs';

interface Product {
  id: string;
  name: string;
  barcode: string;
  base_price: number;
  base_stock: number;
  real_stock: number;        // inventory_items in_stock 실재고
  pending_stock: number;     // 미확정 발주 (아직 재고 미차감)
  confirmed_stock: number;   // 확정 대기출고 (재고 차감됨)
  shipping_stock: number;    // 출고중 (재고 차감됨)
  shipped_count: number;     // 출고 완료 (shipped/sold — 출고현황)
  category_id: string | null;
  categories: { name: string } | null;
}

interface InventoryLog {
  id: string;
  quantity: number;
  type: 'in' | 'out';
  memo: string | null;
  created_at: string;
  products: { name: string; barcode: string } | null;
}

interface Company {
  id: string;
  name: string;
}

interface Props {
  products: Product[];
  logs: InventoryLog[];
  companies: Company[];
}

type StockFilter = 'all' | 'out' | 'low' | 'normal';

export default function InventoryClient({ products, logs, companies }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [memo, setMemo] = useState('');
  const [type, setType] = useState<'in' | 'out'>('in');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [shipOpen, setShipOpen] = useState(false);
  const [shipProductId, setShipProductId] = useState('');
  const [shipQty, setShipQty] = useState('1');
  const [shipCompanyId, setShipCompanyId] = useState('');
  const [shipHandler, setShipHandler] = useState('');
  const [shipMemo, setShipMemo] = useState('');
  const [shipSalePrice, setShipSalePrice] = useState('');
  const [shipLoading, setShipLoading] = useState(false);

  const totalProducts = products.length;
  const totalPending = products.reduce((s, p) => s + p.pending_stock, 0);
  const totalShipping = products.reduce((s, p) => s + p.shipping_stock, 0);
  const totalShipped = products.reduce((s, p) => s + (p.shipped_count ?? 0), 0);
  // 가용재고 = 실재고(in_stock) - 미확정 발주
  const getAvailable = (p: Product) => p.real_stock - p.pending_stock;
  const outOfStock = products.filter((p) => getAvailable(p) <= 0).length;
  const lowStock = products.filter((p) => {
    const avail = getAvailable(p);
    return avail > 0 && avail <= 10;
  }).length;

  const filteredProducts = useMemo(() => {
    let result = products;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q),
      );
    }
    if (stockFilter !== 'all') {
      result = result.filter((p) => {
        const avail = getAvailable(p);
        if (stockFilter === 'out') return avail <= 0;
        if (stockFilter === 'low') return avail > 0 && avail <= 10;
        return avail > 10;
      });
    }
    return result;
  }, [products, search, stockFilter]);

  const inventoryColumns = useMemo<ColumnDef<Product, unknown>[]>(() => [
    {
      accessorKey: 'categories',
      header: '카테고리',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.categories?.name ?? <span className="text-gray-300">—</span>}
        </span>
      ),
    },
    {
      accessorKey: 'name',
      header: '제품명',
      cell: ({ row }) => (
        <Link
          href={`/products/${row.original.id}`}
          className="font-medium hover:underline text-gray-900"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'barcode',
      header: '바코드',
      cell: ({ row }) => (
        <span className="font-mono text-sm text-gray-500">{row.original.barcode}</span>
      ),
    },
    {
      accessorKey: 'real_stock',
      header: () => <span className="w-full text-right block">현재고</span>,
      cell: ({ row }) => (
        <div className="text-right text-gray-700">
          {row.original.real_stock.toLocaleString()}
          {row.original.real_stock !== row.original.base_stock && (
            <span className="ml-1 text-xs text-orange-500" title={`base_stock: ${row.original.base_stock}`}>
              ⚠
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'pending_stock',
      header: () => <span className="w-full text-right block">발주중</span>,
      cell: ({ row }) => (
        <div className="text-right">
          {row.original.pending_stock > 0 ? (
            <Link
              href={`/orders?product=${row.original.id}`}
              className="text-blue-600 font-medium hover:underline"
            >
              {row.original.pending_stock.toLocaleString()}
            </Link>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'shipping_stock',
      header: () => <span className="w-full text-right block">출고중</span>,
      cell: ({ row }) => (
        <div className="text-right">
          {row.original.shipping_stock > 0 ? (
            <Link
              href={`/orders?product=${row.original.id}`}
              className="text-orange-600 font-medium hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.shipping_stock.toLocaleString()}
            </Link>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'shipped_count',
      header: () => <span className="w-full text-right block">출고완료</span>,
      cell: ({ row }) => (
        <div className="text-right">
          {row.original.shipped_count > 0 ? (
            <Link
              href={`/warranty?product=${row.original.id}&productName=${encodeURIComponent(row.original.name)}`}
              className="text-blue-600 font-medium hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.shipped_count.toLocaleString()}
            </Link>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
      ),
    },
    {
      id: 'available',
      header: () => <span className="w-full text-right block">가용재고</span>,
      cell: ({ row }) => {
        const availableStock = getAvailable(row.original);
        return (
          <div className="text-right font-bold text-gray-900">
            {availableStock.toLocaleString()}
          </div>
        );
      },
    },
    {
      id: 'status',
      header: () => <span className="w-full text-center block">상태</span>,
      cell: ({ row }) => {
        const availableStock = getAvailable(row.original);
        return (
          <div className="text-center">
            {availableStock <= 0 ? (
              <Badge variant="destructive">재고없음</Badge>
            ) : availableStock <= 10 ? (
              <Badge variant="outline" className="text-yellow-600 border-yellow-400">부족</Badge>
            ) : (
              <Badge variant="secondary">정상</Badge>
            )}
          </div>
        );
      },
    },
    {
      id: 'ship',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const available = getAvailable(row.original);
        return (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={available <= 0}
              onClick={() => openShipDialog(row.original.id)}
            >
              <Truck size={12} />
              출고
            </Button>
          </div>
        );
      },
    },
  ], []);

  const logColumns = useMemo<ColumnDef<InventoryLog, unknown>[]>(() => [
    {
      accessorKey: 'created_at',
      header: '일시',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {dayjs(row.original.created_at).format('MM-DD HH:mm')}
        </span>
      ),
    },
    {
      id: 'productName',
      header: '제품명',
      cell: ({ row }) => (
        <span className="font-medium text-gray-900">
          {row.original.products?.name ?? '-'}
        </span>
      ),
    },
    {
      accessorKey: 'type',
      header: () => <span className="w-full text-center block">구분</span>,
      cell: ({ row }) => (
        <div className="text-center">
          {row.original.type === 'in' ? (
            <Badge variant="secondary" className="gap-1">
              <ArrowDown size={12} /> 입고
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-red-600 border-red-300">
              <ArrowUp size={12} /> 출고
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'quantity',
      header: () => <span className="w-full text-right block">수량</span>,
      cell: ({ row }) => (
        <div className="text-right font-medium">
          <span className={row.original.type === 'in' ? 'text-green-600' : 'text-red-600'}>
            {row.original.type === 'in' ? '+' : '-'}{row.original.quantity.toLocaleString()}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'memo',
      header: '비고',
      cell: ({ row }) => (
        <span className="text-sm text-gray-400 max-w-[150px] truncate block">
          {row.original.memo ?? ''}
        </span>
      ),
    },
  ], []);

  async function handleSubmit() {
    if (!selectedId) { toast.error('제품을 선택하세요'); return; }
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) { toast.error('수량을 1 이상 입력하세요'); return; }

    const product = products.find((p) => p.id === selectedId);
    if (!product) return;

    setLoading(true);
    const formData = new FormData();
    formData.set('barcode', product.barcode);
    formData.set('quantity', String(qty));
    formData.set('type', type);
    formData.set('memo', memo);

    const result = await processBarcodeScan(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(result.message);
      setSelectedId('');
      setQuantity('1');
      setMemo('');
      router.refresh();
    }
  }

  function openShipDialog(productId?: string) {
    setShipProductId(productId ?? '');
    setShipQty('1');
    setShipCompanyId('');
    setShipHandler('');
    setShipMemo('');
    setShipSalePrice('');
    setShipOpen(true);
  }

  async function handleShip(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(shipQty, 10);
    if (!shipProductId) { toast.error('제품을 선택하세요'); return; }
    if (!qty || qty < 1) { toast.error('수량을 1 이상 입력하세요'); return; }
    if (!shipCompanyId) { toast.error('거래처를 선택하세요'); return; }
    if (!shipHandler.trim()) { toast.error('담당자를 입력하세요'); return; }

    const selectedProduct = products.find((p) => p.id === shipProductId);
    const available = selectedProduct ? getAvailable(selectedProduct) : 0;
    if (qty > available) { toast.error(`가용 재고(${available}개)를 초과할 수 없습니다`); return; }

    setShipLoading(true);
    const salePriceNum = shipSalePrice.trim() ? parseFloat(shipSalePrice.trim()) : null;
    const result = await directShipProduct({
      productId: shipProductId,
      quantity: qty,
      companyId: shipCompanyId,
      handlerName: shipHandler.trim(),
      memo: shipMemo.trim() || undefined,
      sale_price: salePriceNum,
    });
    setShipLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`출고처리 완료 (${result.orderNumber})`);
      setShipOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">재고 현황</h1>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => openShipDialog()}>
            <Truck size={16} />
            출고처리
          </Button>
          <Link href="/inventory/scan">
            <Button size="sm" variant="outline">
              <ScanBarcode size={16} />
              바코드 스캐너
            </Button>
          </Link>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">전체 제품</p>
          <p className="text-2xl font-bold text-gray-900">{totalProducts}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">재고 없음</p>
          <p className={`text-2xl font-bold ${outOfStock > 0 ? 'text-red-500' : 'text-gray-900'}`}>{outOfStock}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">재고 부족 (10개↓)</p>
          <p className={`text-2xl font-bold ${lowStock > 0 ? 'text-yellow-500' : 'text-gray-900'}`}>{lowStock}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">발주중</p>
          <p className={`text-2xl font-bold ${totalPending > 0 ? 'text-blue-500' : 'text-gray-900'}`}>{totalPending}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">출고중</p>
          <p className={`text-2xl font-bold ${totalShipping > 0 ? 'text-orange-500' : 'text-gray-900'}`}>{totalShipping}</p>
        </div>
        <Link href="/warranty" className="rounded-lg border bg-white p-4 hover:bg-gray-50 transition-colors block">
          <p className="text-sm text-gray-500">출고완료</p>
          <p className={`text-2xl font-bold ${totalShipped > 0 ? 'text-blue-600' : 'text-gray-900'}`}>{totalShipped}</p>
        </Link>
      </div>

      {/* 검색 및 필터 */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제품명 또는 바코드 검색"
            className="h-9 pl-9"
          />
        </div>
        <div className="flex rounded-md border overflow-hidden shrink-0">
          {([['all', '전체'], ['out', '없음'], ['low', '부족'], ['normal', '정상']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStockFilter(key)}
              className={`px-2.5 py-2 text-xs font-medium transition-colors border-l first:border-l-0 ${
                stockFilter === key
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 재고 테이블 */}
      <div className="rounded-lg border bg-white overflow-x-auto">
        <DataTable
          columns={inventoryColumns}
          data={filteredProducts}
          emptyMessage={search || stockFilter !== 'all' ? '조건에 맞는 제품이 없습니다' : '등록된 제품이 없습니다'}
        />
      </div>

      {/* 재고 조정 */}
      <div className="rounded-lg border bg-white">
        <div className="p-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">재고 조정</p>
          {/* 1행: 제품 선택 + ±수량 */}
          <div className="flex gap-2 items-center">
            <div className="flex-1 min-w-0">
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="제품 선택" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span>{p.name}</span>
                      <span className="ml-2 text-xs text-gray-400">가용 {getAvailable(p)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex rounded-md border overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => setType('in')}
                className={`px-2.5 py-2 text-sm font-medium transition-colors ${type === 'in' ? 'bg-gray-900 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
              >
                <Plus size={15} />
              </button>
              <button
                type="button"
                onClick={() => setType('out')}
                className={`px-2.5 py-2 text-sm font-medium transition-colors border-l ${type === 'out' ? 'bg-red-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
              >
                <Minus size={15} />
              </button>
            </div>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-9 w-16 text-right shrink-0"
              placeholder="수량"
            />
          </div>
          {/* 2행: 비고 + 처리 버튼 */}
          <div className="flex gap-2">
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="h-9 flex-1 min-w-0"
              placeholder="비고 (선택)"
            />
            <Button
              onClick={handleSubmit}
              disabled={loading || !selectedId}
              variant={type === 'out' ? 'destructive' : 'default'}
              className="h-9 shrink-0"
            >
              {loading ? '처리 중...' : `${type === 'in' ? '입고' : '출고'} 처리`}
            </Button>
          </div>
        </div>

        {/* 최근 조정 이력 */}
        {logs.length > 0 && (
          <div className="border-t overflow-x-auto">
            <div className="px-4 py-2 bg-gray-50">
              <p className="text-xs font-medium text-gray-500">최근 조정 이력</p>
            </div>
            <DataTable
              columns={logColumns}
              data={logs}
            />
          </div>
        )}
      </div>

      {/* 출고처리 다이얼로그 */}
      <Dialog open={shipOpen} onOpenChange={(v) => { if (!v) setShipOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>출고처리</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleShip} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                제품 <span className="text-red-500">*</span>
              </label>
              <Select value={shipProductId} onValueChange={setShipProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="제품 선택" />
                </SelectTrigger>
                <SelectContent>
                  {products.filter((p) => getAvailable(p) > 0).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span>{p.name}</span>
                      <span className="ml-2 text-xs text-gray-400">가용 {getAvailable(p)}개</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shipProductId && (() => {
                const p = products.find((x) => x.id === shipProductId);
                return p ? (
                  <p className="text-xs text-gray-400 mt-1">가용 재고: {getAvailable(p)}개</p>
                ) : null;
              })()}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                수량 <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                min={1}
                max={shipProductId ? getAvailable(products.find((p) => p.id === shipProductId)!) : undefined}
                value={shipQty}
                onChange={(e) => setShipQty(e.target.value)}
                placeholder="출고 수량"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                거래처 <span className="text-red-500">*</span>
              </label>
              <Select value={shipCompanyId} onValueChange={setShipCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="거래처 선택" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                담당자 <span className="text-red-500">*</span>
              </label>
              <Input
                value={shipHandler}
                onChange={(e) => setShipHandler(e.target.value)}
                placeholder="출고 담당자 이름"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                판매가 (원)
                {shipProductId && (() => {
                  const p = products.find((x) => x.id === shipProductId);
                  return p ? <span className="ml-1 text-xs text-gray-400">기본단가: {p.base_price.toLocaleString()}원</span> : null;
                })()}
              </label>
              <Input
                type="number"
                min={0}
                value={shipSalePrice}
                onChange={(e) => setShipSalePrice(e.target.value)}
                placeholder="판매가 입력 (손익 계산에 사용)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
              <Input
                value={shipMemo}
                onChange={(e) => setShipMemo(e.target.value)}
                placeholder="특이사항 (선택)"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShipOpen(false)}>취소</Button>
              <Button type="submit" disabled={shipLoading}>
                {shipLoading && <Loader2 size={14} className="animate-spin mr-1" />}
                출고처리
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
