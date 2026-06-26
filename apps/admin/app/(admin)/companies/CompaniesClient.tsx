'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Search } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createCompany, updateCompanyStatus } from '@/actions/companies';
import dayjs from 'dayjs';
import type { Company } from '@/types/database';

const statusLabel: Record<Company['status'], string> = {
  pending: '승인대기',
  active: '활성',
  suspended: '정지',
};

const statusVariant: Record<Company['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  active: 'default',
  suspended: 'destructive',
};

interface Props { companies: Company[]; }

type StatusFilter = 'all' | 'pending' | 'active' | 'suspended';

interface RoleFilters {
  supplier: boolean;
  customer: boolean;
}

export default function CompaniesClient({ companies }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilters, setRoleFilters] = useState<RoleFilters>({ supplier: false, customer: false });

  const filteredCompanies = useMemo(() => {
    let result = companies;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }
    if (roleFilters.supplier) {
      result = result.filter((c) => c.is_supplier);
    }
    if (roleFilters.customer) {
      result = result.filter((c) => c.is_customer);
    }
    return result;
  }, [companies, search, statusFilter, roleFilters]);

  function handleStatusChange(id: string, status: Company['status']) {
    startTransition(async () => {
      const result = await updateCompanyStatus(id, status);
      if (result.error) toast.error(result.error);
      else { toast.success('상태가 변경되었습니다'); router.refresh(); }
    });
  }

  const columns = useMemo<ColumnDef<Company, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: '업체명',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      id: 'roles',
      header: '구분',
      cell: ({ row }) => (
        <div className="flex gap-1">
          {row.original.is_supplier && <Badge variant="secondary">공급처</Badge>}
          {row.original.is_customer && <Badge variant="outline">고객사</Badge>}
          {!row.original.is_supplier && !row.original.is_customer && (
            <span className="text-xs text-gray-400">미지정</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: '상태',
      cell: ({ row }) => (
        <Badge variant={statusVariant[row.original.status]}>
          {statusLabel[row.original.status]}
        </Badge>
      ),
    },
    {
      accessorKey: 'created_at',
      header: '등록일',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {dayjs(row.original.created_at).format('YYYY-MM-DD')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="flex justify-end">관리</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <Select
            value={row.original.status}
            onValueChange={(v) => handleStatusChange(row.original.id, v as Company['status'])}
            disabled={isPending}
          >
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">승인대기</SelectItem>
              <SelectItem value="active">활성</SelectItem>
              <SelectItem value="suspended">정지</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ),
    },
  ], [isPending]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const result = await createCompany(formData);
    if (result.error) { toast.error(result.error); return; }
    toast.success('업체가 등록되었습니다');
    setCreateOpen(false);
    router.refresh();
  }

  const emptyMessage = search || statusFilter !== 'all' || roleFilters.supplier || roleFilters.customer
    ? '조건에 맞는 업체가 없습니다'
    : '등록된 업체가 없습니다';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">거래처 관리</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> 거래처 등록
        </Button>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="업체명 검색"
          className="h-9 pl-9"
        />
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2.5 rounded-lg border bg-white px-3 py-1.5">
          <span className="text-[11px] text-gray-400 font-medium">구분</span>
          {([['supplier', '공급처'], ['customer', '고객사']] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={roleFilters[key]}
                onChange={(e) => setRoleFilters((prev) => ({ ...prev, [key]: e.target.checked }))}
                className="rounded border-gray-300"
              />
              {label}
            </label>
          ))}
        </div>
        <div className="flex rounded-md border overflow-hidden shrink-0">
          {([['all', '전체'], ['pending', '대기'], ['active', '활성'], ['suspended', '정지']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-2.5 py-2 text-xs font-medium transition-colors border-l first:border-l-0 ${
                statusFilter === key ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <DataTable
          columns={columns}
          data={filteredCompanies}
          onRowClick={(c) => router.push(`/companies/${c.id}`)}
          emptyMessage={emptyMessage}
        />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>업체 등록</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">업체명</Label>
              <Input id="name" name="name" placeholder="예) AA유통" required />
            </div>
            <div className="space-y-1.5">
              <Label>구분</Label>
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_supplier" value="true" className="rounded" />
                  공급처
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_customer" value="true" defaultChecked className="rounded" />
                  고객사
                </label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>초기 상태</Label>
              <Select name="status" defaultValue="pending">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">승인대기</SelectItem>
                  <SelectItem value="active">활성</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full">등록</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
