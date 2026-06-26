'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import {
  Plus, Trash2, Search, Pencil, Warehouse as WarehouseIcon,
  MapPin, Box, Layers, Grid3X3, LayoutGrid, ChevronRight,
} from 'lucide-react';
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
import { cn } from '@/lib/utils';
import {
  getLocationTree, createLocation, updateLocation, deleteLocation,
  createWarehouse, updateWarehouse, deleteWarehouse, getWarehouses,
  getInventoryAtLocation, getWarehouseInventory, upsertWarehouseInventory,
} from '@/actions/warehouses';
import { getProductsForReceiving } from '@/actions/receiving';
import { getChildType, getLocationTypeLabel } from '@/lib/warehouseUtils';
import type { Warehouse, WarehouseLocation } from '@/types/database';

// ── 상수 ──

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

const TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  zone: MapPin,
  aisle: LayoutGrid,
  rack: Grid3X3,
  level: Layers,
  bin: Box,
};

const TYPE_COLORS: Record<string, string> = {
  zone: 'bg-blue-100 text-blue-700 border-blue-200',
  aisle: 'bg-green-100 text-green-700 border-green-200',
  rack: 'bg-orange-100 text-orange-700 border-orange-200',
  level: 'bg-purple-100 text-purple-700 border-purple-200',
  bin: 'bg-gray-100 text-gray-700 border-gray-200',
};

// ── 타입 ──

interface LocationNode extends WarehouseLocation {
  children: LocationNode[];
}

type SelectedNode =
  | { kind: 'warehouse'; data: Warehouse }
  | { kind: 'location'; data: WarehouseLocation; warehouseId: string };

// ── Props ──

interface Props {
  warehouses: Warehouse[];
  onWarehousesChange: () => void;
}

const EMPTY_WH_FORM = {
  name: '', code: '', address: '', total_area: '', usable_area: '',
  warehouse_type: 'general', manager_name: '', manager_contact: '', memo: '',
};

const EMPTY_LOC_FORM = { name: '', code: '', description: '' };

