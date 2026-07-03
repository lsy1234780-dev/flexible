import { generateQuotationBuffer } from '@/lib/pdf';
import type { QuotationData } from '@/lib/pdf';
import { createClient } from '@/lib/supabase/server';
import { getIssuerInfo } from '@/lib/issuerInfo';

interface PreviewItem {
  product_id?: string | null;
  label?: string | null;
  quantity: number;
  unit_price: number;
  is_taxable?: boolean;
}

interface PreviewRequest {
  companyId: string;
  companyName: string;
  items: PreviewItem[];
}

export async function POST(req: Request) {
  // PREVIEW_MODE에서는 인증 생략
  if (process.env.PREVIEW_MODE !== 'true') {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();

    // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

    const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
    if (!user) return new Response('Unauthorized', { status: 401 });
  }

  const body: PreviewRequest = await req.json();

  // 제품 항목 이름·바코드 조회 (PREVIEW_MODE에서는 previewData에서 찾기)
  let productMap = new Map<string, { name: string; barcode: string }>();

  if (process.env.PREVIEW_MODE === 'true') {
    const { PREVIEW_PRODUCTS } = await import('@/lib/previewData');
    productMap = new Map(PREVIEW_PRODUCTS.map((p) => [p.id, { name: p.name, barcode: p.barcode }]));
  } else {
    const supabase = await createClient();
    const productIds = body.items.map((i) => i.product_id).filter(Boolean) as string[];
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, name, barcode')
        .in('id', productIds);
      productMap = new Map((products ?? []).map((p) => [p.id, p]));
    }
  }

  const issuer = getIssuerInfo();
  const now = new Date();

  const data: QuotationData = {
    quotationNumber: '미리보기',
    issuedAt: now,
    issuer,
    company: { name: body.companyName },
    items: body.items.map((item) => {
      const p = item.product_id ? productMap.get(item.product_id) : null;
      return {
        productName: item.label ?? p?.name ?? '-',
        barcode: p?.barcode ?? '',
        quantity: item.quantity,
        unitPrice: item.unit_price,
        totalPrice: item.quantity * item.unit_price,
        isTaxable: item.is_taxable ?? true,
        isCustom: !item.product_id,
      };
    }),
    taxRate: 0.1,
  };

  const buffer = await generateQuotationBuffer(data);

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="preview.pdf"',
    },
  });
}
