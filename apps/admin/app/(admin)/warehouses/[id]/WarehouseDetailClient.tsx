'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Trash2, ChevronRight, ChevronDown, Pencil, Search,
  MapPin, Box, Layers, Grid3X3, LayoutGrid, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { DataTable } from '@/components/ui/data-table';
import { type ColumnDef } from '@tanstack/react-table';
import {
  createLocation, deleteLocation, updateLocation, getLocationTree,
  getInventoryAtLocation, getWarehouseInventory, upsertWarehouseInventory,
} from '@/actions/warehouses';
import { getProductsForReceiving } from '@/actions/receiving';
import RecordThread from '@/components/RecordThread';
import ShareToChat from '@/components/ShareToChat';
import { getChildType, getLocationTypeLabel } from '@/lib/warehouseUtils';
import { cn } from '@/lib/utils';
import type { Warehouse, WarehouseLocation } from '@/types/database';

const TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  zone: MapPin,
  aisle: LayoutGrid,
  rack: Grid3X3,
  level: Layers,
  bin: Box,
};

const TYPE_COLORS: Record<string, string> = {
  zone: 'bg-blue-100 text-blue-800',
  aisle: 'bg-green-100 text-green-800',
  rack: 'bg-orange-100 text-orange-800',
  level: 'bg-purple-100 text-purple-800',
  bin: 'bg-gray-100 text-gray-800',
};

interface LocationNode extends WarehouseLocation {
  children: LocationNode[];
}

interface Props {
  warehouse: Warehouse;
  initialLocationTree: LocationNode[];
}

const EMPTY_LOC_FORM = { name: '', code: '', description: '' };

