'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

export interface MenuAccessRule {
  menu_href: string;
  allowed_departments: string[];
  allowed_positions: string[];
}

// 전체 메뉴 접근 규칙 조회
export async function getMenuAccessRules(): Promise<MenuAccessRule[]> {
  // 미리보기 모드: 빈 규칙 반환 (director는 모든 메뉴 접근 가능)
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('menu_access_rules')
    .select('menu_href, allowed_departments, allowed_positions')
    .order('menu_href');

  if (error) throw new Error(error.message);
  return data;
}

// 메뉴 접근 규칙 일괄 저장 (upsert)
export async function saveMenuAccessRules(rules: MenuAccessRule[]) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from('menu_access_rules')
    .upsert(
      rules.map((r) => ({
        menu_href: r.menu_href,
        allowed_departments: r.allowed_departments,
        allowed_positions: r.allowed_positions,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'menu_href' },
    );

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { success: true };
}
