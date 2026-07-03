'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sendWelcome } from '@/lib/email';

const B2B_PORTAL_URL = process.env.NEXT_PUBLIC_B2B_PORTAL_URL ?? 'http://localhost:3002';
const BRAND_NAME = process.env.EMAIL_BRAND_NAME ?? 'B2B 협력사 포털';

const CompanySchema = z.object({
  name: z.string().min(1, '업체명을 입력하세요'),
  is_supplier: z.boolean().default(false),
  is_customer: z.boolean().default(false),
  status: z.enum(['pending', 'active', 'suspended']),
});

export async function getCompanies() {
  if (process.env.PREVIEW_MODE === 'true') {
    const { PREVIEW_COMPANIES } = await import('@/lib/previewData');
    return PREVIEW_COMPANIES;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getCompany(id: string) {
  if (process.env.PREVIEW_MODE === 'true') {
    const { PREVIEW_COMPANIES } = await import('@/lib/previewData');
    return PREVIEW_COMPANIES.find((c) => c.id === id) ?? null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getCompanyProducts(companyId: string) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  // 전체 제품 목록
  const { data: allProducts, error: pErr } = await supabase
    .from('products')
    .select('id, name, barcode, base_price, base_stock, is_visible_default')
    .order('name');
  if (pErr) throw new Error(pErr.message);

  // 업체별 오버라이드
  const { data: overrides, error: oErr } = await supabase
    .from('company_products')
    .select('*')
    .eq('company_id', companyId);
  if (oErr) throw new Error(oErr.message);

  const overrideMap = new Map(overrides.map((o) => [o.product_id, o]));

  return allProducts.map((p) => {
    const override = overrideMap.get(p.id);

    // 단가 결정
    const effectivePrice = override?.custom_price ?? p.base_price;

    // 재고 결정 로직 (우선순위: visible_stock > ratio+max > base_stock)
    let effectiveStock = p.base_stock;
    if (override?.visible_stock != null) {
      effectiveStock = override.visible_stock;
    } else {
      if (override?.stock_ratio != null) {
        effectiveStock = Math.floor(p.base_stock * override.stock_ratio / 100);
      }
      if (override?.max_visible_stock != null) {
        effectiveStock = Math.min(effectiveStock, override.max_visible_stock);
      }
    }

    return {
      product: p,
      override: override ?? null,
      effectivePrice,
      effectiveStock,
      isVisible: override ? override.is_visible : p.is_visible_default,
    };
  });
}

// 업체별 제품 단가 맵 (견적서 작성 시 사용)
export async function getCompanyProductPrices(companyId: string): Promise<Record<string, number>> {
  if (process.env.PREVIEW_MODE === 'true') {
    const { getPreviewCompanyPrices } = await import('@/lib/previewData');
    return getPreviewCompanyPrices(companyId);
  }
  const supabase = await createClient();

  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, base_price, is_visible_default');
  if (pErr) throw new Error(pErr.message);

  const { data: overrides, error: oErr } = await supabase
    .from('company_products')
    .select('product_id, custom_price, is_visible')
    .eq('company_id', companyId);
  if (oErr) throw new Error(oErr.message);

  const overrideMap = new Map(overrides.map((o) => [o.product_id, o]));

  const priceMap: Record<string, number> = {};
  for (const p of products) {
    const override = overrideMap.get(p.id);
    const isVisible = override ? override.is_visible : p.is_visible_default;
    if (!isVisible) continue;
    priceMap[p.id] = override?.custom_price ?? p.base_price;
  }
  return priceMap;
}

export async function createCompany(formData: FormData) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  const parsed = CompanySchema.safeParse({
    name: formData.get('name'),
    is_supplier: formData.get('is_supplier') === 'true',
    is_customer: formData.get('is_customer') === 'true',
    status: formData.get('status'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from('companies')
    .insert({ ...parsed.data, workspace_id: await getCurrentWorkspaceId() });
  if (error) return { error: error.message };

  revalidatePath('/companies');
  return { success: true };
}

// 공급처 목록 조회 (발주 시 선택용)
export async function getSuppliers() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, contact_name, contact_phone, contact_email, country')
    .eq('is_supplier', true)
    .eq('status', 'active')
    .order('name');
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCompanyStatus(id: string, status: 'pending' | 'active' | 'suspended') {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return { error: '로그인이 필요합니다' };

  // 이전 상태 조회
  const { data: prev } = await supabase
    .from('companies')
    .select('status, name, auth_user_id')
    .eq('id', id)
    .single();

  const { error } = await supabase.from('companies').update({ status }).eq('id', id);
  if (error) return { error: error.message };

  // 활성화 전환 시 이메일 발송
  if (status === 'active' && prev?.status !== 'active' && prev?.auth_user_id) {
    const { data: email } = await supabase.rpc('get_user_email', { p_user: prev.auth_user_id });
    if (email) {
      await sendWelcome({
        to: email,
        brandName: BRAND_NAME,
        userName: prev.name,
        loginUrl: `${B2B_PORTAL_URL}/login`,
      });
    }
  }

  revalidatePath('/companies');
  revalidatePath(`/companies/${id}`);
  return { success: true };
}

// 업체 정보 업데이트 (country, roles 등)
export async function updateCompany(
  id: string,
  data: {
    country?: string | null;
    is_supplier?: boolean;
    is_customer?: boolean;
    contact_name?: string | null;
    contact_position?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from('companies').update(data).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/companies');
  revalidatePath(`/companies/${id}`);
  return { success: true };
}

// 업체별 거래 이력 조회 (발주=사입 + 수주=판매)
export async function getCompanyTransactions(companyId: string) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  // 수주 (판매) — orders.company_id
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, status, created_at, order_items(quantity, unit_price)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(50);

  // 발주 (사입) — purchase_orders.supplier_id
  const { data: purchases } = await supabase
    .from('purchase_orders')
    .select('id, po_number, title, total_amount, currency, payment_status, created_at')
    .eq('supplier_id', companyId)
    .order('created_at', { ascending: false })
    .limit(50);

  const transactions: {
    id: string;
    type: 'purchase' | 'sale';
    label: string;
    amount: number | null;
    currency: string;
    status: string;
    date: string;
    itemSummary: string;
  }[] = [];

  // 수주 → 판매
  for (const o of orders ?? []) {
    const items = o.order_items as { quantity: number; unit_price: number }[] | undefined;
    const totalAmount = items?.reduce((s, i) => s + i.quantity * i.unit_price, 0) ?? null;
    const totalQty = items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
    transactions.push({
      id: o.id,
      type: 'sale',
      label: o.order_number ?? '수주',
      amount: totalAmount,
      currency: 'KRW',
      status: o.status,
      date: o.created_at,
      itemSummary: `${items?.length ?? 0}종 ${totalQty}개`,
    });
  }

  // 발주 → 사입
  for (const p of purchases ?? []) {
    transactions.push({
      id: p.id,
      type: 'purchase',
      label: p.po_number ?? p.title,
      amount: p.total_amount,
      currency: p.currency ?? 'KRW',
      status: p.payment_status ?? 'unpaid',
      date: p.created_at,
      itemSummary: '',
    });
  }

  // 날짜 내림차순 정렬
  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return transactions;
}

export async function upsertCompanyProduct(
  companyId: string,
  productId: string,
  data: {
    custom_price: number | null;
    visible_stock: number | null;
    stock_ratio: number | null;
    max_visible_stock: number | null;
    is_visible: boolean;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from('company_products').upsert(
    { company_id: companyId, product_id: productId, ...data },
    { onConflict: 'company_id,product_id' },
  );
  if (error) return { error: error.message };

  revalidatePath(`/companies/${companyId}`);
  return { success: true };
}
