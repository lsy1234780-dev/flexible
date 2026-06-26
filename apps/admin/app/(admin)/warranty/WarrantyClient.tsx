'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldCheck, ShieldOff, Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { getAllShippedItems, getShippedFilterOptions } from '@/actions/products';
import ShippedItemDetailModal from '@/components/ShippedItemDetailModal';
import Link from 'next/link';
import dayjs from 'dayjs';

type ShippedItem = Awaited<ReturnType<typeof getAllShippedItems>>['items'][number];
type WarrantyStatus = 'valid' | 'expired' | 'unknown';
type WarrantyFilter = 'all' | 'valid' | 'expired';

interface Row {
  id: string;
  productId: string;
  productName: string;
  productBarcode: string;
  serialLabel: string;
  manufacturerSerial: string | null;
  companyName: string;
  orderNumber: string;
  shippedAt: string | null;
  warrantyExpiresAt: string | null;
  warrantyStatus: WarrantyStatus;
  daysLeft: number | null;
}

function calcWarranty(shippedAt: string | null) {
  if (!shippedAt) return { warrantyExpiresAt: null, warrantyStatus: 'unknown' as WarrantyStatus, daysLeft: null };
  const expiresAt = dayjs(shippedAt).add(12, 'month');
  const daysLeft = expiresAt.diff(dayjs(), 'day');
  return { warrantyExpiresAt: expiresAt.format('YYYY-MM-DD'), warrantyStatus: (daysLeft >= 0 ? 'valid' : 'expired') as WarrantyStatus, daysLeft };
}

function toRow(item: ShippedItem): Row {
  const inv = item.inventory_items as { serial_number: number | null; unit_barcode: string | null; manufacturer_serial: string | null } | null;
  const shipment = item.shipments as { shipped_at: string | null; completed_at: string | null; orders: { order_number: string | null; companies: { name: string } | null } | null } | null;
  const product = item.products as { id: string; name: string; barcode: string } | null;
  const order = shipment?.orders ?? null;
  const shippedAt = shipment?.shipped_at ?? shipment?.completed_at ?? null;
  const { warrantyExpiresAt, warrantyStatus, daysLeft } = calcWarranty(shippedAt);
  const serialParts: string[] = [];
  if (inv?.unit_barcode) serialParts.push(inv.unit_barcode);
  else if (inv?.serial_number != null) serialParts.push(`#${inv.serial_number}`);
  return {
    id: item.id,
    productId: product?.id ?? '',
    productName: product?.name ?? '—',
    productBarcode: product?.barcode ?? '—',
    serialLabel: serialParts.join(' / ') || `수량 ${item.quantity}개`,
    manufacturerSerial: inv?.manufacturer_serial ?? null,
    companyName: order?.companies?.name ?? '—',
    orderNumber: order?.order_number ?? '—',
    shippedAt,
    warrantyExpiresAt,
    warrantyStatus,
    daysLeft,
  };
}

function WarrantyBadge({ row }: { row: Row }) {
  if (row.warrantyStatus === 'unknown') return <span className="text-xs text-gray-400">출고일 없음</span>;
  if (row.warrantyStatus === 'expired') {
    return (
      <div className="flex items-center gap-1">
        <ShieldOff size={13} className="text-red-400" />
        <Badge variant="destructive" className="text-xs">보증 만료</Badge>
      </div>
    );
  }
  const daysLeft = row.daysLeft ?? 0;
  const isNear = daysLeft <= 30;
  return (
    <div className="flex items-center gap-1">
      <ShieldCheck size={13} className={isNear ? 'text-amber-500' : 'text-green-500'} />
      <Badge variant={isNear ? 'outline' : 'default'} className={`text-xs ${isNear ? 'border-amber-400 text-amber-600' : 'bg-green-600'}`}>
        무상보증
      </Badge>
      <span className="text-xs text-gray-500">{daysLeft}일 남음</span>
    </div>
  );
}

const PAGE_SIZE = 50;

