import { notFound } from 'next/navigation';
import { getPurchaseOrderDetail } from '@/actions/purchaseOrders';
import { getProductsForReceiving } from '@/actions/receiving';
import { getSuppliers } from '@/actions/companies';
import { getInboundShipmentDetail } from '@/actions/inboundShipments';
import PurchaseOrderDetailClient from './PurchaseOrderDetailClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PurchaseOrderDetailPage({ params }: Props) {
  const { id } = await params;

  const [po, products, suppliers] = await Promise.all([
    getPurchaseOrderDetail(id),
    getProductsForReceiving(),
    getSuppliers(),
  ]);

  if (!po) notFound();

  // 연결된 운송 건들의 상세 정보 (이벤트 포함) fetch
  const shipmentDetails = (await Promise.all(
    po.inbound_shipments.map((s) => getInboundShipmentDetail(s.id)),
  )).filter((d): d is NonNullable<typeof d> => d !== null);

  return (
    <PurchaseOrderDetailClient
      purchaseOrder={po}
      shipmentDetails={shipmentDetails}
      products={products}
      suppliers={suppliers}
    />
  );
}
