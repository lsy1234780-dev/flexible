'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { type ColumnDef } from '@tanstack/react-table';
import { ScanBarcode, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { processBarcodeScan } from '@/actions/inventory';
import WarehouseLocationPicker from '@/components/WarehouseLocationPicker';
import dayjs from 'dayjs';

interface LogItem {
  id: string;
  type: 'in' | 'out';
  quantity: number;
  memo: string | null;
  created_at: string;
  products: { name: string; barcode: string } | null;
}

interface Props {
  recentLogs: LogItem[];
}

interface ScanResult {
  success: boolean;
  message: string;
}

export default function ScanClient({ recentLogs }: Props) {
  const router = useRouter();

  const logColumns = useMemo<ColumnDef<LogItem, unknown>[]>(() => [
    {
      accessorKey: 'type',
      header: '구분',
      cell: ({ row }) => (
        <Badge variant={row.original.type === 'in' ? 'default' : 'destructive'}>
          {row.original.type === 'in' ? '입고' : '출고'}
        </Badge>
      ),
    },
    {
      id: 'productName',
      header: '제품명',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.products?.name ?? '-'}</span>
      ),
    },
    {
      id: 'barcode',
      header: '바코드',
      cell: ({ row }) => (
        <span className="font-mono text-sm text-gray-500">
          {row.original.products?.barcode ?? '-'}
        </span>
      ),
    },
    {
      accessorKey: 'quantity',
      header: () => <span className="text-right block">수량</span>,
      cell: ({ row }) => (
        <span className="text-right block">
          {row.original.type === 'in' ? '+' : '-'}{row.original.quantity}개
        </span>
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
    {
      accessorKey: 'created_at',
      header: '처리시간',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {dayjs(row.original.created_at).format('MM-DD HH:mm')}
        </span>
      ),
    },
  ], []);
  const inputRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);
  const salePriceRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<'in' | 'out'>('in');
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [isPending, startTransition] = useTransition();

  // 페이지 진입 시 자동 포커스
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // BT 스캐너: Enter 키 감지
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        const barcode = input!.value.trim();
        if (!barcode) return;
        submitScan(barcode);
      }
    }

    input.addEventListener('keydown', handleKeyDown);
    return () => input.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  function submitScan(barcode: string) {
    const quantity = parseInt(qtyRef.current?.value ?? '1', 10) || 1;
    const memo = memoRef.current?.value.trim() ?? '';
    const salePriceVal = salePriceRef.current?.value.trim() ?? '';
    const formData = new FormData();
    formData.set('barcode', barcode);
    formData.set('quantity', String(quantity));
    formData.set('type', type);
    formData.set('memo', memo);
    if (type === 'out' && salePriceVal) formData.set('sale_price', salePriceVal);
    if (warehouseId) formData.set('warehouse_id', warehouseId);
    if (locationId) formData.set('location_id', locationId);

    startTransition(async () => {
      const result = await processBarcodeScan(formData);

      if (result.error) {
        setLastResult({ success: false, message: result.error });
        if (result.error.includes('제품을 찾을 수 없습니다')) {
          toast.error(result.error, {
            duration: 8000,
            action: {
              label: '제품 추가',
              onClick: () => {
                window.open(`/products?newBarcode=${encodeURIComponent(barcode)}`, '_blank');
              },
            },
          });
        } else {
          toast.error(result.error);
        }
      } else {
        setLastResult({ success: true, message: result.message! });
        toast.success(result.message);
        router.refresh();
      }

      // 입력 초기화 후 재포커스
      if (memoRef.current) memoRef.current.value = '';
      if (salePriceRef.current) salePriceRef.current.value = '';
      if (inputRef.current) {
        inputRef.current.value = '';
        inputRef.current.focus();
      }
    });
  }

  function handleManualSubmit() {
    const barcode = inputRef.current?.value.trim();
    if (!barcode) return;
    submitScan(barcode);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">바코드 입고 처리</h1>

      {/* 스캔 입력 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ScanBarcode size={18} />
            스캐너 입력
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 입고/출고 전환 */}
          <div className="flex gap-2">
            <Button
              variant={type === 'in' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType('in')}
            >
              입고
            </Button>
            <Button
              variant={type === 'out' ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => setType('out')}
            >
              출고
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="barcode">바코드</Label>
              <Input
                id="barcode"
                ref={inputRef}
                placeholder="스캐너로 스캔하거나 직접 입력"
                disabled={isPending}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quantity">수량</Label>
              <Input
                id="quantity"
                ref={qtyRef}
                type="number"
                min={1}
                defaultValue={1}
                disabled={isPending}
              />
            </div>
          </div>

          {type === 'out' && (
            <div className="space-y-1.5">
              <Label htmlFor="sale_price">판매가 (원)</Label>
              <Input
                id="sale_price"
                ref={salePriceRef}
                type="number"
                min={0}
                placeholder="판매가 입력 (손익 계산에 사용)"
                disabled={isPending}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="memo">비고</Label>
            <Input
              id="memo"
              ref={memoRef}
              placeholder="비고 (선택사항)"
              disabled={isPending}
            />
          </div>

          {type === 'in' && (
            <WarehouseLocationPicker
              warehouseId={warehouseId}
              locationId={locationId}
              onWarehouseChange={setWarehouseId}
              onLocationChange={setLocationId}
              horizontal
              compact
            />
          )}

          <Button
            onClick={handleManualSubmit}
            disabled={isPending}
            className="w-full"
            variant={type === 'out' ? 'destructive' : 'default'}
          >
            {isPending ? '처리 중...' : `${type === 'in' ? '입고' : '출고'} 처리`}
          </Button>

          {/* 마지막 처리 결과 */}
          {lastResult && (
            <div
              className={`flex items-center gap-2 rounded-lg p-3 text-sm font-medium ${
                lastResult.success
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {lastResult.success ? (
                <CheckCircle2 size={16} />
              ) : (
                <XCircle size={16} />
              )}
              {lastResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 최근 처리 이력 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">최근 처리 이력</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={logColumns}
            data={recentLogs}
            emptyMessage="처리 이력이 없습니다"
          />
        </CardContent>
      </Card>
    </div>
  );
}
