'use client';

import { useEffect, useState, useTransition } from 'react';
import { Trash2, Link as LinkIcon } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getInboundShipmentDetail,
  changeShipmentStage,
  deleteInboundShipment,
  addShipmentEvent,
  linkReceivingOrder,
  type InboundShipmentDetail,
} from '@/actions/inboundShipments';
import { INBOUND_STAGES, getStageConfig, getShippingTypeLabel } from '@/lib/inboundStages';
import { toast } from 'sonner';
import ShipmentTimeline from './ShipmentTimeline';
import ShipmentItemsTable from './ShipmentItemsTable';
import ShipmentInfoSection from './ShipmentInfoSection';

interface Product {
  id: string;
  name: string;
  barcode: string;
}

interface Props {
  shipmentId: string | null;
  products: Product[];
  onClose: () => void;
  onRefresh: () => void;
}

export default function InboundShipmentSheet({ shipmentId, products, onClose, onRefresh }: Props) {
  const [detail, setDetail] = useState<InboundShipmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [newStage, setNewStage] = useState('');
  const [stageMemo, setStageMemo] = useState('');
  const [eventTitle, setEventTitle] = useState('');

  useEffect(() => {
    if (!shipmentId) { setDetail(null); return; }
    setLoading(true);
    getInboundShipmentDetail(shipmentId)
      .then(setDetail)
      .catch(() => toast.error('상세 조회 실패'))
      .finally(() => setLoading(false));
  }, [shipmentId]);

  function refresh() {
    if (!shipmentId) return;
    getInboundShipmentDetail(shipmentId).then(setDetail);
    onRefresh();
  }

  function handleStageChange() {
    if (!shipmentId || !newStage) return;
    startTransition(async () => {
      const res = await changeShipmentStage(shipmentId, newStage, stageMemo || undefined);
      if (res.error) { toast.error(res.error); return; }
      toast.success('스테이지 변경 완료');
      setNewStage('');
      setStageMemo('');
      refresh();
    });
  }

  function handleDelete() {
    if (!shipmentId || !confirm('이 운송 건을 삭제하시겠습니까?')) return;
    startTransition(async () => {
      const res = await deleteInboundShipment(shipmentId);
      if (res.error) { toast.error(res.error); return; }
      toast.success('삭제 완료');
      onClose();
      onRefresh();
    });
  }

  function handleAddEvent() {
    if (!shipmentId || !eventTitle.trim()) return;
    startTransition(async () => {
      const res = await addShipmentEvent(shipmentId, eventTitle.trim());
      if (res.error) { toast.error(res.error); return; }
      setEventTitle('');
      refresh();
    });
  }

  function handleLinkReceiving() {
    if (!shipmentId) return;
    startTransition(async () => {
      const res = await linkReceivingOrder(shipmentId);
      if (res.error) { toast.error(res.error); return; }
      toast.success('입고지시서 생성 완료');
      refresh();
    });
  }

  const stageConfig = detail ? getStageConfig(detail.stage) : null;

  return (
    <Sheet open={!!shipmentId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-lg w-full overflow-hidden flex flex-col">
        {loading || !detail ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-sm text-gray-400">{loading ? '불러오는 중...' : ''}</span>
          </div>
        ) : (
          <>
            <SheetHeader className="shrink-0">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-lg">{detail.title}</SheetTitle>
                {stageConfig && (
                  <Badge className={stageConfig.color}>{stageConfig.label}</Badge>
                )}
              </div>
              <SheetDescription className="text-xs text-gray-500">
                {detail.purchase_orders
                  ? `발주: ${detail.purchase_orders.title} · ${detail.purchase_orders.supplier ?? '공급처 미지정'}`
                  : '발주 미연결'}
                {detail.shipping_type && ` · ${getShippingTypeLabel(detail.shipping_type)}`}
              </SheetDescription>
            </SheetHeader>

            {/* 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto space-y-6 px-4 pb-4">
              {/* 스테이지 변경 */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">스테이지 변경</h4>
                <div className="flex items-center gap-2">
                  <select
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value)}
                    className="flex-1 h-8 rounded-md border px-2 text-sm"
                  >
                    <option value="">선택</option>
                    {INBOUND_STAGES.filter((s) => s.key !== detail.stage).map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <Button size="sm" onClick={handleStageChange} disabled={!newStage || isPending}>
                    변경
                  </Button>
                </div>
                {newStage && (
                  <Input
                    placeholder="메모 (선택)"
                    value={stageMemo}
                    onChange={(e) => setStageMemo(e.target.value)}
                    className="h-8 text-sm"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleStageChange(); }}
                  />
                )}
              </div>

              {/* 타임라인 */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">타임라인</h4>
                <ShipmentTimeline events={detail.inbound_shipment_events ?? []} />
                <div className="flex gap-2">
                  <Input
                    placeholder="메모 추가..."
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    className="h-7 text-xs"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddEvent(); }}
                  />
                  <Button size="sm" variant="outline" onClick={handleAddEvent} disabled={!eventTitle.trim() || isPending}>
                    추가
                  </Button>
                </div>
              </div>

              {/* 품목 */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">품목</h4>
                <ShipmentItemsTable
                  shipmentId={detail.id}
                  items={detail.inbound_shipment_items ?? []}
                  products={products}
                  onRefresh={refresh}
                />
              </div>

              {/* 운송/통관 정보 */}
              <ShipmentInfoSection shipment={detail} onRefresh={refresh} />

              {/* 입고지시서 연동 */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">입고지시서</h4>
                {detail.receiving_order_id ? (
                  <div className="flex items-center gap-2 text-sm">
                    <LinkIcon size={14} className="text-gray-400" />
                    <span className="text-gray-600">연결됨: #{detail.receiving_order_id.slice(0, 8)}</span>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleLinkReceiving}
                    disabled={isPending || (detail.inbound_shipment_items?.length ?? 0) === 0}
                  >
                    <LinkIcon size={14} className="mr-1" />
                    입고지시서 생성
                  </Button>
                )}
              </div>
            </div>

            <SheetFooter className="shrink-0 border-t pt-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isPending}
              >
                <Trash2 size={14} className="mr-1" />
                삭제
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
