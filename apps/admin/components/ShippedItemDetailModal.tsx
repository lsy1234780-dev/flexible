'use client';

import { useState, useEffect, useTransition } from 'react';
import { X, Package, Building2, ShoppingCart, FileText, Truck, ShieldCheck, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { getShippedItemDetail } from '@/actions/products';
import dayjs from 'dayjs';

type DetailItem = Awaited<ReturnType<typeof getShippedItemDetail>>;

// ── 보증 계산 ──

function calcWarranty(shippedAt: string | null) {
  if (!shippedAt) return { warrantyStatus: 'unknown' as const, daysLeft: null };
  const daysLeft = dayjs(shippedAt).add(12, 'month').diff(dayjs(), 'day');
  return { warrantyStatus: (daysLeft >= 0 ? 'valid' : 'expired') as 'valid' | 'expired', daysLeft };
}

// ── 보조 컴포넌트 ──

function WarrantyDetailBadge({ shippedAt }: { shippedAt: string | null }) {
  const { warrantyStatus, daysLeft } = calcWarranty(shippedAt);
  if (warrantyStatus === 'unknown') return <Badge variant="secondary">출고일 없음</Badge>;
  if (warrantyStatus === 'expired') {
    return <Badge variant="destructive"><ShieldOff size={12} className="mr-1" />보증 만료</Badge>;
  }
  const isNear = (daysLeft ?? 999) <= 30;
  return (
    <Badge variant={isNear ? 'outline' : 'default'} className={isNear ? 'border-amber-400 text-amber-600' : 'bg-green-600'}>
      <ShieldCheck size={12} className="mr-1" />
      무상보증 · {daysLeft}일 남음
    </Badge>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function DetailSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 pl-5">{children}</div>
    </div>
  );
}

// ── 메인 모달 ──

interface Props {
  id: string;
  onClose: () => void;
}

export default function ShippedItemDetailModal({ id, onClose }: Props) {
  const [detail, setDetail] = useState<DetailItem>(null);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const data = await getShippedItemDetail(id);
      setDetail(data);
    });
  }, [id]);

  const inv = detail?.inventory_items as unknown as {
    serial_number: number | null;
    unit_barcode: string | null;
    manufacturer_serial: string | null;
    status: string;
  } | null;
  const product = detail?.products as unknown as { id: string; name: string; barcode: string } | null;
  const shipment = detail?.shipments as unknown as {
    shipped_at: string | null;
    packed_at: string | null;
    completed_at: string | null;
    orders: {
      order_number: string | null;
      confirmed_at: string | null;
      confirmed_by: string | null;
      notes: string | null;
      companies: {
        name: string;
        contact_name: string | null;
        contact_phone: string | null;
        contact_email: string | null;
        contact_position: string | null;
      } | null;
      quotations: {
        id: string;
        number: string;
        status: string;
        issued_at: string | null;
        issued_by: string | null;
      }[] | null;
    } | null;
  } | null;

  const order = shipment?.orders ?? null;
  const company = order?.companies ?? null;
  const quotation = order?.quotations?.[0] ?? null;
  const shippedAt = shipment?.shipped_at ?? shipment?.completed_at ?? null;
  const serialLabel = inv?.unit_barcode ?? (inv?.serial_number != null ? `#${inv.serial_number}` : null);
  const hasQuotation = !!quotation;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`max-h-[90vh] overflow-hidden p-0 gap-0 ${hasQuotation ? 'sm:max-w-5xl' : 'sm:max-w-lg'}`}>
        <VisuallyHidden><DialogTitle>출고 상세 정보</DialogTitle></VisuallyHidden>

        <div className={`flex h-full ${hasQuotation ? 'flex-row' : 'flex-col'}`}>
          {/* 좌측: 상세 정보 */}
          <div className={`overflow-y-auto p-6 ${hasQuotation ? 'w-80 shrink-0 border-r' : 'w-full'}`}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 className="text-base font-bold text-gray-900">{product?.name ?? '—'}</h2>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{product?.barcode}</p>
              </div>
              <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded shrink-0">
                <X size={18} />
              </button>
            </div>

            {loading ? (
              <div className="py-10 text-center text-sm text-gray-400">불러오는 중…</div>
            ) : !detail ? (
              <div className="py-10 text-center text-sm text-gray-400">데이터를 찾을 수 없습니다</div>
            ) : (
              <div className="space-y-5 mt-3">
                {/* 보증 현황 */}
                <div className="flex flex-col gap-1">
                  <WarrantyDetailBadge shippedAt={shippedAt} />
                  {shippedAt && (
                    <span className="text-xs text-gray-400">
                      출고 {dayjs(shippedAt).format('YYYY-MM-DD')} · 만료 {dayjs(shippedAt).add(12, 'month').format('YYYY-MM-DD')}
                    </span>
                  )}
                </div>

                <div className="border-t" />

                <DetailSection icon={Package} title="제품 정보">
                  <DetailField label="시리얼" value={serialLabel ? <span className="font-mono">{serialLabel}</span> : null} />
                  <DetailField label="제조사 시리얼" value={inv?.manufacturer_serial ? <span className="font-mono">{inv.manufacturer_serial}</span> : null} />
                  <DetailField label="재고 상태" value={inv?.status} />
                </DetailSection>

                <div className="border-t" />

                <DetailSection icon={Building2} title="납품 업체">
                  <DetailField label="업체명" value={company?.name} />
                  <DetailField label="담당자" value={company?.contact_name} />
                  <DetailField label="직책" value={company?.contact_position} />
                  <DetailField label="연락처" value={company?.contact_phone} />
                  <DetailField label="이메일" value={company?.contact_email} />
                </DetailSection>

                <div className="border-t" />

                <DetailSection icon={ShoppingCart} title="수주 정보">
                  <DetailField label="수주번호" value={order?.order_number ? <span className="font-mono">{order.order_number}</span> : null} />
                  <DetailField label="영업 담당자" value={order?.confirmed_by} />
                  <DetailField label="확정일" value={order?.confirmed_at ? dayjs(order.confirmed_at).format('YYYY-MM-DD') : null} />
                  <DetailField label="메모" value={order?.notes} />
                </DetailSection>

                {quotation && (
                  <>
                    <div className="border-t" />
                    <DetailSection icon={FileText} title="견적서">
                      <DetailField label="견적번호" value={<span className="font-mono">{quotation.number}</span>} />
                      <DetailField label="발행 담당자" value={quotation.issued_by} />
                      <DetailField label="발행일" value={quotation.issued_at ? dayjs(quotation.issued_at).format('YYYY-MM-DD') : null} />
                    </DetailSection>
                  </>
                )}

                <div className="border-t" />

                <DetailSection icon={Truck} title="출고 정보">
                  <DetailField label="출고일" value={shipment?.shipped_at ? dayjs(shipment.shipped_at).format('YYYY-MM-DD') : null} />
                  <DetailField label="포장 완료" value={shipment?.packed_at ? dayjs(shipment.packed_at).format('YYYY-MM-DD') : null} />
                  <DetailField label="배송 완료" value={shipment?.completed_at ? dayjs(shipment.completed_at).format('YYYY-MM-DD') : null} />
                </DetailSection>
              </div>
            )}
          </div>

          {/* 우측: 견적서 PDF */}
          {hasQuotation && (
            <div className="flex-1 flex flex-col bg-gray-100 min-h-0">
              <div className="flex items-center justify-between px-4 py-2 bg-white border-b">
                <span className="text-xs font-medium text-gray-500">
                  확정 견적서 · <span className="font-mono">{quotation!.number}</span>
                </span>
                <a
                  href={`/api/quotations/${quotation!.id}/pdf`}
                  download
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  다운로드
                </a>
              </div>
              <iframe
                src={`/api/quotations/${quotation!.id}/pdf?inline`}
                className="flex-1 w-full"
                style={{ minHeight: '600px' }}
                title={`견적서 ${quotation!.number}`}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
