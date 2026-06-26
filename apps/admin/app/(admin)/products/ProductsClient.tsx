'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Search, Barcode } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import ModalBase from '@/components/ModalBase';
import { createProduct } from '@/actions/products';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ProductForm from './ProductForm';
import BarcodeModal from './BarcodeModal';
import type { Product, Category } from '@/types/database';

interface Props {
  products: Product[];
  categories: Category[];
  initialCategory?: string;
  initialBarcode?: string;
}

export default function ProductsClient({ products, categories, initialCategory, initialBarcode }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(initialCategory ?? 'all');
  const [createOpen, setCreateOpen] = useState(!!initialBarcode);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.includes(search);
    const matchCategory =
      categoryFilter === 'all' ||
      (categoryFilter === 'none' ? !p.category_id : p.category_id === categoryFilter);
    return matchSearch && matchCategory;
  });

  const columns = useMemo<ColumnDef<Product, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: '제품명',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: 'category',
      header: '카테고리',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.categories?.name ?? <span className="text-gray-300">—</span>}
        </span>
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
      accessorKey: 'serial_mode',
      header: '시리얼 방식',
      cell: ({ row }) => {
        const mode = (row.original as unknown as { serial_mode?: string }).serial_mode;
        if (mode === 'strict') return <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">제조사 시리얼</Badge>;
        if (mode === 'pool') return <Badge variant="outline" className="text-xs border-gray-300 text-gray-500">자체 바코드</Badge>;
        return <Badge variant="secondary" className="text-xs">수량만</Badge>;
      },
    },
    {
      accessorKey: 'base_price',
      header: () => <span className="flex justify-end">기본단가</span>,
      cell: ({ row }) => (
        <div className="text-right">₩{row.original.base_price.toLocaleString()}</div>
      ),
    },
    {
      accessorKey: 'base_stock',
      header: () => <span className="flex justify-end">재고</span>,
      cell: ({ row }) => (
        <div className="text-right">
          <span className={row.original.base_stock === 0 ? 'text-red-500 font-medium' : ''}>
            {row.original.base_stock.toLocaleString()}개
          </span>
        </div>
      ),
    },
    {
      id: 'visibility',
      header: () => <span className="flex justify-center">노출</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-center">
          <Badge variant={row.original.is_visible_default ? 'default' : 'secondary'}>
            {row.original.is_visible_default ? '노출' : '숨김'}
          </Badge>
        </div>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="flex justify-end">관리</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setBarcodeProduct(row.original)}
            title="바코드 보기"
          >
            <Barcode size={16} />
          </Button>
        </div>
      ),
    },
  ], []);

  async function handleCreate(formData: FormData) {
    const result = await createProduct(formData);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('제품이 등록되었습니다');
      setCreateOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">제품 관리</h1>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus size={16} />
          제품 등록
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="제품명 또는 바코드 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {categories.length > 0 && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="카테고리" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 카테고리</SelectItem>
              <SelectItem value="none">미분류</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={(p) => router.push(`/products/${p.id}`)}
          emptyMessage={search ? '검색 결과가 없습니다' : '등록된 제품이 없습니다'}
        />
      </div>

      {/* 제품 등록 다이얼로그 */}
      <ModalBase
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="제품 등록"
        maxWidth="sm:max-w-lg"
      >
        <ProductForm categories={categories} initialBarcode={initialBarcode} onSubmit={handleCreate} />
      </ModalBase>

      {/* 바코드 모달 */}
      {barcodeProduct && (
        <BarcodeModal product={barcodeProduct} onClose={() => setBarcodeProduct(null)} />
      )}
    </div>
  );
}
