'use server';

// 멤버 부재 표시 (presence-lite) — 채팅·미니채팅에서 상대가 지금 없는지 보여준다.
//
// 휴가: 승인된 leave_requests가 오늘을 덮으면 자동 파생 (저장 안 함 — 승인이 곧 표시).
// 자리비움/외근: 본인이 직접 설정(member_statuses), 당일만 유효 — 해제를 잊어도 다음날 사라짐.
// 휴가가 자리비움보다 우선. 감시 목적 아님: 상태는 본인만 설정·해제.

import dayjs from 'dayjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { getCurrentUser } from '@/actions/auth';
import { getEnabledModules } from '@/actions/modules';

export interface PresenceInfo {
  kind: 'leave' | 'status';
  label: string; // 휴가면 휴가 종류명(연차 등), 상태면 본인이 적은 문구
}

export type PresenceMap = Record<string, PresenceInfo>;

// user_id → 부재 정보. 부재 아닌 사람은 키 자체가 없다.
export async function getPresenceMap(): Promise<PresenceMap> {
  if (process.env.PREVIEW_MODE === 'true') return {};
  const supabase = await createClient();
  const today = dayjs().format('YYYY-MM-DD');
  const map: PresenceMap = {};

  // ① 자리비움/외근 (오늘 설정분만)
  try {
    const { data: statuses } = await supabase
      .from('member_statuses')
      .select('user_id, label')
      .eq('set_on', today);
    for (const s of statuses ?? []) {
      map[s.user_id] = { kind: 'status', label: s.label };
    }
  } catch {
    // 테이블 미적용 환경에서도 채팅이 죽지 않게
  }

  // ② 휴가 (승인분이 오늘을 덮으면) — 자리비움을 덮어쓴다.
  //    attendance 모듈이 꺼진 워크스페이스는 휴가 배지도 꺼진다 (모듈 유기성).
  try {
    if ((await getEnabledModules()).includes('attendance')) {
      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('user_id, leave_types(name)')
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today);
      for (const l of leaves ?? []) {
        const lt = l.leave_types as unknown as { name: string } | null;
        map[l.user_id] = { kind: 'leave', label: lt?.name ?? '휴가' };
      }
    }
  } catch {
    // 휴가 배지 실패가 채팅을 막지 않게 무시
  }

  return map;
}

// 내 오늘 상태 문구 (없으면 null)
export async function getMyStatus(): Promise<string | null> {
  if (process.env.PREVIEW_MODE === 'true') return null;
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return null;
  const { data } = await supabase
    .from('member_statuses')
    .select('label, set_on')
    .eq('user_id', me.id)
    .maybeSingle();
  if (!data || data.set_on !== dayjs().format('YYYY-MM-DD')) return null;
  return data.label;
}

export async function setMyStatus(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return { error: '상태 문구를 입력하세요' };
  if (trimmed.length > 20) return { error: '상태는 20자 이내로 입력하세요' };

  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };

  const { error } = await supabase.from('member_statuses').upsert({
    workspace_id: ws,
    user_id: me.id,
    label: trimmed,
    set_on: dayjs().format('YYYY-MM-DD'),
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function clearMyStatus() {
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };
  const { error } = await supabase.from('member_statuses').delete().eq('user_id', me.id);
  if (error) return { error: error.message };
  return { success: true };
}
