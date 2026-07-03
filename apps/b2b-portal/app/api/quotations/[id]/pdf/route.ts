import { createServiceClient } from '@/lib/supabase/server';
import { getSessionCompany } from '@/lib/portal';
import { generateQuotationBuffer } from '@/lib/pdf';
import type { QuotationData } from '@/lib/pdf';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 세션 → 업체 (BFF). 소유권 검증 없이는 어떤 견적서도 내주지 않는다 (IDOR 방지).
  const company = await getSessionCompany();
  if (!company) return new Response('Unauthorized', { status: 401 });

  const service = createServiceClient();
  const { data: quotation, error } = await service
    .from('quotations')
    .select('*, company_id, companies(name), quotation_items(product_id, label, quantity, unit_price, is_taxable, products(name, barcode))')
    .eq('id', id)
    .eq('company_id', company.id)
    .maybeSingle();

  if (error || !quotation) {
    return new Response('견적서를 찾을 수 없습니다', { status: 404 });
  }

  const items = (quotation.quotation_items as Array<{
    product_id: string | null;
    label: string | null;
    quantity: number;
    unit_price: number;
    is_taxable: boolean;
    products: { name: string; barcode: string } | null;
  }>).map((item) => ({
    productName: item.label ?? item.products?.name ?? '-',
    barcode: item.products?.barcode ?? '',
    quantity: item.quantity,
    unitPrice: item.unit_price,
    totalPrice: item.quantity * item.unit_price,
    isTaxable: item.is_taxable,
    isCustom: !item.product_id,
  }));

  const data: QuotationData = {
    quotationNumber: quotation.number,
    issuedAt: new Date(quotation.issued_at),
    issuer: { name: 'OO산업' },
    company: { name: (quotation.companies as { name: string } | null)?.name ?? '미지정' },
    items,
    taxRate: 0.1,
  };

  const buffer = await generateQuotationBuffer(data);

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`견적서_${quotation.number}`)}.pdf`,
    },
  });
}