export default function WarehouseTreeView({ warehouses, onWarehousesChange }: Props) {
  const [isPending, startTransition] = useTransition();

  // 선택 상태
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(
    warehouses[0]?.id ?? null,
  );
  const [tree, setTree] = useState<LocationNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  // 다이얼로그
  const [showWhDialog, setShowWhDialog] = useState(false);
  const [editingWhId, setEditingWhId] = useState<string | null>(null);
  const [whForm, setWhForm] = useState(EMPTY_WH_FORM);

  const [showLocDialog, setShowLocDialog] = useState(false);
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [parentForCreate, setParentForCreate] = useState<{ id: string | null; type: string | null }>({ id: null, type: null });
  const [locForm, setLocForm] = useState(EMPTY_LOC_FORM);

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId) ?? null;

  // 창고 선택 시 트리 로드
  const loadTree = useCallback((whId: string) => {
    startTransition(async () => {
      const data = await getLocationTree(whId);
      setTree(data as unknown as LocationNode[]);
    });
  }, []);

  useEffect(() => {
    if (selectedWarehouseId) {
      loadTree(selectedWarehouseId);
      const wh = warehouses.find((w) => w.id === selectedWarehouseId);
      if (wh) setSelectedNode({ kind: 'warehouse', data: wh });
    }
  }, [selectedWarehouseId, warehouses, loadTree]);

  // ── 창고 CRUD ──

  const openCreateWh = () => {
    setEditingWhId(null);
    setWhForm(EMPTY_WH_FORM);
    setShowWhDialog(true);
  };

  const openEditWh = (wh: Warehouse) => {
    setEditingWhId(wh.id);
    setWhForm({
      name: wh.name, code: wh.code, address: wh.address ?? '',
      total_area: wh.total_area?.toString() ?? '', usable_area: wh.usable_area?.toString() ?? '',
      warehouse_type: wh.warehouse_type, manager_name: wh.manager_name ?? '',
      manager_contact: wh.manager_contact ?? '', memo: wh.memo ?? '',
    });
    setShowWhDialog(true);
  };

  const handleWhSubmit = () => {
    if (!whForm.name.trim()) { toast.error('창고명을 입력하세요'); return; }
    if (!whForm.code.trim()) { toast.error('창고 코드를 입력하세요'); return; }
    startTransition(async () => {
      const payload = {
        name: whForm.name, code: whForm.code,
        address: whForm.address || undefined,
        total_area: whForm.total_area ? parseFloat(whForm.total_area) : undefined,
        usable_area: whForm.usable_area ? parseFloat(whForm.usable_area) : undefined,
        warehouse_type: whForm.warehouse_type,
        manager_name: whForm.manager_name || undefined,
        manager_contact: whForm.manager_contact || undefined,
        memo: whForm.memo || undefined,
      };
      const result = editingWhId
        ? await updateWarehouse(editingWhId, payload)
        : await createWarehouse(payload);
      if (result.error) { toast.error(result.error); return; }
      toast.success(editingWhId ? '수정 완료' : '창고 생성 완료');
      setShowWhDialog(false);
      onWarehousesChange();
    });
  };

  const handleWhDelete = (wh: Warehouse) => {
    if (!confirm(`"${wh.name}" 창고를 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      const result = await deleteWarehouse(wh.id);
      if (result.error) { toast.error(result.error); return; }
      toast.success('삭제 완료');
      if (selectedWarehouseId === wh.id) {
        setSelectedWarehouseId(warehouses.find((w) => w.id !== wh.id)?.id ?? null);
        setTree([]);
        setSelectedNode(null);
      }
      onWarehousesChange();
    });
  };

  // ── 로케이션 CRUD ──

  const openAddChild = (parentId: string | null, parentType: string | null) => {
    const childType = getChildType(parentType);
    if (!childType) { toast.error('bin 하위에는 추가할 수 없습니다'); return; }
    setEditingLocId(null);
    setParentForCreate({ id: parentId, type: parentType });
    setLocForm(EMPTY_LOC_FORM);
    setShowLocDialog(true);
  };

  const openEditLoc = (loc: WarehouseLocation) => {
    setEditingLocId(loc.id);
    setLocForm({ name: loc.name, code: loc.code, description: loc.description ?? '' });
    setShowLocDialog(true);
  };

  const handleLocSubmit = () => {
    if (!locForm.name.trim()) { toast.error('이름을 입력하세요'); return; }
    if (!locForm.code.trim()) { toast.error('코드를 입력하세요'); return; }
    if (!selectedWarehouseId) return;
    startTransition(async () => {
      if (editingLocId) {
        const result = await updateLocation(editingLocId, {
          name: locForm.name, code: locForm.code, description: locForm.description || undefined,
        });
        if (result.error) { toast.error(result.error); return; }
        toast.success('수정 완료');
      } else {
        const result = await createLocation({
          warehouse_id: selectedWarehouseId,
          parent_id: parentForCreate.id,
          name: locForm.name, code: locForm.code, description: locForm.description || undefined,
        });
        if (result.error) { toast.error(result.error); return; }
        toast.success(`${getLocationTypeLabel(result.type!)} 생성 완료`);
      }
      setShowLocDialog(false);
      loadTree(selectedWarehouseId);
    });
  };

  const handleLocDelete = (loc: WarehouseLocation) => {
    if (!confirm(`"${loc.name}" (${loc.code})을 삭제하시겠습니까?`)) return;
    if (!selectedWarehouseId) return;
    startTransition(async () => {
      const result = await deleteLocation(loc.id);
      if (result.error) { toast.error(result.error); return; }
      toast.success('삭제 완료');
      if (selectedNode?.kind === 'location' && selectedNode.data.id === loc.id) {
        const wh = warehouses.find((w) => w.id === selectedWarehouseId);
        if (wh) setSelectedNode({ kind: 'warehouse', data: wh });
      }
      loadTree(selectedWarehouseId);
    });
  };

  // ── 트리 노드 카운트 ──

  const nodeCount = useMemo(() => {
    let count = 0;
    const walk = (nodes: LocationNode[]) => {
      for (const n of nodes) { count++; walk(n.children); }
    };
    walk(tree);
    return count;
  }, [tree]);

  return (
    <div className="space-y-4">
      {/* ── 상단: 좌측 창고목록 + 우측 트리 ── */}
      <div className="flex gap-4 min-h-[320px]">
        {/* 좌측: 창고 목록 */}
        <Card className="w-56 shrink-0 flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">창고</CardTitle>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openCreateWh}>
                <Plus size={14} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-2 flex-1 overflow-y-auto">
            <div className="space-y-0.5">
              {warehouses.map((wh) => (
                <button
                  key={wh.id}
                  onClick={() => setSelectedWarehouseId(wh.id)}
                  className={cn(
                    'w-full text-left rounded-md px-2.5 py-2 transition-colors',
                    selectedWarehouseId === wh.id
                      ? 'bg-gray-900 text-white'
                      : 'hover:bg-gray-100 text-gray-700',
                  )}
                >
                  <div className="text-sm font-medium truncate">{wh.name}</div>
                  <div className={cn(
                    'flex items-center gap-1.5 text-xs mt-0.5',
                    selectedWarehouseId === wh.id ? 'text-gray-300' : 'text-muted-foreground',
                  )}>
                    <span className="font-mono">{wh.code}</span>
                    <span>·</span>
                    <span>{typeLabel(wh.warehouse_type)}</span>
                  </div>
                </button>
              ))}
              {warehouses.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">창고 없음</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 우측: 트리 그래프 */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                {selectedWarehouse ? `${selectedWarehouse.name} 구조` : '창고를 선택하세요'}
                {nodeCount > 0 && <span className="text-muted-foreground font-normal ml-1">({nodeCount})</span>}
              </CardTitle>
              {selectedWarehouse && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => openAddChild(null, null)}
                >
                  <Plus size={12} className="mr-1" />
                  구역 추가
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-4">
            {!selectedWarehouse ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                좌측에서 창고를 선택하세요
              </div>
            ) : tree.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                등록된 로케이션이 없습니다
              </div>
            ) : (
              <div className="inline-flex items-center gap-0 min-w-full min-h-full justify-center">
                {/* 루트 (창고) 노드 */}
                <TreeNodeCard
                  label={selectedWarehouse.name}
                  code={selectedWarehouse.code}
                  type="warehouse"
                  isSelected={selectedNode?.kind === 'warehouse' && selectedNode.data.id === selectedWarehouse.id}
                  onClick={() => setSelectedNode({ kind: 'warehouse', data: selectedWarehouse })}
                />
                {tree.length > 0 && (
                  <div className="flex items-center">
                    <div className="w-6 h-px bg-gray-300" />
                    <HorizontalTree
                      nodes={tree}
                      selectedNode={selectedNode}
                      onSelectNode={(loc) =>
                        setSelectedNode({ kind: 'location', data: loc, warehouseId: selectedWarehouse.id })
                      }
                      onAddChild={openAddChild}
                      onEdit={openEditLoc}
                      onDelete={handleLocDelete}
                      isPending={isPending}
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 하단: 선택된 노드 상세 ── */}
      {selectedNode && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              {selectedNode.kind === 'warehouse' ? (
                <WarehouseDetailPanel
                  warehouse={selectedNode.data}
                  onEdit={() => openEditWh(selectedNode.data)}
                  onDelete={() => handleWhDelete(selectedNode.data)}
                  isPending={isPending}
                />
              ) : (
                <LocationDetailPanel
                  location={selectedNode.data}
                  onEdit={() => openEditLoc(selectedNode.data)}
                  onDelete={() => handleLocDelete(selectedNode.data)}
                  onAddChild={() => openAddChild(selectedNode.data.id, selectedNode.data.type)}
                  isPending={isPending}
                />
              )}
            </CardContent>
          </Card>

          {/* 적재물류 테이블 */}
          <InventoryAtLocationPanel
            warehouseId={selectedNode.kind === 'warehouse' ? selectedNode.data.id : selectedNode.data.warehouse_id}
            locationId={selectedNode.kind === 'location' ? selectedNode.data.id : undefined}
          />
        </div>
      )}

      {/* ── 창고 다이얼로그 ── */}
      <Dialog open={showWhDialog} onOpenChange={setShowWhDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingWhId ? '창고 수정' : '새 창고 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>창고명 *</Label>
                <Input value={whForm.name} onChange={(e) => setWhForm({ ...whForm, name: e.target.value })} placeholder="인천 1창고" />
              </div>
              <div>
                <Label>코드 *</Label>
                <Input value={whForm.code} onChange={(e) => setWhForm({ ...whForm, code: e.target.value })} placeholder="WH-001" className="font-mono" />
              </div>
            </div>
            <div>
              <Label>유형</Label>
              <Select value={whForm.warehouse_type} onValueChange={(v) => setWhForm({ ...whForm, warehouse_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WAREHOUSE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>주소</Label>
              <Input value={whForm.address} onChange={(e) => setWhForm({ ...whForm, address: e.target.value })} placeholder="인천광역시 ..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>총 면적 (m²)</Label>
                <Input type="number" value={whForm.total_area} onChange={(e) => setWhForm({ ...whForm, total_area: e.target.value })} placeholder="500" />
              </div>
              <div>
                <Label>사용 가능 면적 (m²)</Label>
                <Input type="number" value={whForm.usable_area} onChange={(e) => setWhForm({ ...whForm, usable_area: e.target.value })} placeholder="400" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>관리자</Label>
                <Input value={whForm.manager_name} onChange={(e) => setWhForm({ ...whForm, manager_name: e.target.value })} placeholder="홍길동" />
              </div>
              <div>
                <Label>연락처</Label>
                <Input value={whForm.manager_contact} onChange={(e) => setWhForm({ ...whForm, manager_contact: e.target.value })} placeholder="010-1234-5678" />
              </div>
            </div>
            <div>
              <Label>메모</Label>
              <Textarea value={whForm.memo} onChange={(e) => setWhForm({ ...whForm, memo: e.target.value })} placeholder="특이사항..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWhDialog(false)}>취소</Button>
            <Button onClick={handleWhSubmit} disabled={isPending}>
              {isPending ? '저장 중...' : editingWhId ? '수정' : '생성'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 로케이션 다이얼로그 ── */}
      <Dialog open={showLocDialog} onOpenChange={setShowLocDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLocId ? '로케이션 수정' : `${getLocationTypeLabel(getChildType(parentForCreate.type) ?? 'zone')} 추가`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>이름 *</Label>
                <Input value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} placeholder="냉장 구역" />
              </div>
              <div>
                <Label>코드 *</Label>
                <Input value={locForm.code} onChange={(e) => setLocForm({ ...locForm, code: e.target.value })} placeholder="Z01" className="font-mono" />
              </div>
            </div>
            <div>
              <Label>설명</Label>
              <Input value={locForm.description} onChange={(e) => setLocForm({ ...locForm, description: e.target.value })} placeholder="선택 사항..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLocDialog(false)}>취소</Button>
            <Button onClick={handleLocSubmit} disabled={isPending}>
              {isPending ? '저장 중...' : editingLocId ? '수정' : '추가'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── 트리 노드 카드 ──

function TreeNodeCard({
  label, code, type, isSelected, onClick, className,
}: {
  label: string;
  code: string;
  type: string;
  isSelected: boolean;
  onClick: () => void;
  className?: string;
}) {
  const Icon = TYPE_ICONS[type] ?? WarehouseIcon;
  const color = TYPE_COLORS[type] ?? 'bg-gray-50 text-gray-700 border-gray-200';

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-2 text-center transition-all min-w-[80px] shrink-0',
        isSelected ? 'border-gray-900 ring-2 ring-gray-900/10 shadow-sm' : 'border-transparent hover:border-gray-300',
        color,
        className,
      )}
    >
      <Icon size={16} />
      <span className="text-xs font-medium leading-tight max-w-[80px] truncate">{label}</span>
      <span className="text-[10px] font-mono opacity-70">{code}</span>
    </button>
  );
}

// ── 수평 트리 (재귀) ──

function HorizontalTree({
  nodes, selectedNode, onSelectNode, onAddChild, onEdit, onDelete, isPending,
}: {
  nodes: LocationNode[];
  selectedNode: SelectedNode | null;
  onSelectNode: (loc: WarehouseLocation) => void;
  onAddChild: (parentId: string, parentType: string) => void;
  onEdit: (loc: WarehouseLocation) => void;
  onDelete: (loc: WarehouseLocation) => void;
  isPending: boolean;
}) {
  const multi = nodes.length > 1;

  return (
    <div className="inline-flex flex-col">
      {nodes.map((node, i) => {
        const isFirst = i === 0;
        const isLast = i === nodes.length - 1;
        const hasChildren = node.children.length > 0;

        return (
          <div key={node.id} className="flex items-stretch">
            {/* 세로선 + 가로선 연결부 */}
            {multi ? (
              <div className="flex flex-col w-4 shrink-0">
                {/* 위쪽 세로선: 첫째면 투명 */}
                <div className={cn('flex-1 w-px', isFirst ? 'bg-transparent' : 'bg-gray-300')} />
                {/* 가로 꺾임 */}
                <div className="h-px w-full bg-gray-300 shrink-0" />
                {/* 아래쪽 세로선: 마지막이면 투명 */}
                <div className={cn('flex-1 w-px', isLast ? 'bg-transparent' : 'bg-gray-300')} />
              </div>
            ) : (
              <div className="flex items-center w-4 shrink-0">
                <div className="h-px w-full bg-gray-300" />
              </div>
            )}

            {/* 노드 + 하위 */}
            <div className="flex items-center py-1">
              <TreeNodeCard
                label={node.name}
                code={node.code}
                type={node.type}
                isSelected={selectedNode?.kind === 'location' && selectedNode.data.id === node.id}
                onClick={() => onSelectNode(node)}
              />

              {hasChildren && (
                <>
                  <div className="w-4 h-px bg-gray-300 shrink-0 self-center" />
                  <HorizontalTree
                    nodes={node.children}
                    selectedNode={selectedNode}
                    onSelectNode={onSelectNode}
                    onAddChild={onAddChild}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    isPending={isPending}
                  />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 창고 상세 패널 ──

function WarehouseDetailPanel({
  warehouse, onEdit, onDelete, isPending,
}: {
  warehouse: Warehouse;
  onEdit: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WarehouseIcon size={20} className="text-gray-500" />
          <h3 className="text-lg font-semibold">{warehouse.name}</h3>
          <Badge variant="outline" className="font-mono">{warehouse.code}</Badge>
          <Badge variant={warehouse.is_active ? 'default' : 'secondary'}>
            {warehouse.is_active ? '운영중' : '비운영'}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} disabled={isPending}>
            <Pencil size={14} className="mr-1" /> 수정
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete} disabled={isPending} className="text-destructive">
            <Trash2 size={14} className="mr-1" /> 삭제
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <InfoItem label="유형" value={typeLabel(warehouse.warehouse_type)} />
        <InfoItem label="주소" value={warehouse.address ?? '-'} />
        <InfoItem label="총 면적" value={warehouse.total_area ? `${warehouse.total_area}m²` : '-'} />
        <InfoItem label="사용 가능" value={warehouse.usable_area ? `${warehouse.usable_area}m²` : '-'} />
        <InfoItem label="관리자" value={warehouse.manager_name ?? '-'} />
        <InfoItem label="연락처" value={warehouse.manager_contact ?? '-'} />
        <InfoItem label="메모" value={warehouse.memo ?? '-'} span={2} />
      </div>
    </div>
  );
}

// ── 로케이션 상세 패널 ──

function LocationDetailPanel({
  location, onEdit, onDelete, onAddChild, isPending,
}: {
  location: WarehouseLocation;
  onEdit: () => void;
  onDelete: () => void;
  onAddChild: () => void;
  isPending: boolean;
}) {
  const Icon = TYPE_ICONS[location.type] ?? Box;
  const canAdd = location.type !== 'bin';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={20} className="text-gray-500" />
          <h3 className="text-lg font-semibold">{location.name}</h3>
          <Badge variant="outline" className="font-mono">{location.code}</Badge>
          <Badge variant="secondary">{getLocationTypeLabel(location.type)}</Badge>
        </div>
        <div className="flex gap-2">
          {canAdd && (
            <Button variant="outline" size="sm" onClick={onAddChild} disabled={isPending}>
              <Plus size={14} className="mr-1" /> {getLocationTypeLabel(getChildType(location.type)!)} 추가
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onEdit} disabled={isPending}>
            <Pencil size={14} className="mr-1" /> 수정
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete} disabled={isPending} className="text-destructive">
            <Trash2 size={14} className="mr-1" /> 삭제
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <InfoItem label="경로" value={location.full_path ?? '-'} span={2} />
        <InfoItem label="설명" value={location.description ?? '-'} span={2} />
      </div>
    </div>
  );
}

// ── 적재물류 패널 ──

interface InventoryRow {
  id: string;
  productName: string;
  barcode: string;
  quantity: number;
  type: 'serial' | 'bulk';
  status: string;
}

const inventoryColumns: ColumnDef<InventoryRow, unknown>[] = [
  { accessorKey: 'productName', header: '제품명' },
  { accessorKey: 'barcode', header: '바코드', cell: ({ row }) => (
    <span className="font-mono text-xs">{row.original.barcode}</span>
  )},
  { accessorKey: 'quantity', header: '수량', cell: ({ row }) => (
    <div className="text-right font-mono">{row.original.quantity}</div>
  )},
  { accessorKey: 'type', header: '유형', size: 72, cell: ({ row }) => (
    <Badge variant="outline" className="text-[10px]">
      {row.original.type === 'serial' ? '시리얼' : '벌크'}
    </Badge>
  )},
  { accessorKey: 'status', header: '상태', size: 80 },
];

function InventoryAtLocationPanel({
  warehouseId,
  locationId,
}: {
  warehouseId: string;
  locationId?: string;
}) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 재고 추가 다이얼로그
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [products, setProducts] = useState<{ id: string; name: string; barcode: string; base_stock: number }[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [addQuantity, setAddQuantity] = useState('1');
  const [addMemo, setAddMemo] = useState('');
  const [productSearch, setProductSearch] = useState('');

  const loadInventory = useCallback(() => {
    setLoading(true);
    Promise.all([
      getInventoryAtLocation(warehouseId, locationId ?? null),
      getWarehouseInventory(warehouseId, locationId ?? null),
    ]).then(([serialItems, bulkItems]) => {
      // 시리얼 아이템: 제품별로 그룹핑해서 수량 집계
      const serialMap = new Map<string, InventoryRow>();
      for (const item of serialItems) {
        const product = item.products as { id: string; name: string; barcode: string } | null;
        if (!product) continue;
        const key = product.id;
        if (serialMap.has(key)) {
          serialMap.get(key)!.quantity += 1;
        } else {
          serialMap.set(key, {
            id: `serial-${key}`,
            productName: product.name,
            barcode: product.barcode,
            quantity: 1,
            type: 'serial',
            status: '재고',
          });
        }
      }

      // 벌크 아이템
      const bulkRows: InventoryRow[] = bulkItems.map((item) => {
        const product = item.products as { id: string; name: string; barcode: string } | null;
        return {
          id: `bulk-${item.id}`,
          productName: product?.name ?? '-',
          barcode: product?.barcode ?? '-',
          quantity: item.quantity,
          type: 'bulk' as const,
          status: '벌크',
        };
      });

      setRows([...Array.from(serialMap.values()), ...bulkRows]);
    }).finally(() => {
      setLoading(false);
    });
  }, [warehouseId, locationId]);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  function openAddDialog() {
    setSelectedProductId('');
    setAddQuantity('1');
    setAddMemo('');
    setProductSearch('');
    if (products.length === 0) {
      getProductsForReceiving().then(setProducts);
    }
    setAddDialogOpen(true);
  }

  function handleAddInventory() {
    if (!selectedProductId) { toast.error('제품을 선택하세요'); return; }
    const qty = parseInt(addQuantity, 10);
    if (!qty || qty < 1) { toast.error('수량은 1 이상이어야 합니다'); return; }
    startTransition(async () => {
      const result = await upsertWarehouseInventory({
        warehouse_id: warehouseId,
        location_id: locationId || null,
        product_id: selectedProductId,
        quantity: qty,
        memo: addMemo || undefined,
      });
      if (result.error) { toast.error(result.error); return; }
      toast.success('재고 추가 완료');
      setAddDialogOpen(false);
      loadInventory();
    });
  }

  const filteredProducts = productSearch
    ? products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.barcode.includes(productSearch))
    : products;

  const filtered = search
    ? rows.filter((r) => {
        const q = search.toLowerCase();
        return r.productName.toLowerCase().includes(q) || r.barcode.toLowerCase().includes(q);
      })
    : rows;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">적재물류 ({rows.length}건)</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="제품·바코드 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={openAddDialog}>
              <Plus size={12} className="mr-1" /> 재고 추가
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          columns={inventoryColumns}
          data={filtered}
          emptyMessage={loading ? '로딩 중...' : '이 위치에 적재된 물류가 없습니다'}
        />
      </CardContent>

      {/* 재고 추가 다이얼로그 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>벌크 재고 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>제품 검색</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="제품명 또는 바코드"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-8 text-sm"
                />
              </div>
              <div className="mt-2 max-h-40 overflow-y-auto border rounded-md">
                {filteredProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    {products.length === 0 ? '로딩 중...' : '검색 결과 없음'}
                  </p>
                ) : (
                  filteredProducts.slice(0, 50).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProductId(p.id)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between border-b last:border-b-0',
                        selectedProductId === p.id && 'bg-blue-50 text-blue-700',
                      )}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-xs font-mono text-muted-foreground shrink-0 ml-2">{p.barcode}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>수량</Label>
                <Input
                  type="number"
                  min={1}
                  value={addQuantity}
                  onChange={(e) => setAddQuantity(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>메모</Label>
                <Input
                  value={addMemo}
                  onChange={(e) => setAddMemo(e.target.value)}
                  placeholder="선택사항"
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              이 위치에 벌크(비시리얼) 재고를 추가합니다. 이미 같은 제품이 있으면 수량이 합산됩니다.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>취소</Button>
            <Button onClick={handleAddInventory} disabled={isPending || !selectedProductId}>
              {isPending ? '처리 중...' : '추가'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── 정보 항목 ──

function InfoItem({ label, value, span }: { label: string; value: string; span?: number }) {
  return (
    <div className={span ? `col-span-${span}` : ''}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm mt-0.5">{value}</p>
    </div>
  );
}
