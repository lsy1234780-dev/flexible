'use client';

import { useState, useEffect, useTransition, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Printer, ChevronLeft, ChevronRight, Search, MapPin } from 'lucide-react';
import { type ColumnDef, type RowSelectionState } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable, selectColumn } from '@/components/ui/data-table';
import { getProductSerials, updateSerialStatus, updateSerialsStatusBatch, assignUnitBarcodes, updateManufacturerSerial, assignManufacturerSerialsBatch } from '@/actions/products';
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
  product_lots: { lot_number: string; manufactured_at: string } | null;
  warehouse_id: string | null;
  location_id: string | null;
  warehouses: { id: string; name: string; code: string } | null;
  warehouse_locations: { id: string; name: string; code: string; full_path: string | null; type: string } | null;
}

interface Props {
  productId: string;
  productName: string;
  productBarcode: string;
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

const PAGE_SIZE = 20;

// ── 개별 바코드 일괄 부여 다이얼로그 (입력 state 격리) ──

function BarcodeAssignDialog({
  open,
  onClose,
  selectedIds,
  defaultBarcode,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
  defaultBarcode: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [parentBarcode, setParentBarcode] = useState('');

  useEffect(() => {
    if (open) setParentBarcode(defaultBarcode);
  }, [open, defaultBarcode]);

  function handleAssign() {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      const result = await assignUnitBarcodes(selectedIds, parentBarcode);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${result.updated}건 개별 바코드 부여 완료`);
        onDone();
      }
    });
  }

  return (
    <ModalBase
      open={open}
      onClose={onClose}
      title="개별 바코드 부여"
      maxWidth="sm:max-w-md"
      footer={
        <>
          <Button className="flex-1" variant="outline" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button className="flex-1" size="sm" onClick={handleAssign} disabled={isPending}>
            {isPending ? '처리 중...' : '부여'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          선택된 {selectedIds.length}건에 개별 바코드를 부여합니다
        </p>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">
            부모 바코드를 입력하세요
          </label>
          <input
            type="text"
            value={parentBarcode}
            onChange={(e) => setParentBarcode(e.target.value)}
            placeholder="비워두면 자동 생성"
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <p className="text-xs text-gray-400 mt-1">
            결과: {parentBarcode.trim() || 'UB...'}-0001, -0002, ...
          </p>
        </div>
      </div>
    </ModalBase>
  );
}

// ── 제조사 시리얼 일괄 부여 다이얼로그 (입력 state 격리) ──

function MfgSerialAssignDialog({
  open,
  onClose,
  selectedIds,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [input, setInput] = useState('');

  useEffect(() => {
    if (open) setInput('');
  }, [open]);

  function handleAssign() {
    const texts = input.split('\n').map((t) => t.trim());
    if (selectedIds.length === 0) return;
    if (selectedIds.length !== texts.length) {
      toast.error(`선택 수(${selectedIds.length})와 입력 수(${texts.length})가 일치하지 않습니다`);
      return;
    }
    startTransition(async () => {
      const result = await assignManufacturerSerialsBatch(selectedIds, texts);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${result.updated}건 제조사 시리얼 부여 완료`);
        onDone();
      }
    });
  }

  return (
    <ModalBase
      open={open}
      onClose={onClose}
      title="제조사 시리얼 부여"
      maxWidth="sm:max-w-md"
      footer={
        <>
          <Button className="flex-1" variant="outline" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button className="flex-1" size="sm" onClick={handleAssign} disabled={isPending}>
            {isPending ? '처리 중...' : '부여'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          선택된 {selectedIds.length}건에 제조사 시리얼을 부여합니다. 줄바꿈으로 구분하여 입력하세요.
        </p>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">
            제조사 시리얼 ({selectedIds.length}줄 입력)
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`시리얼1\n시리얼2\n시리얼3`}
            rows={Math.min(10, Math.max(3, selectedIds.length))}
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 resize-y"
          />
          <p className="text-xs text-gray-400 mt-1">
            현재 {input.split('\n').filter((l) => l.trim()).length} / {selectedIds.length}줄 입력됨
          </p>
        </div>
      </div>
    </ModalBase>
  );
}

// ── 메인 컴포넌트 ──

