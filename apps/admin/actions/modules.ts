'use server';

import { createClient } from '@/lib/supabase/server';
import { ALL_MODULE_KEYS } from '@/lib/modules';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

// 현재 워크스페이스에서 켜진 모듈 키 목록.
// RLS(workspace_modules_member_read)로 현재 워크스페이스 행만 조회됨.
export async function getEnabledModules(): Promise<string[]> {
  if (process.env.PREVIEW_MODE === 'true') return [...ALL_MODULE_KEYS];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspace_modules')
    .select('module_key')
    .eq('enabled', true);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.module_key as string);
}

// 모듈 토글 (켜기/끄기) — 슈퍼어드민만.
export async function setModuleEnabled(moduleKey: string, enabled: boolean) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_workspace_module', {
    p_key: moduleKey,
    p_enabled: enabled,
  });
  if (error) return { error: error.message };
  return { success: true };
}
