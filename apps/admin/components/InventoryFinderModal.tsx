'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Package, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { searchInventoryLocation } from '@/actions/warehouses';

interface SearchResult {
  id: string;
  serial_number: number | null;
  unit_barcode: string | null;
  manufacturer_serial: string | null;
  status: string;
  products: { id: string; name: string; barcode: string } | null;
  warehouses: { id: string; name: string; code: string } | null;
  warehouse_locations: { id: string; name: string; code: string; full_path: string } | null;
}

const statusLabels: Record<string, { label: string; variant: 'outline' | 'default' | 'secondary' | 'destructive' }> = {
  in_stock: { label: '재고', variant: 'default' },
  receiving: { label: '입고중', variant: 'outline' },
  reserved: { label: '예약', variant: 'secondary' },
  shipped: { label: '출고', variant: 'secondary' },
  sold: { label: '판매', variant: 'secondary' },
  disposed: { label: '폐기', variant: 'destructive' },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function InventoryFinderModal({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSearch() {
    if (!query.trim()) return;
    startTransition(async () => {
      const data = await searchInventoryLocation(query);
      setResults(data as unknown as SearchResult[]);
      setSearched(true);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }

  function handleClose() {
    onOpenChange(false);
    setQuery('');
    setResults([]);
    setSearched(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin size={18} />
            재고 위치 찾기
          </DialogTitle>
        </DialogHeader>

        {/* 검색 입력 */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="시리얼, 개별 바코드 입력"
              className="pl-9"
              autoFocus
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isPending || !query.trim()}
            className="px-3 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 shrink-0"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            검색
          </button>
        </div>

        {/* 결과 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {!searched && (
            <div className="text-center text-sm text-gray-400 py-8">
              시리얼번호, 바코드 등으로 재고 위치를 검색하세요
            </div>
          )}

          {searched && results.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-8">
              검색 결과가 없습니다
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">{results.length}건 검색됨</p>
              {results.map((item) => {
                const st = statusLabels[item.status] ?? statusLabels.in_stock;
                const barcodeDisplay = item.unit_barcode || item.products?.barcode || null;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.products?.id) {
                        handleClose();
                        router.push(`/products/${item.products.id}`);
                      }
                    }}
                    className="border rounded-lg p-3 space-y-2 bg-white cursor-pointer hover:shadow-md hover:border-gray-300 transition-shadow"
                  >
                    {/* 제품 정보 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package size={14} className="text-gray-400 shrink-0" />
                        <span className="font-medium text-sm truncate">
                          {item.products?.name ?? '-'}
                        </span>
                      </div>
                      <Badge variant={st.variant} className="shrink-0 text-xs">
                        {st.label}
                      </Badge>
                    </div>

                    {/* 식별 정보 */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      {item.manufacturer_serial && (
                        <span>S/N: <span className="font-mono text-gray-700">{item.manufacturer_serial}</span></span>
                      )}
                      {barcodeDisplay && (
                        <span>바코드: <span className="font-mono text-gray-700">{barcodeDisplay}</span></span>
                      )}
                    </div>

                    {/* 위치 정보 */}
                    <div className="flex items-center gap-2 bg-blue-50 rounded-md px-2.5 py-1.5">
                      <MapPin size={14} className="text-blue-600 shrink-0" />
                      {item.warehouses ? (
                        <span className="text-sm text-blue-900">
                          <span className="font-medium">{item.warehouses.name}</span>
                          {item.warehouse_locations && (
                            <span className="text-blue-600 ml-1">
                              &gt; {item.warehouse_locations.full_path || item.warehouse_locations.name}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">미배정</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
