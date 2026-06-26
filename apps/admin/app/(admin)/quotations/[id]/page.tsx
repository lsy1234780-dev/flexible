import { getQuotation } from '@/actions/quotations';
import { getInventory } from '@/actions/inventory';
import QuotationDetailClient from './QuotationDetailClient';

export const dynamic = 'force-dynamic';

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [quotation, products] = await Promise.all([getQuotation(id), getInventory()]);

  return (
    <QuotationDetailClient
      quotation={quotation}
      products={products.map((p) => ({ id: p.id, name: p.name, barcode: p.barcode, base_price: p.base_price }))}
    />
  );
}
