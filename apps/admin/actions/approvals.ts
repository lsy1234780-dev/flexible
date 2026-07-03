'use server';

// 승인 워크플로우 — 수주 확정(actions/orders.ts) / 구매발주 확정(actions/purchaseOrders.ts)의 게이트.
// 건별로 승인자를 지정하는 방식(고정 역할이 아님). 승인 요청은 그 레코드의 채팅 스레드에
// 승인자를 @멘션하는 형태로 남겨서, 별도 알림 시스템 없이 기존 인박스(멘션 탭)에 자연스럽게 뜨게 한다.

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { getCurrentUser } from '@/actions/auth';
import { sendRecordMessage, postRecordEvent } from '@/actions/chat';
import { getEnabledModules } from '@/actions/modules';
import { revalidatePath } from 'next/cache';

export interface Approval {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_by_name: string | null;
  approver_id: string;
  approver_name: string | null;
  note: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}

// 레코드가 지금 승인된 상태인지 — orders.ts/purchaseOrders.ts가 확정 액션 실행 전에 호출하는 게이트.
export async function isApproved(entityType: string, entityId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('approvals')
    .select('status')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.status === 'approved';
}

// 이 레코드의 최신 승인 요청 상태 (UI 배지 표시용)
export async function getApprovalStatus(entityType: string, entityId: string): Promise<Approval | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('approvals')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Approval | null;
}

export async function requestApproval(
  entityType: string,
  entityId: string,
  entityLabel: string,
  approverId: string,
  approverName: string,
  note: string,
) {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };
  if (approverId === me.id) return { error: '본인을 승인자로 지정할 수 없습니다' };

  // 중복 방지 — 이미 대기중인 요청이 있으면 재요청 불가 (DB에도 partial unique index로 하드 가드)
  const { data: existing } = await supabase
    .from('approvals')
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) return { error: '이미 대기중인 승인 요청이 있습니다' };

  const { data, error } = await supabase
    .from('approvals')
    .insert({
      workspace_id: ws,
      entity_type: entityType,
      entity_id: entityId,
      entity_label: entityLabel,
      requested_by: me.id,
      requested_by_name: me.name,
      approver_id: approverId,
      approver_name: approverName,
      note: note || null,
    })
    .select('id')
    .single();
  if (error) {
    // partial unique index 위반(동시 요청 경합) — 위 select가 못 잡은 레이스도 여기서 막힘
    if (error.code === '23505') return { error: '이미 대기중인 승인 요청이 있습니다' };
    return { error: error.message };
  }

  // 승인자 알림은 두 경로로 — 인박스는 chat과 무관하게 승인 대기를 노출하므로(getUrgentItems),
  // 여기서는 chat이 켜져 있을 때만 레코드 스레드에 멘션을 추가로 남긴다(스레드 맥락 보존용).
  const chatEnabled = (await getEnabledModules()).includes('chat');
  if (chatEnabled) {
    const msg = await sendRecordMessage(
      entityType, entityId, entityLabel,
      `@${approverName} 승인 요청드립니다${note ? ` — ${note}` : ''}`,
      [{ entity_type: 'user', entity_id: approverId, label: approverName }],
      [],
    );
    if (msg?.error) return { error: msg.error };
  }

  revalidatePath('/', 'layout');
  return { id: data.id };
}

export async function decideApproval(approvalId: string, decision: 'approved' | 'rejected', decisionNote: string) {
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };

  const { data: approval } = await supabase
    .from('approvals')
    .select('id, approver_id, entity_type, entity_id, entity_label, status')
    .eq('id', approvalId)
    .single();
  if (!approval) return { error: '승인 요청을 찾을 수 없습니다' };
  if (approval.approver_id !== me.id) return { error: '지정된 승인자만 처리할 수 있습니다' };
  if (approval.status !== 'pending') return { error: '이미 처리된 요청입니다' };

  const { error } = await supabase
    .from('approvals')
    .update({ status: decision, decision_note: decisionNote || null, decided_at: new Date().toISOString() })
    .eq('id', approvalId);
  if (error) return { error: error.message };

  const verb = decision === 'approved' ? '승인했습니다 — 이제 확정할 수 있습니다' : '반려했습니다';
  await postRecordEvent(
    approval.entity_type, approval.entity_id, approval.entity_label ?? '',
    `${me.name} 님이 ${verb}${decisionNote ? ` — ${decisionNote}` : ''}`,
  );

  revalidatePath('/', 'layout');
  return { ok: true };
}

// 내가 승인해야 할 대기 목록
export async function getMyPendingApprovals(): Promise<Approval[]> {
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return [];
  const { data } = await supabase
    .from('approvals')
    .select('*')
    .eq('approver_id', me.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return (data ?? []) as Approval[];
}
