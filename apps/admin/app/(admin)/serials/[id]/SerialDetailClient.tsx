'use client';

import { useState, useEffect, useTransition, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Printer, ChevronLeft, ChevronRight, Pencil, Check, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable, selectColumn } from '@/components/ui/data-table';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import {
  getProductSerials,
  updateSerialStatus,
  updateSerialsStatusBatch,
  assignUnitBarcodes,
  updateManufacturerSerial,
  assignManufacturerSerialsBatch,
} from '@/actions/products';
import { moveInventoryItemsBatch } from '@/actions/warehouses';
import type { SerialStatus } from '@/types/database';
import ModalBase from '@/components/ModalBase';
import UnitBarcodeModal from '@/components/UnitBarcodeModal';
import WarehouseLocationPicker from '@/components/WarehouseLocationPicker';
import dayjs from 'dayjs';

interface Serial {
  id: string;
  serial_number: number;
  unit_barcode: string | null;
  manufacturer_serial: string | null;
  status: SerialStatus;
  created_at: string;
  warehouse_id: string | null;
  location_id: string | null;
  warehouses: { id: string; name: string; code: string } | null;
  warehouse_locations: { id: string; name: string; code: string; full_path: string | null; type: string } | null;
}

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
  product: Product;
  statusCounts: Record<string, number>;
}

const statusLabel: Record<SerialStatus, string> = {
  receiving: '입고중',
  in_stock: '재고',
  reserved: '예약',
  shipped: '출고',
  sold: '판매',
  disposed: '폐기',
};

const statusVariant: Record<SerialStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  receiving: 'outline',
  in_stock: 'default',
  reserved: 'outline',
  shipped: 'secondary',
  sold: 'secondary',
  disposed: 'destructive',
};

const STATUSES: SerialStatus[] = ['in_stock', 'reserved', 'shipped', 'sold', 'disposed'];
const PAGE_SIZE = 50;

