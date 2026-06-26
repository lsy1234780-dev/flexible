'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Barcode, Pencil, Package, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import ModalBase from '@/components/ModalBase';
import { updateProduct, deleteProduct } from '@/actions/products';
import ProductForm from '../ProductForm';
import BarcodeModal from '../BarcodeModal';
import dayjs from 'dayjs';
import type { Product, InventoryLog, Category } from '@/types/database';
import ProductSerialsSection from './ProductSerialsSection';

interface ProductWithLogs extends Product {
  inventory_logs: InventoryLog[];
}

interface Props {
  product: ProductWithLogs;
  categories: Category[];
}

export default function ProductDetailClient({ product, categories }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`"${product.name}" 제품을 삭제하시겠습니까?\n관련 재고·시리얼·LOT 데이터도 함께 삭제됩니다.`)) return;
    startTransition(async () => {
      const result = await deleteProduct(product.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('제품이 삭제되었습니다');
        router.push('/products');
      }
    });
  }

  async function handleUpdate(formData: FormData) {
    const result = await updateProduct(product.id, formData);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('저장되었습니다');
      setEditOpen(false);
      router.refresh();
    }
  }

  const LOG_PAGE_SIZE = 10;
  const [logSearch, setLogSearch] = useState('');
  const [logPage, setLogPage] = useState(1);

  const allLogs = product.inventory_logs ?? [];
  const filteredLogs = allLogs.filter((log) => {
    if (!logSearch.trim()) return true;
    const term = logSearch.toLowerCase();
    return (
      (log.memo ?? '').toLowerCase().includes(term) ||
      (log.type === 'in' ? '입고' : '출고').includes(term)
    );
  });
  const logTotalPages = Math.max(1, Math.ceil(filteredLogs.length / LOG_PAGE_SIZE));
  const pagedLogs = filteredLogs.slice((logPage - 1) * LOG_PAGE_SIZE, logPage * LOG_PAGE_SIZE);

  const logColumns = useMemo<ColumnDef<InventoryLog, unknown>[]>(() => [
    {
      accessorKey: 'type',
      header: '구분',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={row.original.type === 'in' ? 'default' : 'destructive'}>
          {row.original.type === 'in' ? '입고' : '출고'}
        </Badge>
      ),
    },
    {
      accessorKey: 'quantity',
      header: '수량',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-right font-medium">
          {row.original.type === 'in' ? '+' : '-'}{row.original.quantity.toLocaleString()}개
        </span>
      ),
    },
    {
      accessorKey: 'memo',
      header: '비고',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-gray-400 max-w-[150px] truncate block">
          {row.original.memo ?? ''}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: '일시',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {dayjs(row.original.created_at).format('YYYY-MM-DD HH:mm')}
        </span>
      ),
    },
  ], []);

  return (
    <div className="space-y-4">
      {/* 헤더: 뒤로가기 + 제품명 + 버튼 */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push('/products')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{product.name}</h1>
            <Badge variant={product.is_visible_default ? 'default' : 'secondary'} className="shrink-0">
              {product.is_visible_default ? '노출' : '숨김'}
            </Badge>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setBarcodeOpen(true)}>
            <Barcode size={15} />
          </Button>
          <Button size="icon" className="h-8 w-8" onClick={() => setEditOpen(true)}>
            <Pencil size={14} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
            onClick={handleDelete}
            disabled={isPending}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* 제품 도감 카드 */}
      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
            {/* 좌: 이미지 */}
            {product.image_url ? (
              <div className="bg-gray-50 flex items-center justify-center p-4 lg:border-r">
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="max-h-64 w-auto object-contain rounded"
                />
              </div>
            ) : (
              <div className="bg-gray-50 flex items-center justify-center p-8 lg:border-r text-gray-300">
                <Package size={64} />
              </div>
            )}

            {/* 우: 스펙 정보 */}
            <div className="p-5 space-y-4">
              {/* 기본 스펙 그리드 */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">바코드</p>
                  <p className="font-mono font-medium mt-0.5">{product.barcode}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">기본단가</p>
                  <p className="font-semibold text-lg mt-0.5">₩{product.base_price.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">현재고</p>
                  <p className={`font-semibold text-lg mt-0.5 ${product.base_stock === 0 ? 'text-red-500' : ''}`}>
                    {product.base_stock.toLocaleString()}<span className="text-sm font-normal text-gray-500 ml-0.5">개</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">등록일</p>
                  <p className="font-medium mt-0.5">{dayjs(product.created_at).format('YYYY-MM-DD')}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">카테고리</p>
                  <p className="font-medium mt-0.5">
                    {product.categories?.name ?? <span className="text-gray-300">미분류</span>}
                  </p>
                </div>
              </div>

              {/* 규격·무게 (있을 때만) */}
              {(product.width_cm || product.height_cm || product.depth_cm || product.weight_kg != null) && (
                <>
                  <div className="border-t pt-3" />
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    {(product.width_cm || product.height_cm || product.depth_cm) && (
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">규격 (W × H × D)</p>
                        <p className="font-medium mt-0.5">
                          {[product.width_cm, product.height_cm, product.depth_cm]
                            .map(v => v != null ? `${v}` : '-')
                            .join(' × ')}{' '}
                          <span className="text-gray-400">cm</span>
                        </p>
                      </div>
                    )}
                    {product.weight_kg != null && (
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">무게</p>
                        <p className="font-medium mt-0.5">
                          {product.weight_kg} <span className="text-gray-400">kg</span>
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* 제품 소개 (있을 때만) */}
              {product.description && (
                <>
                  <div className="border-t pt-3" />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-1.5">제품 소개</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{product.description}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 입출고 이력 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base shrink-0">
              입출고 이력
              <span className="ml-2 text-sm font-normal text-gray-400">총 {filteredLogs.length}건</span>
            </CardTitle>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => { setLogSearch(e.target.value); setLogPage(1); }}
                placeholder="비고 검색"
                className="pl-8 pr-3 py-1.5 border rounded-lg text-xs w-44 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={logColumns}
            data={pagedLogs}
            emptyMessage={logSearch ? '검색 결과가 없습니다' : '입출고 이력이 없습니다'}
          />
          {logTotalPages > 1 && (
            <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-gray-500">
              <span>{logPage} / {logTotalPages} 페이지</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7" disabled={logPage <= 1} onClick={() => setLogPage((p) => p - 1)}>
                  <ChevronLeft size={14} />
                </Button>
                <Button variant="outline" size="sm" className="h-7" disabled={logPage >= logTotalPages} onClick={() => setLogPage((p) => p + 1)}>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 개별 시리얼 바코드 */}
      <ProductSerialsSection productId={product.id} productName={product.name} productBarcode={product.barcode} />

      {/* 수정 다이얼로그 */}
      <ModalBase
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="제품 수정"
        maxWidth="sm:max-w-lg"
      >
        <ProductForm product={product} categories={categories} onSubmit={handleUpdate} />
      </ModalBase>

      {/* 바코드 모달 */}
      {barcodeOpen && (
        <BarcodeModal product={product} onClose={() => setBarcodeOpen(false)} />
      )}
    </div>
  );
}