export default function WarrantyClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialProductId = searchParams.get('product') ?? '';
  const initialProductName = searchParams.get('productName') ?? '';

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [productId, setProductId] = useState(initialProductId);
  const [warrantyFilter, setWarrantyFilter] = useState<WarrantyFilter>('all');
  const [loading, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [filterOptions, setFilterOptions] = useState<{
    companies: { id: string; name: string }[];
    products: { id: string; name: string; barcode: string }[];
  }>({ companies: [], products: [] });

  useEffect(() => {
    getShippedFilterOptions().then(setFilterOptions).catch(() => {});
  }, []);

  function load(p: number, q: string, cid: string, pid: string) {
    startTransition(async () => {
      const result = await getAllShippedItems({
        search: q,
        page: p,
        pageSize: PAGE_SIZE,
        companyId: cid || undefined,
        productId: pid || undefined,
      });
      setRows(result.items.map(toRow));
      setTotal(result.total);
    });
  }

  useEffect(() => {
    load(1, search, companyId, productId);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load(1, search, companyId, productId);
    if (initialProductId && !productId) router.replace('/warranty');
  }

  function handleCompanyChange(val: string) {
    const next = val === '_all' ? '' : val;
    setCompanyId(next);
    setPage(1);
    load(1, search, next, productId);
  }

  function handleProductChange(val: string) {
    const next = val === '_all' ? '' : val;
    setProductId(next);
    setPage(1);
    load(1, search, companyId, next);
    if (next !== initialProductId) router.replace('/warranty');
  }

  function clearFilters() {
    setSearch('');
    setCompanyId('');
    setProductId('');
    setWarrantyFilter('all');
    setPage(1);
    load(1, '', '', '');
    router.replace('/warranty');
  }

  function handlePage(next: number) {
    setPage(next);
    load(next, search, companyId, productId);
  }

  const hasActiveFilter = !!(search || companyId || productId || warrantyFilter !== 'all');

  // warrantyFilter는 클라이언트 사이드 필터 (보증 만료는 날짜 계산 필요)
  const displayRows = useMemo(() => {
    if (warrantyFilter === 'all') return rows;
    return rows.filter((r) => r.warrantyStatus === warrantyFilter);
  }, [rows, warrantyFilter]);

  const validCount = rows.filter((r) => r.warrantyStatus === 'valid').length;
  const expiredCount = rows.filter((r) => r.warrantyStatus === 'expired').length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    {
      accessorKey: 'productName',
      header: '제품명',
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <Link href={`/products/${row.original.productId}`} className="font-medium text-gray-900 hover:underline" onClick={(e) => e.stopPropagation()}>
            {row.original.productName}
          </Link>
          <div className="text-xs text-gray-400 font-mono">{row.original.productBarcode}</div>
        </div>
      ),
    },
    {
      accessorKey: 'serialLabel',
      header: '시리얼',
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <span className="font-mono text-sm text-gray-700">{row.original.serialLabel}</span>
          {row.original.manufacturerSerial && (
            <div className="text-xs text-gray-400">{row.original.manufacturerSerial}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'companyName',
      header: '납품 업체',
      enableSorting: false,
      cell: ({ row }) => <span className="text-sm text-gray-700">{row.original.companyName}</span>,
    },
    {
      accessorKey: 'orderNumber',
      header: '수주번호',
      enableSorting: false,
      cell: ({ row }) => <span className="font-mono text-xs text-gray-500">{row.original.orderNumber}</span>,
    },
    {
      accessorKey: 'shippedAt',
      header: '출고일',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.shippedAt ? dayjs(row.original.shippedAt).format('YYYY-MM-DD') : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'warrantyExpiresAt',
      header: '보증 만료일',
      enableSorting: false,
      cell: ({ row }) => <span className="text-sm text-gray-500">{row.original.warrantyExpiresAt ?? '—'}</span>,
    },
    {
      id: 'warrantyStatus',
      header: '보증 현황',
      enableSorting: false,
      cell: ({ row }) => <WarrantyBadge row={row.original} />,
    },
  ], []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">출고현황</h1>
        {hasActiveFilter && (
          <Button variant="ghost" size="sm" className="text-gray-500 gap-1" onClick={clearFilters}>
            <X size={14} /> 필터 초기화
          </Button>
        )}
      </div>

      {/* 필터 영역 */}
      <div className="flex flex-wrap gap-2">
        {/* 납품업체 */}
        <Select value={companyId || '_all'} onValueChange={handleCompanyChange}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="납품업체 전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">납품업체 전체</SelectItem>
            {filterOptions.companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 제품 */}
        <Select value={productId || '_all'} onValueChange={handleProductChange}>
          <SelectTrigger className="w-52 h-9">
            <SelectValue placeholder="제품 전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">제품 전체</SelectItem>
            {filterOptions.products.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 보증상태 */}
        <div className="flex rounded-md border overflow-hidden h-9">
          {([['all', '전체'], ['valid', '보증중'], ['expired', '만료']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setWarrantyFilter(key)}
              className={`px-3 text-xs font-medium transition-colors border-l first:border-l-0 ${
                warrantyFilter === key
                  ? key === 'expired' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <form onSubmit={handleSearch} className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="제품명·시리얼 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </form>
      </div>

      {/* 요약 뱃지 */}
      {rows.length > 0 && (
        <div className="flex gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">총 {total}건</span>
          <span className="px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">무상보증 {validCount}건</span>
          <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-medium">만료 {expiredCount}건</span>
        </div>
      )}

      <div className="rounded-lg border bg-white overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400">불러오는 중…</div>
        ) : (
          <DataTable
            columns={columns}
            data={displayRows}
            onRowClick={(row) => setSelectedId(row.id)}
            emptyMessage={hasActiveFilter ? '조건에 맞는 출고 내역이 없습니다' : '출고된 아이템이 없습니다'}
          />
        )}
        {totalPages > 1 && warrantyFilter === 'all' && (
          <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-gray-500">
            <span>총 {total}건 · {page} / {totalPages} 페이지</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => handlePage(page - 1)}>
                <ChevronLeft size={14} />
              </Button>
              <Button variant="outline" size="sm" className="h-7" disabled={page >= totalPages} onClick={() => handlePage(page + 1)}>
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {selectedId && (
        <ShippedItemDetailModal id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
