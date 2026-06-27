'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';

export type ActivityKind = 'system' | 'note' | 'call' | 'meeting' | 'task' | 'stage_change' | 'email';

// 범용 활동 로깅 — 어떤 레코드(거래처/딜/주문/AS…)에든 활동 한 줄을 남긴다.
// 통합 타임라인(crm_logs)의 단일 기록 지점.
export async function logActivity(input: {
  entityType: string;       // 'company' | 'deal' | 'order' | 'as_request' ...
  entityId: string;
  kind: ActivityKind;
  action: string;           // 표시 라벨
  memo?: string | null;
  companyId?: string | null; // 거래처 연결(선택, 호환)
  dueAt?: string | null;     // task 마감
}): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createAdminClient();
  const workspaceId = await getCurrentWorkspaceId();
  const { data: { user } } = await (await createClient()).auth.getUser();

  const { error } = await supabase.from('crm_logs').insert({
    workspace_id: workspaceId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    kind: input.kind,
    action: input.action,
    memo: input.memo ?? null,
    company_id: input.companyId ?? (input.entityType === 'company' ? input.entityId : null),
    due_at: input.dueAt ?? null,
    created_by: user?.id ?? null,
  });
  if (error) return { error: error.message };
  return { success: true };
}

// 레코드의 통합 타임라인 (시스템 이벤트 + 메모 + 영업활동 + task) 시간순.
export async function getTimeline(entityType: string, entityId: string) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  let query = supabase
    .from('crm_logs')
    .select('id, kind, action, memo, due_at, done, created_at, created_by, order_id')
    .order('created_at', { ascending: false })
    .limit(200);

  // 주문은 레거시 order_id 링크도 함께(과거 자동이벤트 호환)
  if (entityType === 'order') {
    query = query.or(`and(entity_type.eq.order,entity_id.eq.${entityId}),order_id.eq.${entityId}`);
  } else {
    query = query.eq('entity_type', entityType).eq('entity_id', entityId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// 사람이 직접 메모/활동 추가 (note/call/meeting/task)
export async function addActivity(input: {
  entityType: string;
  entityId: string;
  kind: Exclude<ActivityKind, 'system' | 'stage_change'>;
  action: string;
  memo?: string;
  dueAt?: string | null;
}): Promise<{ error?: string; success?: boolean }> {
  const result = await logActivity(input);
  if (result?.error) return result;
  revalidatePath(`/deals/${input.entityId}`);
  revalidatePath(`/companies/${input.entityId}`);
  return { success: true };
}

// task 완료 토글 (팔로업 체크)
export async function toggleActivityDone(id: string, done: boolean): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createAdminClient();
  const { error } = await supabase.from('crm_logs').update({ done }).eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// 팔로업 대시보드 — 미완료 task를 마감일순으로 (CRM 고유 가치)
export async function getOpenTasks(limit = 50) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('crm_logs')
    .select('id, entity_type, entity_id, action, memo, due_at, created_at')
    .eq('kind', 'task')
    .eq('done', false)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data;
}