export default function SerialDetailClient({ product, statusCounts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [serials, setSerials] = useState<Serial[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // 제조사 시리얼 인라인 수정
  const [editingMfSerial, setEditingMfSerial] = useState<{ id: string; value: string } | null>(null);

  // 개별 바코드 모달
  const [editingBarcode, setEditingBarcode] = useState<{ id: string; barcode: string | null } | null>(null);

  // 개별 바코드 일괄 부여 다이얼로그
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [parentBarcodeInput, setParentBarcodeInput] = useState('');

  // 제조사 시리얼 일괄 부여 다이얼로그
  const [mfSerialDialogOpen, setMfSerialDialogOpen] = useState(false);
  const [mfSerialText, setMfSerialText] = useState('');

  // 위치 변경 다이얼로그
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [moveWhId, setMoveWhId] = useState<string | null>(null);
  const [moveLocId, setMoveLocId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalSerials = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const selectedCount = Object.keys(rowSelection).length;
  const selectedIds = serials.filter((s) => rowSelection[s.id]).map((s) => s.id);

  const fetchSerials = useCallback(() => {
    startTransition(async () => {
      try {
        const result = await getProductSerials(product.id, {
          status: statusFilter,
          page,
          pageSize: PAGE_SIZE,
        });
        setSerials(result.serials as Serial[]);
        setTotal(result.total);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '조회 실패');
      }
    });
  }, [product.id, statusFilter, page]);

  useEffect(() => { fetchSerials(); }, [fetchSerials]);
  useEffect(() => { setRowSelection({}); }, [page, statusFilter]);

  function handleStatusChange(serialId: string, newStatus: string) {
    startTransition(async () => {
      const result = await updateSerialStatus(serialId, newStatus);
      if (result.error) toast.error(result.error);
      else fetchSerials();
    });
  }

  function handleBatchStatusChange(newStatus: string) {
    if (selectedCount === 0) return;
    startTransition(async () => {
      const result = await updateSerialsStatusBatch(selectedIds, newStatus);
      if (result.error) toast.error(result.error);
      else {
        toast.success(`${selectedCount}건 상태 변경 완료`);
        setRowSelection({});
        fetchSerials();
      }
    });
  }

  // 제조사 시리얼 인라인 수정 저장
  function handleMfSerialSave(serialId: string) {
    if (!editingMfSerial) return;
    startTransition(async () => {
      const result = await updateManufacturerSerial(serialId, editingMfSerial.value);
      if (result.error) toast.error(result.error);
      else {
        toast.success('제조사 시리얼 저장 완료');
        setEditingMfSerial(null);
        fetchSerials();
      }
    });
  }

  // 개별 바코드 일괄 부여
  function openBarcodeDialog() {
    setParentBarcodeInput(product.barcode);
    setBarcodeDialogOpen(true);
  }

  function handleAssignBarcodes() {
    if (selectedCount === 0) return;
    startTransition(async () => {
      const result = await assignUnitBarcodes(selectedIds, parentBarcodeInput);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${result.updated}건 개별 바코드 부여 완료`);
        setRowSelection({});
        setBarcodeDialogOpen(false);
        fetchSerials();
      }
    });
  }

  // 제조사 시리얼 일괄 부여
  function openMfSerialDialog() {
    setMfSerialText('');
    setMfSerialDialogOpen(true);
  }

  function handleAssignMfSerials() {
    const lines = mfSerialText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (selectedIds.length === 0) return;
    if (lines.length !== selectedIds.length) {
      toast.error(`선택 수(${selectedIds.length})와 입력 수(${lines.length})가 일치하지 않습니다`);
      return;
    }
    startTransition(async () => {
      const result = await assignManufacturerSerialsBatch(selectedIds, lines);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${result.updated}건 제조사 시리얼 부여 완료`);
        setRowSelection({});
        setMfSerialDialogOpen(false);
        fetchSerials();
      }
    });
  }

  function handleMoveLocation() {
    if (selectedCount === 0 || !moveWhId) return;
    startTransition(async () => {
      const result = await moveInventoryItemsBatch(selectedIds, moveWhId, moveLocId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${selectedCount}건 위치 변경 완료`);
        setRowSelection({});
        setLocationDialogOpen(false);
        setMoveWhId(null);
        setMoveLocId(null);
        fetchSerials();
      }
    });
  }

  function handlePrintSelected() {
    const toPrint = serials.filter((s) => rowSelection[s.id]);
    if (toPrint.length === 0) return;

    import('jsbarcode').then((mod) => {
      const JsBarcode = mod.default;
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const labelsHtml = toPrint.map((s) => {
        const svgId = `bc-${s.serial_number}`;
        return `
          <div style="display:inline-block;text-align:center;padding:8px 12px;border:1px dashed #ccc;margin:4px;page-break-inside:avoid;">
            <p style="margin:0 0 4px;font-size:11px;color:#666;">${product.name}</p>
            <svg id="${svgId}"></svg>
          </div>`;
      }).join('');

      const scriptInit = toPrint.map((s) => {
        const svgId = `bc-${s.serial_number}`;
        const bc = s.unit_barcode ?? '';
        return bc ? `JsBarcode("#${svgId}", "${bc}", { format: "CODE128", width: 1.5, height: 50, displayValue: true, fontSize: 11, margin: 4 });` : '';
      }).filter(Boolean).join('\n');

      printWindow.document.write(`
        <html><head><title>${product.name} 개별 바코드</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3/dist/JsBarcode.all.min.js"><\/script>
        </head>
        <body style="margin:0;padding:16px;font-family:sans-serif;">
          <div style="display:flex;flex-wrap:wrap;">${labelsHtml}</div>
          <script>
            window.onload = function() {
              ${scriptInit}
              setTimeout(function() { window.print(); window.close(); }, 300);
            };
          <\/script>
        </body></html>
      `);
      printWindow.document.close();
    });
  }

  const canAssignBarcode = selectedCount > 0 &&
    serials.filter((s) => rowSelection[s.id]).every((s) => !s.unit_barcode);

  const mfSerialLines = mfSerialText.split('\n').map((l) => l.trim()).filter(Boolean);

  const columns = useMemo<ColumnDef<Serial, unknown>[]>(() => [
    selectColumn<Serial>(),
    {
      accessorKey: 'serial_number',
      header: '#',
      size: 64,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">{row.original.serial_number}</span>
      ),
    },
    {
      accessorKey: 'manufacturer_serial',
      header: '제조사 시리얼',
      enableSorting: false,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <span className="font-mono text-sm text-gray-500">
            {editingMfSerial?.id === s.id ? (
              <span className="flex items-center gap-1">
                <input
                  type="text"
                  value={editingMfSerial.value}
                  onChange={(e) => setEditingMfSerial({ id: s.id, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleMfSerialSave(s.id); if (e.key === 'Escape') setEditingMfSerial(null); }}
                  autoFocus
                  className="border rounded px-1.5 py-0.5 text-sm font-mono w-36 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
                <button
                  type="button"
                  onClick={() => handleMfSerialSave(s.id)}
                  disabled={isPending}
                  className="p-0.5 rounded hover:bg-gray-100 text-green-600 disabled:opacity-50"
                >
                  <Check size={14} />
                </button>
              </span>
            ) : (
              <a
                role="button"
                className="cursor-pointer hover:underline text-blue-600"
                onClick={() => setEditingMfSerial({ id: s.id, value: s.manufacturer_serial ?? '' })}
              >
                {s.manufacturer_serial ?? <span className="text-gray-300">-</span>}
              </a>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: 'unit_barcode',
      header: '개별 바코드',
      enableSorting: false,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <span className="font-mono text-sm">
            <a
              role="button"
              className="cursor-pointer hover:underline text-blue-600"
              onClick={() => setEditingBarcode({ id: s.id, barcode: s.unit_barcode })}
            >
              {s.unit_barcode ?? <span className="text-gray-300 italic">미부여</span>}
            </a>
          </span>
        );
      },
    },
    {
      id: 'warehouse',
      header: '위치',
      enableSorting: false,
      cell: ({ row }) => {
        const s = row.original;
        if (!s.warehouses) return <span className="text-gray-300 text-xs">-</span>;
        return (
          <span className="text-xs text-muted-foreground truncate max-w-[160px] block" title={s.warehouse_locations?.full_path ?? s.warehouses.name}>
            {s.warehouse_locations ? s.warehouse_locations.full_path : s.warehouses.name}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: '상태',
      size: 96,
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={statusVariant[row.original.status]} className="text-xs">
          {statusLabel[row.original.status]}
        </Badge>
      ),
    },
    {
      accessorKey: 'created_at',
      header: '생성일',
      size: 144,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {dayjs(row.original.created_at).format('YYYY-MM-DD HH:mm')}
        </span>
      ),
    },
    {
      id: 'status_change',
      header: '상태변경',
      size: 112,
      enableSorting: false,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <Select value={s.status} onValueChange={(v) => handleStatusChange(s.id, v)} disabled={isPending}>
            <SelectTrigger className="h-7 text-xs w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((st) => (
                <SelectItem key={st} value={st}>{statusLabel[st]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
  ], [editingMfSerial, isPending]);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push('/serials')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{product.name}</h1>
          <p className="text-sm text-gray-400 font-mono truncate">{product.barcode}</p>
        </div>
      </div>

      {/* 제품 정보 + 상태 집계 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500">현재고</p>
            <p className={`text-2xl font-bold ${product.base_stock === 0 ? 'text-red-500' : ''}`}>
              {product.base_stock.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500">시리얼 총수</p>
            <p className="text-2xl font-bold">{totalSerials.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500">규격 (W×H×D)</p>
            <p className="text-sm font-medium mt-1">
              {(product.width_cm || product.height_cm || product.depth_cm)
                ? `${product.width_cm ?? '-'}×${product.height_cm ?? '-'}×${product.depth_cm ?? '-'}cm`
                : '-'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500">무게</p>
            <p className="text-sm font-medium mt-1">
              {product.weight_kg != null ? `${product.weight_kg}kg` : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 상태별 필터 버튼 */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setStatusFilter('all'); setPage(1); }}
        >
          전체 {totalSerials}
        </Button>
        {STATUSES.map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setStatusFilter(statusFilter === s ? 'all' : s); setPage(1); }}
          >
            {statusLabel[s]} {statusCounts[s] ?? 0}
          </Button>
        ))}
      </div>

      {/* 시리얼 목록 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              시리얼 목록
              <span className="ml-2 text-sm font-normal text-gray-400">{total}건</span>
            </CardTitle>
          </div>
        </CardHeader>

        {/* 일괄 작업 */}
        {selectedCount > 0 && (
          <div className="px-4 pb-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-blue-600 font-medium">{selectedCount}건 선택</span>
            <Button
              variant="outline" size="sm" className="h-7 text-xs"
              onClick={openBarcodeDialog}
              disabled={!canAssignBarcode}
              title={canAssignBarcode ? '' : '바코드가 없는 항목만 선택하세요'}
            >
              개별 바코드 부여
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openMfSerialDialog}>
              시리얼 다중 부여
            </Button>
            <Button
              variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => { setMoveWhId(null); setMoveLocId(null); setLocationDialogOpen(true); }}
            >
              <MapPin size={12} /> 위치 변경
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handlePrintSelected}>
              <Printer size={12} /> 바코드 인쇄
            </Button>
            <Select onValueChange={handleBatchStatusChange}>
              <SelectTrigger className="w-32 h-7 text-xs">
                <SelectValue placeholder="상태 일괄 변경" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={serials}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            emptyMessage={isPending ? '불러오는 중...' : '시리얼이 없습니다'}
          />

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-gray-500">
              <span>{page} / {totalPages} 페이지</span>
              <div className="flex gap-1">
                <Button
                  variant="outline" size="sm" className="h-7"
                  disabled={page <= 1 || isPending}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={14} />
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7"
                  disabled={page >= totalPages || isPending}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 개별 바코드 일괄 부여 다이얼로그 */}
      <ModalBase
        open={barcodeDialogOpen}
        onClose={() => setBarcodeDialogOpen(false)}
        title="개별 바코드 부여"
        maxWidth="sm:max-w-md"
        footer={
          <>
            <Button className="flex-1" variant="outline" size="sm" onClick={() => setBarcodeDialogOpen(false)}>
              취소
            </Button>
            <Button className="flex-1" size="sm" onClick={handleAssignBarcodes} disabled={isPending}>
              {isPending ? '처리 중...' : '부여'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            선택된 {selectedCount}건에 개별 바코드를 부여합니다
          </p>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">
              부모 바코드를 입력하세요
            </label>
            <input
              type="text"
              value={parentBarcodeInput}
              onChange={(e) => setParentBarcodeInput(e.target.value)}
              placeholder="비워두면 자동 생성"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <p className="text-xs text-gray-400 mt-1">
              결과: {parentBarcodeInput.trim() || `UB${Date.now().toString().slice(-8)}...`}-0001, -0002, ...
            </p>
          </div>
        </div>
      </ModalBase>

      {/* 제조사 시리얼 다중 부여 다이얼로그 */}
      <ModalBase
        open={mfSerialDialogOpen}
        onClose={() => setMfSerialDialogOpen(false)}
        title="제조사 시리얼 다중 부여"
        maxWidth="sm:max-w-md"
        footer={
          <>
            <Button className="flex-1" variant="outline" size="sm" onClick={() => setMfSerialDialogOpen(false)}>
              취소
            </Button>
            <Button
              className="flex-1"
              size="sm"
              onClick={handleAssignMfSerials}
              disabled={isPending || mfSerialLines.length !== selectedCount}
            >
              {isPending ? '처리 중...' : '부여'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            선택된 {selectedCount}건에 제조사 시리얼을 부여합니다. 줄바꿈으로 구분하여 입력하세요.
          </p>
          <textarea
            value={mfSerialText}
            onChange={(e) => setMfSerialText(e.target.value)}
            placeholder={`시리얼1\n시리얼2\n시리얼3`}
            rows={8}
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
          />
          <p className={`text-xs ${mfSerialLines.length === selectedCount ? 'text-green-600' : 'text-red-500'}`}>
            입력: {mfSerialLines.length}건 / 필요: {selectedCount}건
            {mfSerialLines.length === selectedCount ? ' ✓' : ''}
          </p>
        </div>
      </ModalBase>

      {/* 개별 바코드 정보 모달 */}
      <UnitBarcodeModal
        open={!!editingBarcode}
        onClose={() => setEditingBarcode(null)}
        serialId={editingBarcode?.id ?? ''}
        currentBarcode={editingBarcode?.barcode ?? null}
        productName={product.name}
        onSaved={fetchSerials}
      />

      {/* 위치 변경 다이얼로그 */}
      <ModalBase
        open={locationDialogOpen}
        onClose={() => setLocationDialogOpen(false)}
        title="위치 변경"
        maxWidth="sm:max-w-md"
        footer={
          <>
            <Button className="flex-1" variant="outline" size="sm" onClick={() => setLocationDialogOpen(false)}>
              취소
            </Button>
            <Button className="flex-1" size="sm" onClick={handleMoveLocation} disabled={isPending || !moveWhId}>
              {isPending ? '처리 중...' : '변경'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            선택된 {selectedCount}건의 위치를 변경합니다
          </p>
          <WarehouseLocationPicker
            warehouseId={moveWhId}
            locationId={moveLocId}
            onWarehouseChange={setMoveWhId}
            onLocationChange={setMoveLocId}
          />
        </div>
      </ModalBase>
    </div>
  );
}
