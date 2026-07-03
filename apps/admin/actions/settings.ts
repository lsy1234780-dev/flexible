'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';
import { parseRole } from '@/lib/roles';

// ── 마스터 최소 레벨 조회 ──

export async function getSuperAdminMinLevel(): Promise<number> {
  if (process.env.PREVIEW_MODE === 'true') return 7;
  const supabase = await createClient();
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'super_admin_min_level')
    .single();

  return data ? parseInt(data.value, 10) : 7;
}

// ── 마스터 최소 레벨 변경 (마스터만 가능) ──

export async function updateSuperAdminMinLevel(newLevel: number) {
  const supabase = await createClient();

  // 현재 유저 권한 확인 — getUser() 유지: app_metadata 기반 RBAC 게이트 (프레시니스 필요)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const role = parseRole(user.app_metadata);

  // 현재 유저의 직급 레벨 조회
  const { data: posData } = await supabase
    .from('positions')
    .select('level')
    .eq('id', role.position)
    .single();

  if (!posData) return { error: '직급 정보를 찾을 수 없습니다' };

  // 현재 마스터 레벨 조회
  const currentMinLevel = await getSuperAdminMinLevel();

  // 현재 유저가 마스터인지 확인
  if (posData.level < currentMinLevel) {
    return { error: '권한이 없습니다' };
  }

  if (newLevel < 1) return { error: '레벨은 1 이상이어야 합니다' };

  // 저장
  const { error } = await supabase
    .from('system_settings')
    .upsert(
      { workspace_id: await getCurrentWorkspaceId(), key: 'super_admin_min_level', value: String(newLevel), updated_at: new Date().toISOString() },
      { onConflict: 'workspace_id,key' },
    );

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { success: true };
}
