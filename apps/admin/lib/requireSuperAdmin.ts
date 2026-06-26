'use server';

import { createClient } from '@/lib/supabase/server';
import { parseRole } from '@/lib/roles';

// 레벨 기반 마스터 권한 체크 (서버 액션에서 공통 사용)
export async function requireSuperAdmin() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const role = parseRole(user.app_metadata);

  // 직급 레벨 조회
  const { data: posData } = await supabase
    .from('positions')
    .select('level')
    .eq('id', role.position)
    .single();

  // 마스터 최소 레벨 조회
  const { data: settingData } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'super_admin_min_level')
    .single();

  const minLevel = settingData ? parseInt(settingData.value, 10) : 7;
  const userLevel = posData?.level ?? 0;

  if (userLevel < minLevel) {
    throw new Error('권한이 없습니다');
  }

  return { user, role, level: userLevel, minLevel };
}
