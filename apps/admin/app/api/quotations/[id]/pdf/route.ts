import { createAdminClient } from '@/lib/supabase/server';
import { generateQuotationBuffer } from '@/lib/pdf';
import type { QuotationData } from '@/lib/pdf';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const inline = new URL(req.url).searchParams.has('inline');

  // 미리보기 모드: 실제 PDF 없이 플레이스홀더 반환
  if (process.env.PREVIEW_MODE === 'true') {
    const html = `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#9ca3af;background:#f9fafb">
      <div style="text-align:center"><p style="font-size:14px">미리보기 모드</p><p style="font-size:12px">실제 환경에서 견적서 PDF가 표시됩니다</p></div>
    </body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  }

  const supabase = await createAdminClient();

  const { data: quotation, error } = await supabase
    .from('quotations')
    .select('*, companies(name), quotation_items(product_id, label, quantity, unit_price, is_taxable, products(name, barcode))')
    .eq('id', id)
    .single();

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
    issuer: {
      name: 'OO산업',
    },
    company: {
      name: (quotation.companies as { name: string } | null)?.name ?? '미지정',
    },
    items,
    taxRate: 0.1,
  };

  const buffer = await generateQuotationBuffer(data);

  const disposition = inline
    ? 'inline'
    : `attachment; filename*=UTF-8''${encodeURIComponent(`견적서_${quotation.number}`)}.pdf`;

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
    },
  });
}
