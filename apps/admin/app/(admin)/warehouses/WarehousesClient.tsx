'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Plus, Trash2, Search, Pencil, List, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  createWarehouse, deleteWarehouse, getWarehouses, updateWarehouse,
} from '@/actions/warehouses';
import { cn } from '@/lib/utils';
import type { Warehouse } from '@/types/database';
import WarehouseTreeView from './WarehouseTreeView';

const WAREHOUSE_TYPES: { value: string; label: string }[] = [
  { value: 'general', label: '일반' },
  { value: 'cold', label: '냉장' },
  { value: 'frozen', label: '냉동' },
  { value: 'hazardous', label: '위험물' },
  { value: 'outdoor', label: '야외' },
];

function typeLabel(type: string) {
  return WAREHOUSE_TYPES.find((t) => t.value === type)?.label ?? type;
}

interface Props {
  initialWarehouses: Warehouse[];
}

const EMPTY_FORM = {
  name: '',
  code: '',
  address: '',
  total_area: '',
  usable_area: '',
  warehouse_type: 'general',
  manager_name: '',
  manager_contact: '',
  memo: '',
};

export default function WarehousesClient({ initialWarehouses }: Props) {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>(initialWarehouses);
  const [isPending, startTransition] = useTransition();

  const [viewMode, setViewMode] = useState<'list' | 'tree'>('tree');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const columns = useMemo<ColumnDef<Warehouse, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: '코드',
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono">
          {row.original.code}
        </Badge>
      ),
    },
    {
      accessorKey: 'name',
      header: '창고명',
    },
    {
      accessorKey: 'warehouse_type',
      header: '유형',
      cell: ({ row }) => typeLabel(row.original.warehouse_type),
    },
    {
      accessorKey: 'address',
      header: '주소',
      cell: ({ row }) => (
        <div className="max-w-[200px] truncate text-muted-foreground">
          {row.original.address ?? '-'}
        </div>
      ),
    },
    {
      id: 'area',
      header: '면적',
      cell: ({ row }) => {
        const { total_area, usable_area } = row.original;
        if (!total_area) return '-';
        return (
          <div className="text-sm">
            {total_area}m²
            {usable_area ? <span className="text-muted-foreground"> (사용 {usable_area}m²)</span> : null}
          </div>
        );
      },
    },
    {
      id: 'manager',
      header: '관리자',
      cell: ({ row }) => row.original.manager_name ?? '-',
    },
    {
      accessorKey: 'is_active',
      header: '상태',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'default' : 'secondary'}>
          {row.original.is_active ? '운영중' : '비운영'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">작업</div>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row.original);
            }}
            disabled={isPending}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row.original);
            }}
            disabled={isPending}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ], [isPending]);

  const filteredWarehouses = warehouses.filter((wh) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      wh.name.toLowerCase().includes(q) ||
      wh.code.toLowerCase().includes(q) ||
      (wh.address?.toLowerCase().includes(q))
    );
  });

  const refreshWarehouses = () => {
    startTransition(async () => {
      const data = await getWarehouses();
      setWarehouses(data as unknown as Warehouse[]);
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  };

  const openEdit = (wh: Warehouse) => {
    setEditingId(wh.id);
    setForm({
      name: wh.name,
      code: wh.code,
      address: wh.address ?? '',
      total_area: wh.total_area?.toString() ?? '',
      usable_area: wh.usable_area?.toString() ?? '',
      warehouse_type: wh.warehouse_type,
      manager_name: wh.manager_name ?? '',
      manager_contact: wh.manager_contact ?? '',
      memo: wh.memo ?? '',
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error('창고명을 입력하세요'); return; }
    if (!form.code.trim()) { toast.error('창고 코드를 입력하세요'); return; }

    startTransition(async () => {
      const payload = {
        name: form.name,
        code: form.code,
        address: form.address || undefined,
        total_area: form.total_area ? parseFloat(form.total_area) : undefined,
        usable_area: form.usable_area ? parseFloat(form.usable_area) : undefined,
        warehouse_type: form.warehouse_type,
        manager_name: form.manager_name || undefined,
        manager_contact: form.manager_contact || undefined,
        memo: form.memo || undefined,
      };

      const result = editingId
        ? await updateWarehouse(editingId, payload)
        : await createWarehouse(payload);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(editingId ? '수정 완료' : '창고 생성 완료');
        setShowDialog(false);
        refreshWarehouses();
      }
    });
  };

  const handleDelete = (wh: Warehouse) => {
    if (!confirm(`"${wh.name}" 창고를 삭제하시겠습니까?`)) return;

    startTransition(async () => {
      const result = await deleteWarehouse(wh.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('삭제 완료');
        refreshWarehouses();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">창고 관리</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('tree')}
              className={cn(
                'px-2.5 py-1.5 text-sm transition-colors',
                viewMode === 'tree' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-100',
              )}
            >
              <GitBranch size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'px-2.5 py-1.5 text-sm transition-colors',
                viewMode === 'list' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-100',
              )}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'tree' ? (
        <WarehouseTreeView warehouses={warehouses} onWarehousesChange={refreshWarehouses} />
      ) : (
        <>
          {/* 검색 */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="코드·이름·주소 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-10"
            />
          </div>

          {/* 창고 목록 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">창고 목록 ({filteredWarehouses.length}건)</CardTitle>
                <Button size="sm" onClick={openCreate}>
                  <Plus size={16} className="mr-1" />
                  창고 추가
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <DataTable
                  columns={columns}
                  data={filteredWarehouses}
                  emptyMessage="등록된 창고가 없습니다"
                  onRowClick={(row) => router.push(`/warehouses/${row.id}`)}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* 생성/수정 다이얼로그 */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? '창고 수정' : '새 창고 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>창고명 *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="인천 1창고"
                />
              </div>
              <div>
                <Label>코드 *</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="WH-001"
                  className="font-mono"
                />
              </div>
            </div>
            <div>
              <Label>유형</Label>
              <Select value={form.warehouse_type} onValueChange={(v) => setForm({ ...form, warehouse_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WAREHOUSE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>주소</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="인천광역시 ..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>총 면적 (m²)</Label>
                <Input
                  type="number"
                  value={form.total_area}
                  onChange={(e) => setForm({ ...form, total_area: e.target.value })}
                  placeholder="500"
                />
              </div>
              <div>
                <Label>사용 가능 면적 (m²)</Label>
                <Input
                  type="number"
                  value={form.usable_area}
                  onChange={(e) => setForm({ ...form, usable_area: e.target.value })}
                  placeholder="400"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>관리자</Label>
                <Input
                  value={form.manager_name}
                  onChange={(e) => setForm({ ...form, manager_name: e.target.value })}
                  placeholder="홍길동"
                />
              </div>
              <div>
                <Label>연락처</Label>
                <Input
                  value={form.manager_contact}
                  onChange={(e) => setForm({ ...form, manager_contact: e.target.value })}
                  placeholder="010-1234-5678"
                />
              </div>
            </div>
            <div>
              <Label>메모</Label>
              <Textarea
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                placeholder="특이사항..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? '저장 중...' : editingId ? '수정' : '생성'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
