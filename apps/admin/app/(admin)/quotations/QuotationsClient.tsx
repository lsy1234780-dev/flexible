'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Plus, Download, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { updateQuotationStatus, deleteQuotation } from '@/actions/quotations';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import dayjs from 'dayjs';
import type { Quotation } from '@/types/database';

const statusLabel: Record<Quotation['status'], string> = {
  draft: '초안',
  sent: '발송',
  confirmed: '확정',
};

const statusVariant: Record<Quotation['status'], 'secondary' | 'default' | 'outline'> = {
  draft: 'secondary',
  sent: 'default',
  confirmed: 'outline',
};

interface Props { quotations: Quotation[]; }

type QStatusFilter = 'all' | 'draft' | 'sent' | 'confirmed';

export default function QuotationsClient({ quotations }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [qStatusFilter, setQStatusFilter] = useState<QStatusFilter>('all');

  const filteredQuotations = useMemo(() => {
    let result = quotations;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((item) =>
        item.number.toLowerCase().includes(q) ||
        (item.companies?.name ?? '').toLowerCase().includes(q),
      );
    }
    if (qStatusFilter !== 'all') {
      result = result.filter((item) => item.status === qStatusFilter);
    }
    return result;
  }, [quotations, search, qStatusFilter]);

  async function handleStatusChange(id: string, status: Quotation['status']) {
    setPendingId(id);
    const result = await updateQuotationStatus(id, status);
    if (result.error) toast.error(result.error);
    else { toast.success('상태 변경됨'); router.refresh(); }
    setPendingId(null);
  }

  async function handleDownload(id: string, number: string) {
    const res = await fetch(`/api/quotations/${id}/pdf`);
    if (!res.ok) { toast.error('PDF 생성 실패'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `견적서_${number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete(id: string, number: string) {
    if (!confirm(`견적서 ${number}을(를) 삭제하시겠습니까?`)) return;
    setDeletingId(id);
    const result = await deleteQuotation(id);
    if (result.error) toast.error(result.error);
    else { toast.success('삭제되었습니다'); router.refresh(); }
    setDeletingId(null);
  }

  const columns = useMemo<ColumnDef<Quotation, unknown>[]>(() => [
    {
      accessorKey: 'number',
      header: '견적번호',
      cell: ({ row }) => {
        const q = row.original;
        return (
          <span className={deletingId === q.id ? 'opacity-50' : ''}>
            <Link href={`/quotations/${q.id}`} className="hover:underline text-blue-600 font-mono font-medium">
              {q.number}
            </Link>
          </span>
        );
      },
    },
    {
      id: 'company',
      header: '업체명',
      accessorFn: (row) => row.companies?.name ?? '',
      cell: ({ row }) => {
        const q = row.original;
        return (
          <span className={deletingId === q.id ? 'opacity-50' : ''}>
            {q.companies ? (
              <Link
                href={`/companies/${q.companies.id}`}
                className="hover:underline text-gray-900"
              >
                {q.companies.name}
              </Link>
            ) : '-'}
          </span>
        );
      },
    },
    {
      id: 'issued_by',
      header: '발행인',
      accessorFn: (row) => row.issued_by ?? '',
      cell: ({ row }) => {
        const q = row.original;
        return (
          <span className={`text-sm text-gray-500 ${deletingId === q.id ? 'opacity-50' : ''}`}>
            {q.issued_by ? q.issued_by.split('@')[0] : '-'}
          </span>
        );
      },
    },
    {
      accessorKey: 'issued_at',
      header: '발행일',
      cell: ({ row }) => {
        const q = row.original;
        return (
          <span className={`text-sm text-gray-500 ${deletingId === q.id ? 'opacity-50' : ''}`}>
            {dayjs(q.issued_at).format('YYYY-MM-DD')}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: '상태',
      cell: ({ row }) => {
        const q = row.original;
        return (
          <span className={deletingId === q.id ? 'opacity-50' : ''}>
            <Badge variant={statusVariant[q.status]}>{statusLabel[q.status]}</Badge>
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: () => <span className="flex justify-end">관리</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const q = row.original;
        return (
          <div className={`flex justify-end gap-2 ${deletingId === q.id ? 'opacity-50' : ''}`}>
            <Select
              value={q.status}
              onValueChange={(v) => handleStatusChange(q.id, v as Quotation['status'])}
              disabled={pendingId === q.id}
            >
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">초안</SelectItem>
                <SelectItem value="sent">발송</SelectItem>
                <SelectItem value="confirmed">확정</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline" size="sm" className="h-8"
              onClick={() => handleDownload(q.id, q.number)}
            >
              <Download size={14} /> PDF
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-8 text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => handleDelete(q.id, q.number)}
              disabled={deletingId === q.id}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        );
      },
    },
  ], [pendingId, deletingId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">견적서</h1>
        <Button size="sm" onClick={() => router.push('/quotations/new')}>
          <Plus size={16} /> 견적서 작성
        </Button>
      </div>

      {/* 검색 및 필터 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="견적번호 또는 업체명 검색"
            className="h-9 pl-9"
          />
        </div>
        <div className="flex rounded-md border overflow-hidden shrink-0">
          {([['all', '전체'], ['draft', '초안'], ['sent', '발송'], ['confirmed', '확정']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setQStatusFilter(key)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-l first:border-l-0 ${
                qStatusFilter === key ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredQuotations}
          emptyMessage={search || qStatusFilter !== 'all' ? '조건에 맞는 견적서가 없습니다' : '견적서가 없습니다'}
        />
      </div>
    </div>
  );
}
