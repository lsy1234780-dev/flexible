'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { logActivity } from '@/actions/crm';
import { revalidatePath } from 'next/cache';

// ─── 파이프라인 단계 (워크스페이스별 편집 — "우리 입맛") ───

export async function getDealStages() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  let { data, error } = await supabase
    .from('deal_stages')
    .select('*')
    .order('sort_order');
  if (error) throw new Error(error.message);

  // crm_pipeline 모듈을 켜고 칸반에 처음 들어오면 기본 단계 자동 시드(멱등)
  if (!data || data.length === 0) {
    const ws = await getCurrentWorkspaceId();
    await supabase.rpc('seed_default_deal_stages', { p_ws: ws });
    ({ data, error } = await supabase.from('deal_stages').select('*').order('sort_order'));
    if (error) throw new Error(error.message);
  }
  return data ?? [];
}

export async function createDealStage(name: string, kind: 'open' | 'won' | 'lost' = 'open', color?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };
  const workspaceId = await getCurrentWorkspaceId();

  const { count } = await supabase
    .from('deal_stages')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);

  const { error } = await supabase.from('deal_stages').insert({
    workspace_id: workspaceId,
    name: name.trim(),
    kind,
    color: color ?? null,
    sort_order: count ?? 0,
  });
  if (error) return { error: error.message };
  revalidatePath('/deals');
  return { success: true };
}

export async function updateDealStage(id: string, fields: { name?: string; kind?: 'open' | 'won' | 'lost'; color?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };
  const { error } = await supabase.from('deal_stages').update(fields).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/deals');
  return { success: true };
}

export async function reorderDealStages(orderedIds: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };
  // 순서대로 sort_order 재부여
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('deal_stages').update({ sort_order: i }).eq('id', orderedIds[i]);
    if (error) return { error: error.message };
  }
  revalidatePath('/deals');
  return { success: true };
}

export async function deleteDealStage(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };
  // 해당 단계의 딜이 있으면 막기 (데이터 보호)
  const { count } = await supabase
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('stage_id', id);
  if (count && count > 0) {
    return { error: `이 단계에 딜이 ${count}건 있습니다. 먼저 다른 단계로 옮기세요.` };
  }
  const { error } = await supabase.from('deal_stages').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/deals');
  return { success: true };
}

// ─── 딜 (영업 기회) ───

export async function getDeals() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deals')
    .select('*, companies(id, name), deal_stages(id, name, kind, color)')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getDeal(id: string) {
  if (process.env.PREVIEW_MODE === 'true') return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deals')
    .select('*, companies(id, name), deal_stages(id, name, kind, color)')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createDeal(input: {
  title: string;
  company_id?: string | null;
  stage_id?: string | null;
  value?: number;
  expected_close_date?: string | null;
  source?: string | null;
  notes?: string | null;
}) {
  if (!input.title?.trim()) return { error: '딜 이름을 입력하세요' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };
  const workspaceId = await getCurrentWorkspaceId();

  // stage 미지정 시 첫 단계(sort_order 최소)로
  let stageId = input.stage_id ?? null;
  if (!stageId) {
    const stages = await getDealStages();
    stageId = stages[0]?.id ?? null;
  }

  const { data: deal, error } = await supabase
    .from('deals')
    .insert({
      workspace_id: workspaceId,
      title: input.title.trim(),
      company_id: input.company_id ?? null,
      stage_id: stageId,
      owner_id: user?.id ?? null,
      value: input.value ?? 0,
      expected_close_date: input.expected_close_date ?? null,
      source: input.source ?? null,
      notes: input.notes ?? null,
    })
    .select('id')
    .single();
  if (error || !deal) return { error: error?.message ?? '딜 생성 실패' };

  await logActivity({ entityType: 'deal', entityId: deal.id, kind: 'system', action: '딜 생성', companyId: input.company_id ?? null });

  revalidatePath('/deals');
  return { success: true, id: deal.id };
}

export async function updateDeal(id: string, fields: Record<string, unknown>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };
  const { error } = await supabase
    .from('deals')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/deals');
  revalidatePath(`/deals/${id}`);
  return { success: true };
}

// 칸반 드래그: 단계 이동 + won/lost 단계면 딜 상태 자동 전환 + 활동 로깅
export async function moveDealStage(dealId: string, stageId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const { data: stage } = await supabase.from('deal_stages').select('id, name, kind').eq('id', stageId).single();
  if (!stage) return { error: '단계를 찾을 수 없습니다' };

  const status = stage.kind === 'won' ? 'won' : stage.kind === 'lost' ? 'lost' : 'open';

  const { error } = await supabase
    .from('deals')
    .update({ stage_id: stageId, status, updated_at: new Date().toISOString() })
    .eq('id', dealId);
  if (error) return { error: error.message };

  await logActivity({
    entityType: 'deal', entityId: dealId, kind: 'stage_change',
    action: `단계 이동 → ${stage.name}`,
  });

  revalidatePath('/deals');
  revalidatePath(`/deals/${dealId}`);
  return { success: true };
}

export async function deleteDeal(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };
  await supabase.from('crm_logs').delete().eq('entity_type', 'deal').eq('entity_id', id);
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/deals');
  return { success: true };
}

// ─── 매출 예측 (CRM 고유 가치) ───
// 열린 딜의 단계별 합계 + 가중 예측(단계 진행도 비례).
export async function getDealForecast() {
  if (process.env.PREVIEW_MODE === 'true') return { byStage: [], openTotal: 0, wonTotal: 0 };
  const supabase = await createClient();

  const [{ data: deals }, { data: stages }] = await Promise.all([
    supabase.from('deals').select('value, status, stage_id'),
    supabase.from('deal_stages').select('id, name, kind, sort_order').order('sort_order'),
  ]);

  const stageList = stages ?? [];
  const openStages = stageList.filter((s) => s.kind === 'open');
  const byStage = stageList.map((s) => ({ stageId: s.id, name: s.name, kind: s.kind, total: 0, count: 0 }));
  const idx = new Map(byStage.map((b, i) => [b.stageId, i]));

  let openTotal = 0;
  let wonTotal = 0;
  let weighted = 0;

  for (const d of deals ?? []) {
    const i = d.stage_id ? idx.get(d.stage_id) : undefined;
    if (i !== undefined) {
      byStage[i].total += Number(d.value ?? 0);
      byStage[i].count += 1;
    }
    if (d.status === 'open') {
      openTotal += Number(d.value ?? 0);
      // 가중: open 단계 내 진행 위치 비례 (리드 20% → 마지막 open 80%)
      const stage = stageList.find((s) => s.id === d.stage_id);
      const pos = stage ? openStages.findIndex((s) => s.id === stage.id) : -1;
      const prob = pos >= 0 && openStages.length > 0 ? 0.2 + (0.6 * pos) / Math.max(1, openStages.length - 1) : 0.2;
      weighted += Number(d.value ?? 0) * prob;
    } else if (d.status === 'won') {
      wonTotal += Number(d.value ?? 0);
    }
  }

  return { byStage, openTotal, wonTotal, weightedForecast: Math.round(weighted) };
}
