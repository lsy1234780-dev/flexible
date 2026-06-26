'use client';

import { useState, useEffect, useMemo } from 'react';
import { Shield, ShieldOff, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { getShippedItemsByProduct } from '@/actions/products';
import ShippedItemDetailModal from '@/components/ShippedItemDetailModal';
import dayjs from 'dayjs';

type ShippedItem = Awaited<ReturnType<typeof getShippedItemsByProduct>>[number];
type WarrantyStatus = 'valid' | 'expired' | 'unknown';

interface Row {
  id: string;
  serialLabel: string;
  manufacturerSerial: string | null;
  companyName: string;
  contactName: string | null;
  orderNumber: string;
  shippedAt: string | null;
  warrantyExpiresAt: string | null;
  warrantyStatus: WarrantyStatus;
  daysLeft: number | null;
}

function calcWarranty(shippedAt: string | null) {
  if (!shippedAt) return { warrantyExpiresAt: null, warrantyStatus: 'unknown' as WarrantyStatus, daysLeft: null };
  const expiresAt = dayjs(shippedAt).add(12, 'month');
  const daysLeft = expiresAt.diff(dayjs(), 'day');
  return { warrantyExpiresAt: expiresAt.format('YYYY-MM-DD'), warrantyStatus: (daysLeft >= 0 ? 'valid' : 'expired') as WarrantyStatus, daysLeft };
}

function toRow(item: ShippedItem): Row {
  const inv = item.inventory_items as unknown as { serial_number: number | null; unit_barcode: string | null; manufacturer_serial: string | null; status: string } | null;
  const shipment = item.shipments as unknown as { id: string; shipped_at: string | null; completed_at: string | null; orders: { id: string; order_number: string | null; companies: { id: string; name: string; contact_name: string | null } | null } | null } | null;
  const order = shipment?.orders ?? null;
  const company = order?.companies ?? null;
  const shippedAt = shipment?.shipped_at ?? shipment?.completed_at ?? null;
  const { warrantyExpiresAt, warrantyStatus, daysLeft } = calcWarranty(shippedAt);
  const serialParts: string[] = [];
  if (inv?.unit_barcode) serialParts.push(inv.unit_barcode);
  else if (inv?.serial_number != null) serialParts.push(`#${inv.serial_number}`);
  return {
    id: item.id,
    serialLabel: serialParts.join(' / ') || `수량 ${item.quantity}개`,
    manufacturerSerial: inv?.manufacturer_serial ?? null,
    companyName: company?.name ?? '—',
    contactName: company?.contact_name ?? null,
    orderNumber: order?.order_number ?? '—',
    shippedAt,
    warrantyExpiresAt,
    warrantyStatus,
    daysLeft,
  };
}

function WarrantyBadge({ row }: { row: Row }) {
  if (row.warrantyStatus === 'unknown') return <span className="text-xs text-gray-400">출고일 없음</span>;
  if (row.warrantyStatus === 'expired') {
    return (
      <div className="flex items-center gap-1">
        <ShieldOff size={13} className="text-red-400" />
        <Badge variant="destructive" className="text-xs">보증 만료</Badge>
      </div>
    );
  }
  const daysLeft = row.daysLeft ?? 0;
  const isNear = daysLeft <= 30;
  return (
    <div className="flex items-center gap-1">
      <ShieldCheck size={13} className={isNear ? 'text-amber-500' : 'text-green-500'} />
      <Badge variant={isNear ? 'outline' : 'default'} className={`text-xs ${isNear ? 'border-amber-400 text-amber-600' : 'bg-green-600'}`}>
        무상보증 대상
      </Badge>
      <span className="text-xs text-gray-500 ml-1">{daysLeft}일 남음</span>
    </div>
  );
}

export default function ShippedItemsSection({ productId, productName }: { productId: string; productName: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    getShippedItemsByProduct(productId)
      .then((items) => setRows(items.map(toRow)))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [productId]);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    {
      accessorKey: 'serialLabel',
      header: '시리얼',
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <span className="font-mono text-sm">{row.original.serialLabel}</span>
          {row.original.manufacturerSerial && (
            <div className="text-xs text-gray-400 mt-0.5">{row.original.manufacturerSerial}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'companyName',
      header: '납품 업체',
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <span className="text-sm font-medium">{row.original.companyName}</span>
          {row.original.contactName && (
            <div className="text-xs text-gray-400 mt-0.5">{row.original.contactName}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'orderNumber',
      header: '수주번호',
      enableSorting: false,
      cell: ({ row }) => <span className="font-mono text-xs text-gray-600">{row.original.orderNumber}</span>,
    },
    {
      accessorKey: 'shippedAt',
      header: '출고일',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.original.shippedAt ? dayjs(row.original.shippedAt).format('YYYY-MM-DD') : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'warrantyExpiresAt',
      header: '보증 만료일',
      enableSorting: false,
      cell: ({ row }) => <span className="text-sm text-gray-600">{row.original.warrantyExpiresAt ?? '—'}</span>,
    },
    {
      id: 'warrantyStatus',
      header: '보증 현황',
      enableSorting: false,
      cell: ({ row }) => <WarrantyBadge row={row.original} />,
    },
  ], []);

  const validCount = rows.filter((r) => r.warrantyStatus === 'valid').length;
  const expiredCount = rows.filter((r) => r.warrantyStatus === 'expired').length;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield size={16} />
              출고 이력 &amp; 보증 현황
              <span className="text-sm font-normal text-gray-400">총 {rows.length}건</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              {rows.length > 0 && (
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-1 rounded bg-green-50 text-green-700 font-medium">무상보증 {validCount}건</span>
                  <span className="px-2 py-1 rounded bg-red-50 text-red-600 font-medium">만료 {expiredCount}건</span>
                </div>
              )}
              <a
                href={`/warranty?product=${productId}&productName=${encodeURIComponent(productName)}`}
                className="text-xs text-gray-400 hover:text-gray-600 underline whitespace-nowrap"
              >
                출고현황에서 보기 →
              </a>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400">불러오는 중…</div>
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              onRowClick={(row) => setSelectedId(row.id)}
              emptyMessage="출고된 아이템이 없습니다"
            />
          )}
        </CardContent>
      </Card>

      {selectedId && (
        <ShippedItemDetailModal id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}
