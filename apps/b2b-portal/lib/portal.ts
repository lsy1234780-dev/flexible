// B2B 포털 BFF 코어 — 세션 → 업체 소유권의 단일 출처.
//
// B2B 사용자는 워크스페이스 멤버가 아니라서 RLS(ws_isolation)로는 아무것도 읽을 수 없다.
// 따라서 포털의 모든 데이터 접근은 service client(BFF)로 수행하되,
// 반드시 이 파일의 getSessionCompany()가 반환한 업체로 스코프를 강제한다.
// 규칙: 클라이언트가 보낸 companyId/unit_price는 절대 신뢰하지 않는다.

import { createClient, createServiceClient } from '@/lib/supabase/server';

export interface SessionCompany {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  auth_user_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_position: string | null;
}

// 로그인 세션의 auth 유저 → 소속 업체. 없으면 null.
export async function getSessionCompany(): Promise<SessionCompany | null> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.
  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;
  if (!user) return null;

  const service = createServiceClient();
  const { data } = await service
    .from('companies')
    .select('id, workspace_id, name, status, auth_user_id, contact_name, contact_phone, contact_email, contact_position')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  return (data as SessionCompany | null) ?? null;
}

export interface CatalogItem {
  id: string;
  name: string;
  barcode: string;
  price: number;
  stock: number;
  image_url: string | null;
  description: string | null;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  weight_kg: number | null;
}

// 업체별 노출 제품 + 단가 (CLAUDE.md 단가 결정 로직).
// service client 사용이므로 반드시 업체의 workspace로 제품을 스코프한다 — 크로스테넌트 노출 방지.
export async function loadCatalog(company: SessionCompany): Promise<CatalogItem[]> {
  const service = createServiceClient();

  const [{ data: allProducts, error: pErr }, { data: overrides, error: oErr }] = await Promise.all([
    service
      .from('products')
      .select('id, name, barcode, base_price, base_stock, is_visible_default, image_url, description, width_cm, height_cm, depth_cm, weight_kg')
      .eq('workspace_id', company.workspace_id)
      .order('name'),
    service
      .from('company_products')
      .select('product_id, custom_price, visible_stock, stock_ratio, max_visible_stock, is_visible')
      .eq('company_id', company.id),
  ]);
  if (pErr) throw new Error(pErr.message);
  if (oErr) throw new Error(oErr.message);

  const overrideMap = new Map((overrides ?? []).map((o) => [o.product_id, o]));

  return (allProducts ?? [])
    .map((p) => {
      const o = overrideMap.get(p.id);
      const isVisible = o ? o.is_visible : p.is_visible_default;
      if (!isVisible) return null;

      const price = o?.custom_price ?? p.base_price;

      let stock = p.base_stock;
      if (o?.visible_stock != null) {
        stock = o.visible_stock;
      } else {
        if (o?.stock_ratio != null) stock = Math.floor(p.base_stock * o.stock_ratio / 100);
        if (o?.max_visible_stock != null) stock = Math.min(stock, o.max_visible_stock);
      }

      return {
        id: p.id, name: p.name, barcode: p.barcode, price, stock,
        image_url: p.image_url as string | null,
        description: p.description as string | null,
        width_cm: p.width_cm as number | null,
        height_cm: p.height_cm as number | null,
        depth_cm: p.depth_cm as number | null,
        weight_kg: p.weight_kg as number | null,
      };
    })
    .filter((x): x is CatalogItem => x !== null);
}
