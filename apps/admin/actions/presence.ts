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
import { getWorkspaceMembers } from '@/actions/chat';
import { getEnabledModules } from '@/actions/modules';

export type PresenceKind = 'leave' | 'status' | 'working' | 'done';

export interface PresenceInfo {
  kind: PresenceKind;
  label: string; // 휴가=종류명, 상태=본인 문구, 나머지='출근'/'퇴근'
}

export type PresenceMap = Record<string, PresenceInfo>;

// user_id → 상태. 출근 전(기록 없음)은 표시하지 않는다 — 실제로 의미 있는 상태만:
//   출근(출근 찍음) / 퇴근(퇴근 찍음) / 휴가(승인) / 자리비움·외근(본인 설정).
// 우선순위: 휴가(승인 자동) > 자리비움/외근(본인 설정) > 출근 상태.
// attendance 모듈이 꺼진 워크스페이스는 본인 설정 상태만 표시된다 (모듈 유기성).
export async function getPresenceMap(): Promise<PresenceMap> {
  if (process.env.PREVIEW_MODE === 'true') return {};
  const map: PresenceMap = {};
  const today = dayjs().format('YYYY-MM-DD');

  try {
    const supabase = await createClient();
    const attendanceOn = (await getEnabledModules()).includes('attendance');

    // ① 출퇴근 상태 (attendance ON일 때만) — 기록 없는 사람은 배지 자체를 안 붙인다
    if (attendanceOn) {
      // 출퇴근 상태만 노출하는 RPC (시각은 비공개 — 087)
      const { data: clocks } = await supabase.rpc('get_team_clock_states');
      for (const c of (clocks ?? []) as { user_id: string; state: string }[]) {
        if (c.state === 'working') map[c.user_id] = { kind: 'working', label: '출근' };
        else if (c.state === 'done') map[c.user_id] = { kind: 'done', label: '퇴근' };
      }
    }

    // ② 자리비움/외근 (본인 설정, 오늘) — 출근 상태를 덮는다
    const { data: statuses } = await supabase
      .from('member_statuses')
      .select('user_id, label')
      .eq('set_on', today);
    for (const s of statuses ?? []) {
      map[s.user_id] = { kind: 'status', label: s.label };
    }

    // ③ 휴가 (승인분이 오늘을 덮으면) — 전부 덮는다
    if (attendanceOn) {
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
    // 부재 표시 실패가 채팅을 막지 않게 무시
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

// ─── 오늘의 팀 스냅샷 (인박스 상단 카드) ───
// "누가 휴가고, 누가 자리에 없고, 어떤 결재가 돌고 있는지"를 한눈에.
// 모듈 유기성: attendance 꺼지면 휴가 블록, expenses 꺼지면 경비 결재 블록이 사라진다.

export interface SnapshotPerson {
  user_id: string;
  name: string;
  label: string; // 휴가 종류명 또는 상태 문구
}

export interface TeamSnapshot {
  onLeave: SnapshotPerson[];                          // 오늘 휴가 (승인)
  away: SnapshotPerson[];                             // 자리비움/외근 (본인 설정, 오늘)
  upcoming: { name: string; label: string; start_date: string; end_date: string }[]; // 7일 내 시작 휴가
  pending: { entity_type: 'leave' | 'expense'; entity_id: string; label: string; approver: string }[]; // 진행 중 결재
}

const EMPTY_SNAPSHOT: TeamSnapshot = { onLeave: [], away: [], upcoming: [], pending: [] };

export async function getTeamSnapshot(): Promise<TeamSnapshot> {
  if (process.env.PREVIEW_MODE === 'true') return EMPTY_SNAPSHOT;
  try {
    const supabase = await createClient();
    const enabled = await getEnabledModules();
    const attendanceOn = enabled.includes('attendance');
    const expensesOn = enabled.includes('expenses');
    const today = dayjs().format('YYYY-MM-DD');
    const week = dayjs().add(7, 'day').format('YYYY-MM-DD');
    const snapshot: TeamSnapshot = { onLeave: [], away: [], upcoming: [], pending: [] };

    // 이름 매핑 (member_statuses엔 이름 스냅샷이 없음)
    const me = await getCurrentUser();
    const members = await getWorkspaceMembers();
    const nameOf = (id: string) =>
      members.find((m) => m.user_id === id)?.name ?? (me?.id === id ? me.name : '멤버');

    // ① 자리비움/외근 (오늘)
    const { data: statuses } = await supabase
      .from('member_statuses')
      .select('user_id, label')
      .eq('set_on', today);
    snapshot.away = (statuses ?? []).map((s) => ({
      user_id: s.user_id, name: nameOf(s.user_id), label: s.label,
    }));

    // ② 오늘 휴가 + 7일 내 시작 휴가 (attendance ON일 때만)
    if (attendanceOn) {
      const [{ data: todayLeaves }, { data: upcomingLeaves }] = await Promise.all([
        supabase
          .from('leave_requests')
          .select('user_id, user_name, leave_types(name)')
          .eq('status', 'approved')
          .lte('start_date', today)
          .gte('end_date', today),
        supabase
          .from('leave_requests')
          .select('user_name, start_date, end_date, leave_types(name)')
          .eq('status', 'approved')
          .gt('start_date', today)
          .lte('start_date', week)
          .order('start_date'),
      ]);
      snapshot.onLeave = (todayLeaves ?? []).map((l) => {
        const lt = l.leave_types as unknown as { name: string } | null;
        return { user_id: l.user_id, name: l.user_name ?? nameOf(l.user_id), label: lt?.name ?? '휴가' };
      });
      // 오늘 휴가 중인 사람은 자리비움 목록에서 제외 (휴가가 우선)
      const onLeaveIds = new Set(snapshot.onLeave.map((p) => p.user_id));
      snapshot.away = snapshot.away.filter((p) => !onLeaveIds.has(p.user_id));
      snapshot.upcoming = (upcomingLeaves ?? []).map((l) => {
        const lt = l.leave_types as unknown as { name: string } | null;
        return { name: l.user_name ?? '멤버', label: lt?.name ?? '휴가', start_date: l.start_date, end_date: l.end_date };
      });
    }

    // ③ 진행 중 결재 (휴가·경비 — 켜진 모듈만)
    const pendingTypes = [attendanceOn && 'leave', expensesOn && 'expense'].filter(Boolean) as string[];
    if (pendingTypes.length > 0) {
      const { data: approvals } = await supabase
        .from('approvals')
        .select('entity_type, entity_id, entity_label, approver_name')
        .eq('status', 'pending')
        .in('entity_type', pendingTypes)
        .order('created_at', { ascending: false })
        .limit(8);
      snapshot.pending = (approvals ?? []).map((a) => ({
        entity_type: a.entity_type as 'leave' | 'expense',
        entity_id: a.entity_id,
        label: a.entity_label ?? (a.entity_type === 'leave' ? '휴가 신청' : '경비 신청'),
        approver: a.approver_name ?? '승인자',
      }));
    }

    return snapshot;
  } catch {
    // 스냅샷 실패가 인박스를 막지 않게
    return EMPTY_SNAPSHOT;
  }
}