export default function ProductSerialsSection({ productId, productName, productBarcode }: Props) {
  const [isPending, startTransition] = useTransition();
  const [serials, setSerials] = useState<Serial[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [mfgSerialDialogOpen, setMfgSerialDialogOpen] = useState(false);
  const [editingSerial, setEditingSerial] = useState<{ id: string; barcode: string | null } | null>(null);
  const [editingMfgSerial, setEditingMfgSerial] = useState<{ id: string; value: string | null } | null>(null);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [moveWhId, setMoveWhId] = useState<string | null>(null);
  const [moveLocId, setMoveLocId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedCount = Object.keys(rowSelection).length;

  // 검색 디바운스
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchSerials = useCallback(() => {
    startTransition(async () => {
      try {
        const result = await getProductSerials(productId, {
          status: statusFilter,
          page,
          pageSize: PAGE_SIZE,
          search,
        });
        setSerials(result.serials as Serial[]);
        setTotal(result.total);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '시리얼 조회 실패');
      }
    });
  }, [productId, statusFilter, page, search]);

  useEffect(() => {
    fetchSerials();
  }, [fetchSerials]);

  useEffect(() => {
    setRowSelection({});
  }, [page, statusFilter, search]);

  function handleStatusChange(serialId: string, newStatus: string) {
    startTransition(async () => {
      const result = await updateSerialStatus(serialId, newStatus);
      if (result.error) toast.error(result.error);
      else fetchSerials();
    });
  }

  function handleBatchStatusChange(newStatus: string) {
    if (selectedCount === 0) return;
    const ids = Object.keys(rowSelection);
    startTransition(async () => {
      const result = await updateSerialsStatusBatch(ids, newStatus);
      if (result.error) toast.error(result.error);
      else {
        toast.success(`${ids.length}건 상태 변경 완료`);
        setRowSelection({});
        fetchSerials();
      }
    });
  }

  function handleBatchDone() {
    setRowSelection({});
    setBarcodeDialogOpen(false);
    setMfgSerialDialogOpen(false);
    setLocationDialogOpen(false);
    fetchSerials();
  }

  function handleMoveLocation() {
    if (selectedCount === 0 || !moveWhId) return;
    startTransition(async () => {
      const result = await moveInventoryItemsBatch(selectedIds, moveWhId, moveLocId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${selectedIds.length}건 위치 변경 완료`);
        setMoveWhId(null);
        setMoveLocId(null);
        handleBatchDone();
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
            <p style="margin:0 0 4px;font-size:11px;color:#666;">${productName}</p>
            <svg id="${svgId}"></svg>
          </div>`;
      }).join('');

      const scriptInit = toPrint.map((s) => {
        const svgId = `bc-${s.serial_number}`;
        return `JsBarcode("#${svgId}", "${s.unit_barcode}", { format: "CODE128", width: 1.5, height: 50, displayValue: true, fontSize: 11, margin: 4 });`;
      }).join('\n');

      printWindow.document.write(`
        <html><head><title>${productName} 개별 바코드</title>
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

  // serial_number 오름차순으로 정렬된 선택 ID 배열
  const selectedIds = serials
    .filter((s) => rowSelection[s.id])
    .sort((a, b) => a.serial_number - b.serial_number)
    .map((s) => s.id);

  // ── 컬럼 정의 ──
  const columns = useMemo<ColumnDef<Serial, unknown>[]>(() => [
    selectColumn<Serial>(),
    {
      accessorKey: 'serial_number',
      header: '#',
      size: 64,
      cell: ({ getValue }) => (
        <span className="text-sm text-gray-500">{getValue<number>()}</span>
      ),
    },
    {
      accessorKey: 'manufacturer_serial',
      header: '시리얼',
      enableSorting: false,
      cell: ({ row }) => (
        <a
          role="button"
          className="cursor-pointer hover:underline text-blue-600 font-mono text-sm"
          onClick={() => setEditingMfgSerial({ id: row.original.id, value: row.original.manufacturer_serial })}
        >
          {row.original.manufacturer_serial ?? <span className="text-gray-300 italic">미입력</span>}
        </a>
      ),
    },
    {
      accessorKey: 'unit_barcode',
      header: '개별 바코드',
      enableSorting: false,
      cell: ({ row }) => (
        <a
          role="button"
          className="cursor-pointer hover:underline text-blue-600 font-mono text-sm"
          onClick={() => setEditingSerial({ id: row.original.id, barcode: row.original.unit_barcode })}
        >
          {row.original.unit_barcode ?? <span className="text-gray-300 italic">미부여</span>}
        </a>
      ),
    },
    {
      id: 'lot',
      header: 'LOT',
      enableSorting: false,
      cell: ({ row }) => {
        const lot = row.original.product_lots;
        return lot ? (
          <span className="text-sm text-gray-700">{lot.lot_number}</span>
        ) : (
          <span className="text-gray-300 text-sm">—</span>
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
      cell: ({ getValue }) => {
        const status = getValue<SerialStatus>();
        return (
          <Badge variant={statusVariant[status]} className="text-xs">
            {statusLabel[status]}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'created_at',
      header: '생성일',
      size: 144,
      cell: ({ getValue }) => (
        <span className="text-sm text-gray-500">
          {dayjs(getValue<string>()).format('YYYY-MM-DD HH:mm')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '상태변경',
      size: 112,
      enableSorting: false,
      cell: ({ row }) => (
        <Select
          value={row.original.status}
          onValueChange={(v) => handleStatusChange(row.original.id, v)}
          disabled={isPending}
        >
          <SelectTrigger className="h-7 text-xs w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in_stock">재고</SelectItem>
            <SelectItem value="reserved">예약</SelectItem>
            <SelectItem value="shipped">출고</SelectItem>
            <SelectItem value="sold">판매</SelectItem>
            <SelectItem value="disposed">폐기</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
  ], [isPending]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <CardTitle className="text-base shrink-0">
            전체 재고 목록
            <span className="ml-2 text-sm font-normal text-gray-400">총 {total}건</span>
          </CardTitle>
          <div className="flex items-center gap-2 sm:ml-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="바코드·시리얼·LOT 검색"
                className="w-full sm:w-44 pl-8 pr-3 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-24 sm:w-28 h-8 text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="in_stock">재고</SelectItem>
                <SelectItem value="reserved">예약</SelectItem>
                <SelectItem value="shipped">출고</SelectItem>
                <SelectItem value="sold">판매</SelectItem>
                <SelectItem value="disposed">폐기</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* 일괄 작업 바 */}
        {selectedCount > 0 && (
          <div className="px-4 py-2 bg-blue-50 border-b flex items-center gap-2 text-sm overflow-x-auto">
            <span className="text-blue-700 font-medium shrink-0">{selectedCount}건 선택</span>
            <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => setMfgSerialDialogOpen(true)}>
              시리얼 부여
            </Button>
            <Button
              variant="outline" size="sm" className="h-7 text-xs shrink-0"
              onClick={() => setBarcodeDialogOpen(true)}
            >
              바코드 부여
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={handlePrintSelected}>
              <Printer size={12} /> 인쇄
            </Button>
            <Button
              variant="outline" size="sm" className="h-7 text-xs shrink-0"
              onClick={() => { setMoveWhId(null); setMoveLocId(null); setLocationDialogOpen(true); }}
            >
              <MapPin size={12} /> 위치 변경
            </Button>
            <Select onValueChange={handleBatchStatusChange}>
              <SelectTrigger className="w-28 h-7 text-xs shrink-0">
                <SelectValue placeholder="상태 변경" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_stock">재고</SelectItem>
                <SelectItem value="reserved">예약</SelectItem>
                <SelectItem value="shipped">출고</SelectItem>
                <SelectItem value="sold">판매</SelectItem>
                <SelectItem value="disposed">폐기</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="overflow-x-auto">
        <DataTable
          columns={columns}
          data={serials}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          emptyMessage={isPending ? '불러오는 중...' : search ? '검색 결과가 없습니다' : '재고가 없습니다'}
        />
        </div>

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

      {/* 개별 바코드 일괄 부여 다이얼로그 */}
      <BarcodeAssignDialog
        open={barcodeDialogOpen}
        onClose={() => setBarcodeDialogOpen(false)}
        selectedIds={selectedIds}
        defaultBarcode={productBarcode}
        onDone={handleBatchDone}
      />

      {/* 제조사 시리얼 일괄 부여 다이얼로그 */}
      <MfgSerialAssignDialog
        open={mfgSerialDialogOpen}
        onClose={() => setMfgSerialDialogOpen(false)}
        selectedIds={selectedIds}
        onDone={handleBatchDone}
      />

      {/* 개별 바코드 정보 모달 */}
      <UnitBarcodeModal
        open={!!editingSerial}
        onClose={() => setEditingSerial(null)}
        serialId={editingSerial?.id ?? ''}
        currentBarcode={editingSerial?.barcode ?? null}
        productName={productName}
        onSaved={fetchSerials}
      />

      {/* 제조사 시리얼 정보 모달 */}
      <UnitBarcodeModal
        open={!!editingMfgSerial}
        onClose={() => setEditingMfgSerial(null)}
        serialId={editingMfgSerial?.id ?? ''}
        currentBarcode={editingMfgSerial?.value ?? null}
        productName={productName}
        onSaved={fetchSerials}
        title="제조사 시리얼 정보"
        label="시리얼"
        placeholder="비워두면 시리얼 제거"
        onSave={updateManufacturerSerial}
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
    </Card>
  );
}
