'use client';

import { useMemo, useState, useTransition } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Plus, Trash2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { createLot, deleteLot, getLots } from '@/actions/lots';
import dayjs from 'dayjs';

interface Lot {
  id: string;
  lot_number: string;
  product_id: string;
  manufactured_at: string;
  received_at: string | null;
  quantity: number;
  memo: string | null;
  created_at: string;
  products: { name: string; barcode: string } | null;
}

interface Product {
  id: string;
  name: string;
  barcode: string;
  base_stock: number;
}

interface Props {
  initialLots: Lot[];
  products: Product[];
}

export default function LotsClient({ initialLots, products }: Props) {
  const [lots, setLots] = useState<Lot[]>(initialLots);
  const [isPending, startTransition] = useTransition();

  // 필터
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProductId, setFilterProductId] = useState<string>('all');

  // 생성 다이얼로그
  const [showCreate, setShowCreate] = useState(false);
  const [newLot, setNewLot] = useState({
    product_id: '',
    manufactured_at: dayjs().format('YYYY-MM-DD'),
    received_at: dayjs().format('YYYY-MM-DD'),
    quantity: 0,
    memo: '',
  });

  const columns = useMemo<ColumnDef<Lot, unknown>[]>(() => [
    {
      accessorKey: 'lot_number',
      header: 'LOT 번호',
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono">
          {row.original.lot_number}
        </Badge>
      ),
    },
    {
      id: 'product',
      header: '제품',
      cell: ({ row }) => (
        <div>
          <div>{row.original.products?.name ?? '-'}</div>
          <div className="text-xs text-muted-foreground">{row.original.products?.barcode}</div>
        </div>
      ),
    },
    {
      accessorKey: 'manufactured_at',
      header: '제조일',
      cell: ({ row }) => dayjs(row.original.manufactured_at).format('YYYY-MM-DD'),
    },
    {
      accessorKey: 'received_at',
      header: '입고일',
      cell: ({ row }) =>
        row.original.received_at ? dayjs(row.original.received_at).format('YYYY-MM-DD') : '-',
    },
    {
      accessorKey: 'quantity',
      header: '수량',
      meta: { className: 'text-right font-mono' },
      cell: ({ row }) => (
        <div className="text-right font-mono">{row.original.quantity}</div>
      ),
    },
    {
      accessorKey: 'memo',
      header: '메모',
      cell: ({ row }) => (
        <div className="max-w-[200px] truncate text-muted-foreground">
          {row.original.memo ?? '-'}
        </div>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">작업</div>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row.original.id, row.original.lot_number);
            }}
            disabled={isPending}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ], [isPending]);

  const filteredLots = lots.filter((lot) => {
    const product = lot.products;
    const matchesSearch = !searchQuery
      || lot.lot_number.toLowerCase().includes(searchQuery.toLowerCase())
      || product?.name.toLowerCase().includes(searchQuery.toLowerCase())
      || product?.barcode.includes(searchQuery);
    const matchesProduct = filterProductId === 'all' || lot.product_id === filterProductId;
    return matchesSearch && matchesProduct;
  });

  const refreshLots = () => {
    startTransition(async () => {
      const data = await getLots();
      setLots(data as unknown as Lot[]);
    });
  };

  const handleCreate = () => {
    if (!newLot.product_id) {
      toast.error('제품을 선택하세요');
      return;
    }
    if (newLot.quantity <= 0) {
      toast.error('수량은 1 이상이어야 합니다');
      return;
    }

    startTransition(async () => {
      const result = await createLot({
        product_id: newLot.product_id,
        manufactured_at: newLot.manufactured_at,
        received_at: newLot.received_at || undefined,
        quantity: newLot.quantity,
        memo: newLot.memo || undefined,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${result.lot_number} 생성 완료`);
        setShowCreate(false);
        setNewLot({
          product_id: '',
          manufactured_at: dayjs().format('YYYY-MM-DD'),
          received_at: dayjs().format('YYYY-MM-DD'),
          quantity: 0,
          memo: '',
        });
        refreshLots();
      }
    });
  };

  const handleDelete = (lotId: string, lotNumber: string) => {
    if (!confirm(`${lotNumber}를 삭제하시겠습니까?`)) return;

    startTransition(async () => {
      const result = await deleteLot(lotId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('삭제 완료');
        refreshLots();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">LOT 관리</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} className="mr-1" />
          LOT 생성
        </Button>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="LOT·제품·바코드 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-10"
          />
        </div>
        <Select value={filterProductId} onValueChange={setFilterProductId}>
          <SelectTrigger className="w-28 sm:w-40 h-9 shrink-0">
            <SelectValue placeholder="전체 제품" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 제품</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* LOT 목록 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">LOT 목록 ({filteredLots.length}건)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <DataTable
              columns={columns}
              data={filteredLots}
              emptyMessage="LOT 데이터가 없습니다"
            />
          </div>
        </CardContent>
      </Card>

      {/* LOT 생성 다이얼로그 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>LOT 생성</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>제품</Label>
              <Select value={newLot.product_id} onValueChange={(v) => setNewLot({ ...newLot, product_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="제품 선택..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.barcode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>제조일</Label>
                <Input
                  type="date"
                  value={newLot.manufactured_at}
                  onChange={(e) => setNewLot({ ...newLot, manufactured_at: e.target.value })}
                />
              </div>
              <div>
                <Label>입고일</Label>
                <Input
                  type="date"
                  value={newLot.received_at}
                  onChange={(e) => setNewLot({ ...newLot, received_at: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>수량</Label>
              <Input
                type="number"
                min={1}
                value={newLot.quantity || ''}
                onChange={(e) => setNewLot({ ...newLot, quantity: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>메모 (선택)</Label>
              <Input
                value={newLot.memo}
                onChange={(e) => setNewLot({ ...newLot, memo: e.target.value })}
                placeholder="LOT 관련 메모..."
              />
            </div>
            <div className="text-sm text-muted-foreground">
              LOT 번호: <span className="font-mono font-bold">
                {newLot.manufactured_at ? `LOT-${dayjs(newLot.manufactured_at).format('YYMMDD')}` : '-'}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>취소</Button>
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending ? '생성 중...' : '생성'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
