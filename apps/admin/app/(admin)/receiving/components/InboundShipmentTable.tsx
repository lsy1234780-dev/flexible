'use client';

import { useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { getStageConfig, getShippingTypeLabel } from '@/lib/inboundStages';
import dayjs from 'dayjs';
import type { InboundShipment } from '@/actions/inboundShipments';

interface Props {
  shipments: InboundShipment[];
  onRowClick: (shipment: InboundShipment) => void;
}

export default function InboundShipmentTable({ shipments, onRowClick }: Props) {
  const columns = useMemo<ColumnDef<InboundShipment, unknown>[]>(() => [
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
          {row.original.purchase_orders?.supplier ?? '-'}
        </span>
      ),
    },
    {
      id: 'shipping_type',
      header: '운송',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {getShippingTypeLabel(row.original.shipping_type)}
        </span>
      ),
    },
    {
      id: 'stage',
      header: '스테이지',
      cell: ({ row }) => {
        const config = getStageConfig(row.original.stage);
        return <Badge className={config.color}>{config.label}</Badge>;
      },
    },
    {
      id: 'itemCount',
      header: '품목',
      cell: ({ row }) => {
        const count = row.original.inbound_shipment_items?.length ?? 0;
        const totalQty = row.original.inbound_shipment_items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
        return (
          <span className="text-sm text-gray-500">
            {count}종 / {totalQty.toLocaleString()}개
          </span>
        );
      },
    },
    {
      id: 'bl',
      header: 'B/L·AWB',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500 font-mono">
          {row.original.bl_number ?? '-'}
        </span>
      ),
    },
    {
      accessorKey: 'estimated_arrival',
      header: 'ETA',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.estimated_arrival
            ? dayjs(row.original.estimated_arrival).format('MM/DD')
            : '-'}
        </span>
      ),
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
      data={shipments}
      onRowClick={onRowClick}
      emptyMessage="등록된 운송 건이 없습니다"
    />
  );
}
