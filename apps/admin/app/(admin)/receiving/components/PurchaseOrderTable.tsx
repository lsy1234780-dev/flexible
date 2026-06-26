'use client';

import { useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { getStageConfig } from '@/lib/inboundStages';
import type { PurchaseOrder } from '@/actions/purchaseOrders';
import dayjs from 'dayjs';

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: '미결제', color: 'bg-red-100 text-red-700' },
  partial: { label: '부분결제', color: 'bg-amber-100 text-amber-700' },
  paid: { label: '결제완료', color: 'bg-green-100 text-green-700' },
};

interface Props {
  orders: PurchaseOrder[];
  onRowClick: (order: PurchaseOrder) => void;
}

export default function PurchaseOrderTable({ orders, onRowClick }: Props) {
  const columns = useMemo<ColumnDef<PurchaseOrder, unknown>[]>(() => [
    {
      id: 'po_number',
      header: 'PO#',
      cell: ({ row }) => (
        <span className="text-sm font-mono text-gray-600">
          {row.original.po_number ?? '-'}
        </span>
      ),
    },
    {
      accessorKey: 'title',
      header: '제목',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.title}</span>
      ),
    },
    {
      id: 'supplier',
      header: '공급처',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.companies?.name ?? row.original.supplier ?? '-'}
        </span>
      ),
    },
    {
      id: 'amount',
      header: '금액',
      cell: ({ row }) => {
        const amount = row.original.total_amount;
        const currency = row.original.currency ?? 'KRW';
        if (!amount) return <span className="text-sm text-gray-300">-</span>;
        const symbol = currency === 'KRW' ? '₩' : currency === 'USD' ? '$' : currency + ' ';
        return (
          <span className="text-sm text-gray-700 font-medium">
            {symbol}{amount.toLocaleString()}
          </span>
        );
      },
    },
    {
      id: 'payment_status',
      header: '결제',
      cell: ({ row }) => {
        const status = row.original.payment_status ?? 'unpaid';
        const config = PAYMENT_STATUS_MAP[status] ?? PAYMENT_STATUS_MAP.unpaid;
        return <Badge className={config.color}>{config.label}</Badge>;
      },
    },
    {
      id: 'shipment_stage',
      header: '운송',
      cell: ({ row }) => {
        const shipments = row.original.inbound_shipments ?? [];
        if (shipments.length === 0) {
          return <span className="text-xs text-gray-300">미등록</span>;
        }
        // 가장 최근(마지막) 운송 건의 스테이지 표시
        const latest = shipments[0];
        const config = getStageConfig(latest.stage);
        return (
          <div className="flex items-center gap-1">
            <Badge className={`${config.color} text-[10px]`}>{config.label}</Badge>
            {shipments.length > 1 && (
              <span className="text-[10px] text-gray-400">+{shipments.length - 1}</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'receiving',
      header: '입고',
      cell: ({ row }) => {
        const shipments = row.original.inbound_shipments ?? [];
        const hasReceiving = shipments.some((s) => s.receiving_order_id);
        if (shipments.length === 0) {
          return <span className="text-xs text-gray-300">-</span>;
        }
        if (hasReceiving) {
          return <Badge className="bg-green-100 text-green-700 text-[10px]">입고 연결</Badge>;
        }
        return <span className="text-xs text-gray-400">미연결</span>;
      },
    },
    {
      accessorKey: 'created_at',
      header: '등록일',
      cell: ({ row }) => (
        <span className="text-sm text-gray-400">
          {dayjs(row.original.created_at).format('YY.MM.DD')}
        </span>
      ),
    },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={orders}
      onRowClick={onRowClick}
      emptyMessage="등록된 발주 건이 없습니다"
    />
  );
}
