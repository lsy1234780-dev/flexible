'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

// 로그인한 B2B 사용자의 company 조회
// - 세션 없으면 → /login
// - company 없으면 (어드민 계정 등) → /login (세션 초기화 후)
export async function getMyCompany() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    // B2B 계정이 아닌 세션(어드민 등) — 로그아웃 후 로그인 페이지로
    await supabase.auth.signOut();
    redirect('/login');
  }
  return data;
}

// 업체별 노출 제품 + 단가 목록
export async function getCatalog(companyId: string) {
  const supabase = await createClient();

  const { data: allProducts, error: pErr } = await supabase
    .from('products')
    .select('id, name, barcode, base_price, base_stock, is_visible_default, image_url, description, width_cm, height_cm, depth_cm, weight_kg')
    .order('name');
  if (pErr) throw new Error(pErr.message);

  const { data: overrides, error: oErr } = await supabase
    .from('company_products')
    .select('product_id, custom_price, visible_stock, stock_ratio, max_visible_stock, is_visible')
    .eq('company_id', companyId);
  if (oErr) throw new Error(oErr.message);

  const overrideMap = new Map(overrides.map((o) => [o.product_id, o]));

  return allProducts
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
    .filter(Boolean) as {
      id: string; name: string; barcode: string; price: number; stock: number;
      image_url: string | null; description: string | null;
      width_cm: number | null; height_cm: number | null; depth_cm: number | null; weight_kg: number | null;
    }[];
}
