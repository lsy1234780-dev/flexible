'use server';

import { createClient } from '@/lib/supabase/server';
import { ALL_MODULE_KEYS } from '@/lib/modules';

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

// 모듈 토글 (켜기/끄기) — 관리자만. 의존성 검증은 후속 작업.
export async function setModuleEnabled(moduleKey: string, enabled: boolean) {
  const { requireSuperAdmin } = await import('@/lib/requireSuperAdmin');
  await requireSuperAdmin();

  const { createAdminClient } = await import('@/lib/supabase/server');
  const { getCurrentWorkspaceId } = await import('@/lib/workspace');
  const admin = createAdminClient();
  const workspaceId = await getCurrentWorkspaceId();

  const { error } = await admin
    .from('workspace_modules')
    .upsert(
      { workspace_id: workspaceId, module_key: moduleKey, enabled },
      { onConflict: 'workspace_id,module_key' },
    );

  if (error) return { error: error.message };
  return { success: true };
}
