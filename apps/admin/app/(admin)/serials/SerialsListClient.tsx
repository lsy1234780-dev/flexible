'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';

interface Product {
  id: string;
  name: string;
  barcode: string;
  base_stock: number;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  weight_kg: number | null;
  categories: { id: string; name: string } | null;
}

interface Props {
  products: Product[];
}

export default function SerialsListClient({ products }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.barcode.includes(q);
  });

  const columns = useMemo<ColumnDef<Product, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: '제품명',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
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
      id: 'category',
      header: '카테고리',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.categories?.name ?? <span className="text-gray-300">미분류</span>}
        </span>
      ),
    },
    {
      accessorKey: 'base_stock',
      header: () => <span className="flex justify-end">현재고</span>,
      cell: ({ row }) => (
        <div className="text-right">
          <Badge variant={row.original.base_stock === 0 ? 'destructive' : 'secondary'}>
            {row.original.base_stock.toLocaleString()}
          </Badge>
        </div>
      ),
    },
    {
      id: 'dimensions',
      header: '규격',
      cell: ({ row }) => {
        const p = row.original;
        return (
          <span className="text-sm text-gray-500">
            {(p.width_cm || p.height_cm || p.depth_cm)
              ? `${p.width_cm ?? '-'}×${p.height_cm ?? '-'}×${p.depth_cm ?? '-'}cm`
              : '-'}
          </span>
        );
      },
    },
    {
      accessorKey: 'weight_kg',
      header: () => <span className="flex justify-end">무게</span>,
      cell: ({ row }) => (
        <div className="text-right text-sm text-gray-500">
          {row.original.weight_kg != null ? `${row.original.weight_kg}kg` : '-'}
        </div>
      ),
    },
  ], []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">시리얼 관리</h1>
        <span className="text-sm text-gray-400">{filtered.length}개 제품</span>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="제품명 또는 바코드 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={filtered}
            emptyMessage={search ? '검색 결과가 없습니다' : '등록된 제품이 없습니다'}
            onRowClick={(p) => router.push(`/serials/${p.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