export default function WarehouseDetailClient({ warehouse, initialLocationTree }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tree, setTree] = useState<LocationNode[]>(initialLocationTree);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  // 로케이션 생성/수정 다이얼로그
  const [showLocDialog, setShowLocDialog] = useState(false);
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [parentForCreate, setParentForCreate] = useState<{ id: string | null; type: string | null }>({ id: null, type: null });
  const [locForm, setLocForm] = useState(EMPTY_LOC_FORM);

  const refreshTree = () => {
    startTransition(async () => {
      const data = await getLocationTree(warehouse.id);
      setTree(data as unknown as LocationNode[]);
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set<string>();
    const collect = (nodes: LocationNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) allIds.add(node.id);
        collect(node.children);
      }
    };
    collect(tree);
    setExpanded(allIds);
  };

  const collapseAll = () => setExpanded(new Set());

  // 총 로케이션 수 카운트
  const countNodes = (nodes: LocationNode[]): number => {
    let count = 0;
    for (const node of nodes) {
      count += 1 + countNodes(node.children);
    }
    return count;
  };

  // 하위 추가 버튼
  const openAddChild = (parentId: string | null, parentType: string | null) => {
    const childType = getChildType(parentType);
    if (!childType) {
      toast.error('bin 하위에는 추가할 수 없습니다');
      return;
    }
    setEditingLocId(null);
    setParentForCreate({ id: parentId, type: parentType });
    setLocForm(EMPTY_LOC_FORM);
    setShowLocDialog(true);
  };

  const openEditLoc = (loc: WarehouseLocation) => {
    setEditingLocId(loc.id);
    setParentForCreate({ id: loc.parent_id, type: null });
    setLocForm({
      name: loc.name,
      code: loc.code,
      description: loc.description ?? '',
    });
    setShowLocDialog(true);
  };

  const handleLocSubmit = () => {
    if (!locForm.name.trim()) { toast.error('이름을 입력하세요'); return; }
    if (!locForm.code.trim()) { toast.error('코드를 입력하세요'); return; }

    startTransition(async () => {
      if (editingLocId) {
        const result = await updateLocation(editingLocId, {
          name: locForm.name,
          code: locForm.code,
          description: locForm.description || undefined,
        });
        if (result.error) { toast.error(result.error); return; }
        toast.success('수정 완료');
      } else {
        const result = await createLocation({
          warehouse_id: warehouse.id,
          parent_id: parentForCreate.id,
          name: locForm.name,
          code: locForm.code,
          description: locForm.description || undefined,
        });
        if (result.error) { toast.error(result.error); return; }
        toast.success(`${getLocationTypeLabel(result.type!)} 생성 완료`);
        // 부모 노드 자동 펼치기
        if (parentForCreate.id) {
          setExpanded((prev) => new Set(prev).add(parentForCreate.id!));
        }
      }
      setShowLocDialog(false);
      refreshTree();
    });
  };

  const handleLocDelete = (loc: WarehouseLocation) => {
    if (!confirm(`"${loc.name}" (${loc.code})을 삭제하시겠습니까?`)) return;

    startTransition(async () => {
      const result = await deleteLocation(loc.id);
      if (result.error) { toast.error(result.error); return; }
      toast.success('삭제 완료');
      refreshTree();
    });
  };

  const childTypeLabel = getChildType(null);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/warehouses')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900 truncate">{warehouse.name}</h1>
            <Badge variant="outline" className="font-mono">{warehouse.code}</Badge>
            <Badge variant={warehouse.is_active ? 'default' : 'secondary'}>
              {warehouse.is_active ? '운영중' : '비운영'}
            </Badge>
          </div>
          {warehouse.address && (
            <p className="text-sm text-muted-foreground mt-0.5">{warehouse.address}</p>
          )}
        </div>
        <ShareToChat entityType="warehouse" entityId={warehouse.id} label={warehouse.name} className="shrink-0" />
      </div>

      {/* 창고 정보 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {warehouse.warehouse_type && (
          <InfoCard label="유형" value={warehouse.warehouse_type === 'general' ? '일반' : warehouse.warehouse_type} />
        )}
        {warehouse.total_area && (
          <InfoCard label="총 면적" value={`${warehouse.total_area}m²`} />
        )}
        {warehouse.usable_area && (
          <InfoCard label="사용 가능" value={`${warehouse.usable_area}m²`} />
        )}
        {warehouse.manager_name && (
          <InfoCard label="관리자" value={`${warehouse.manager_name}${warehouse.manager_contact ? ` (${warehouse.manager_contact})` : ''}`} />
        )}
      </div>

      {/* 로케이션 트리 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">로케이션 ({countNodes(tree)}개)</CardTitle>
            <div className="flex gap-2">
              {tree.length > 0 && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={expandAll} title="전체 펼치기">
                    <ChevronsUpDown size={16} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={collapseAll} title="전체 접기">
                    <ChevronsDownUp size={16} />
                  </Button>
                </>
              )}
              <Button size="sm" onClick={() => openAddChild(null, null)}>
                <Plus size={14} className="mr-1" />
                구역 추가
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {tree.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MapPin className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">등록된 로케이션이 없습니다</p>
              <p className="text-xs mt-1">구역(Zone)을 먼저 추가하세요</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {tree.map((node) => (
                <LocationTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  toggleExpand={toggleExpand}
                  selectedId={selectedLocationId}
                  onSelect={setSelectedLocationId}
                  onAddChild={openAddChild}
                  onEdit={openEditLoc}
                  onDelete={handleLocDelete}
                  isPending={isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 적재물류 */}
      <InventoryAtLocationPanel
        warehouseId={warehouse.id}
        locationId={selectedLocationId ?? undefined}
        locationName={selectedLocationId ? findLocationName(tree, selectedLocationId) : undefined}
        onClearLocation={() => setSelectedLocationId(null)}
      />

      {/* 레코드 스레드 — 이 창고에 붙는 대화 + 역링크 */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <RecordThread entityType="warehouse" entityId={warehouse.id} entityLabel={warehouse.name} />
        </CardContent>
      </Card>

      {/* 로케이션 생성/수정 다이얼로그 */}
      <Dialog open={showLocDialog} onOpenChange={setShowLocDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLocId
                ? '로케이션 수정'
                : `${getLocationTypeLabel(getChildType(parentForCreate.type) ?? 'zone')} 추가`
              }
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>이름 *</Label>
                <Input
                  value={locForm.name}
                  onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                  placeholder="냉장 구역"
                />
              </div>
              <div>
                <Label>코드 *</Label>
                <Input
                  value={locForm.code}
                  onChange={(e) => setLocForm({ ...locForm, code: e.target.value })}
                  placeholder="Z01"
                  className="font-mono"
                />
              </div>
            </div>
            <div>
              <Label>설명</Label>
              <Input
                value={locForm.description}
                onChange={(e) => setLocForm({ ...locForm, description: e.target.value })}
                placeholder="선택 사항..."
              />
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

// ── 트리 노드 컴포넌트 ──

function LocationTreeNode({
  node,
  depth,
  expanded,
  toggleExpand,
  selectedId,
  onSelect,
  onAddChild,
  onEdit,
  onDelete,
  isPending,
}: {
  node: LocationNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddChild: (parentId: string, parentType: string) => void;
  onEdit: (loc: WarehouseLocation) => void;
  onDelete: (loc: WarehouseLocation) => void;
  isPending: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const canAddChild = node.type !== 'bin';
  const Icon = TYPE_ICONS[node.type] ?? Box;
  const colorClass = TYPE_COLORS[node.type] ?? '';

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 group cursor-pointer',
          selectedId === node.id ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50',
        )}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
        onClick={() => onSelect(selectedId === node.id ? null : node.id)}
      >
        {/* 접기/펼치기 */}
        {hasChildren ? (
          <button
            className="w-5 h-5 flex items-center justify-center shrink-0 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5 h-5 flex items-center justify-center shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          </span>
        )}

        {/* 타입 뱃지 */}
        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 shrink-0 ${colorClass}`}>
          <Icon size={12} className="mr-0.5" />
          {getLocationTypeLabel(node.type)}
        </Badge>

        {/* 코드 + 이름 */}
        <span className="font-mono text-sm text-muted-foreground shrink-0">{node.code}</span>
        <span className="text-sm font-medium truncate">{node.name}</span>

        {node.description && (
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
            — {node.description}
          </span>
        )}

        {/* 액션 버튼 (hover시 표시) */}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
          {canAddChild && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onAddChild(node.id, node.type)}
              disabled={isPending}
              title={`${getLocationTypeLabel(getChildType(node.type)!)} 추가`}
            >
              <Plus size={12} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onEdit(node)}
            disabled={isPending}
          >
            <Pencil size={12} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onDelete(node)}
            disabled={isPending}
          >
            <Trash2 size={12} className="text-destructive" />
          </Button>
        </div>
      </div>

      {/* 하위 노드 */}
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <LocationTreeNode
              key={child.id}
              node={child as LocationNode}
              depth={depth + 1}
              expanded={expanded}
              toggleExpand={toggleExpand}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              isPending={isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 헬퍼: 트리에서 로케이션 이름 찾기 ──

function findLocationName(nodes: LocationNode[], id: string): string | undefined {
  for (const node of nodes) {
    if (node.id === id) return node.full_path ?? node.name;
    const found = findLocationName(node.children, id);
    if (found) return found;
  }
  return undefined;
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
  locationName,
  onClearLocation,
}: {
  warehouseId: string;
  locationId?: string;
  locationName?: string;
  onClearLocation: () => void;
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
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">적재물류 ({rows.length}건)</CardTitle>
            {locationName && (
              <Badge variant="outline" className="text-xs font-normal">
                {locationName}
                <button onClick={onClearLocation} className="ml-1 text-gray-400 hover:text-gray-600">&times;</button>
              </Badge>
            )}
            {!locationId && (
              <span className="text-xs text-muted-foreground">전체 창고</span>
            )}
          </div>
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

// ── 정보 카드 ──

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
