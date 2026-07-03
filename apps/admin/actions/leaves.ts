'use server';

// 휴가 — 신청·잔여·부재 현황 (docs/architecture/HR.md)
//
// 승인은 approvals 재사용(entity_type='leave'): 결재는 requestApproval/decideApproval이 처리하고,
// 승인/반려 결과는 DB 트리거(approvals_sync_leave, 081)가 leave_requests.status에 동기화한다.
// 연차 부여량(granted)은 관리자 입력 — 자동 산정 안 함. used는 승인된 신청에서 계산(저장 안 함).

import dayjs from 'dayjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { getCurrentUser } from '@/actions/auth';
import { getWorkspaceMembers } from '@/actions/chat';
import { requestApproval } from '@/actions/approvals';
import { getAttendancePolicy, getHolidays } from '@/actions/attendance';
import { revalidatePath } from 'next/cache';

// ─── 타입 ───

export interface LeaveType {
  id: string;
  name: string;
  deducts_annual: boolean;
  day_weight: number;
  sort_order: number;
}

export interface LeaveRequest {
  id: string;
  user_id: string;
  user_name: string | null;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  leave_types?: { name: string; deducts_annual: boolean } | null;
}

export interface LeaveBalance {
  year: number;
  granted: number;   // 관리자 입력
  used: number;      // 승인된 신청 합계 (계산값)
  remaining: number;
}

// ─── 휴가 종류 ───

export async function getLeaveTypes(): Promise<LeaveType[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  let { data, error } = await supabase.from('leave_types').select('*').order('sort_order');
  if (error) throw new Error(error.message);

  // 모듈 켜고 처음 들어오면 기본 종류 자동 시드 (deal_stages와 같은 멱등 패턴)
  if (!data || data.length === 0) {
    const ws = await getCurrentWorkspaceId();
    await supabase.rpc('seed_default_leave_types', { p_ws: ws });
    ({ data, error } = await supabase.from('leave_types').select('*').order('sort_order'));
    if (error) throw new Error(error.message);
  }
  return (data ?? []) as LeaveType[];
}

export async function createLeaveType(name: string, deductsAnnual: boolean, dayWeight: number) {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const { count } = await supabase
    .from('leave_types')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', ws);
  const { error } = await supabase.from('leave_types').insert({
    workspace_id: ws,
    name: name.trim(),
    deducts_annual: deductsAnnual,
    day_weight: dayWeight,
    sort_order: count ?? 0,
  });
  if (error) return { error: error.message };
  revalidatePath('/attendance/policy');
  return { success: true };
}

export async function deleteLeaveType(id: string) {
  const supabase = await createClient();
  // 사용 중인 종류는 삭제 방지 (데이터 보호 — deal_stages 삭제와 같은 패턴)
  const { count } = await supabase
    .from('leave_requests')
    .select('id', { count: 'exact', head: true })
    .eq('leave_type_id', id);
  if (count && count > 0) {
    return { error: `이 종류로 신청된 휴가가 ${count}건 있습니다. 삭제할 수 없습니다.` };
  }
  const { error } = await supabase.from('leave_types').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/attendance/policy');
  return { success: true };
}

// ─── 근무일 산수 ───

// 주말(work_days 제외)·공휴일 제외한 근무일 수 — "산수"만, 법 해석 없음
async function countWorkingDays(startDate: string, endDate: string): Promise<number> {
  const policy = await getAttendancePolicy();
  const years = new Set([dayjs(startDate).year(), dayjs(endDate).year()]);
  const holidaySet = new Set<string>();
  for (const y of years) {
    for (const h of await getHolidays(y)) holidaySet.add(h.holiday_date);
  }

  let count = 0;
  let cur = dayjs(startDate);
  const end = dayjs(endDate);
  while (cur.isBefore(end) || cur.isSame(end, 'day')) {
    if (policy.work_days.includes(cur.day()) && !holidaySet.has(cur.format('YYYY-MM-DD'))) {
      count += 1;
    }
    cur = cur.add(1, 'day');
  }
  return count;
}

// 신청 폼에서 일수 미리보기용
export async function previewLeaveDays(startDate: string, endDate: string, leaveTypeId: string): Promise<number> {
  const supabase = await createClient();
  const { data: type } = await supabase
    .from('leave_types')
    .select('day_weight')
    .eq('id', leaveTypeId)
    .single();
  const workingDays = await countWorkingDays(startDate, endDate);
  return workingDays * (type?.day_weight ?? 1);
}

// ─── 휴가 신청 ───

export async function requestLeave(input: {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  approverId: string;
  approverName: string;
}) {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };
  if (dayjs(input.endDate).isBefore(dayjs(input.startDate))) return { error: '종료일이 시작일보다 빠릅니다' };

  const { data: type } = await supabase
    .from('leave_types')
    .select('id, name, day_weight')
    .eq('id', input.leaveTypeId)
    .single();
  if (!type) return { error: '휴가 종류를 찾을 수 없습니다' };

  // 일수는 서버에서 재계산 (클라이언트 값 신뢰 안 함)
  const days = (await countWorkingDays(input.startDate, input.endDate)) * type.day_weight;
  if (days <= 0) return { error: '선택한 기간에 근무일이 없습니다 (주말·공휴일 확인)' };

  const { data: created, error } = await supabase
    .from('leave_requests')
    .insert({
      workspace_id: ws,
      user_id: me.id,
      user_name: me.name,
      leave_type_id: type.id,
      start_date: input.startDate,
      end_date: input.endDate,
      days,
      reason: input.reason || null,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  // 결재 요청 (approvals 재사용 — 인박스·레코드 스레드 멘션 알림 공짜)
  const label = `${me.name} ${type.name} ${input.startDate}${input.startDate !== input.endDate ? `~${input.endDate}` : ''} (${days}일)`;
  const res = await requestApproval('leave', created.id, label, input.approverId, input.approverName, input.reason);
  if (res?.error) {
    // 결재 요청 실패 시 신청도 취소 (고아 신청 방지)
    await supabase.from('leave_requests').update({ status: 'cancelled' }).eq('id', created.id);
    return { error: res.error };
  }

  revalidatePath('/attendance/leaves');
  return { success: true };
}

export async function cancelLeaveRequest(id: string) {
  const supabase = await createClient();
  // guard 트리거가 pending → cancelled만 허용 (본인 행만 — RLS)
  const { error } = await supabase.from('leave_requests').update({ status: 'cancelled' }).eq('id', id);
  if (error) return { error: '대기 상태의 신청만 취소할 수 있습니다' };
  revalidatePath('/attendance/leaves');
  return { success: true };
}

export async function getMyLeaveRequests(year: number): Promise<LeaveRequest[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return [];
  const { data } = await supabase
    .from('leave_requests')
    .select('*, leave_types(name, deducts_annual)')
    .eq('user_id', me.id)
    .gte('start_date', `${year}-01-01`)
    .lte('start_date', `${year}-12-31`)
    .order('created_at', { ascending: false });
  return (data ?? []) as LeaveRequest[];
}

// ─── 연차 잔여 (granted 관리자 입력 − used 계산) ───

export async function getMyLeaveBalance(year: number): Promise<LeaveBalance> {
  if (process.env.PREVIEW_MODE === 'true') return { year, granted: 0, used: 0, remaining: 0 };
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return { year, granted: 0, used: 0, remaining: 0 };

  const [{ data: balance }, { data: approved }] = await Promise.all([
    supabase
      .from('leave_balances')
      .select('granted')
      .eq('user_id', me.id)
      .eq('year', year)
      .maybeSingle(),
    supabase
      .from('leave_requests')
      .select('days, leave_types(deducts_annual)')
      .eq('user_id', me.id)
      .eq('status', 'approved')
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`),
  ]);

  const granted = balance?.granted ?? 0;
  const used = (approved ?? []).reduce((sum, r) => {
    const lt = r.leave_types as unknown as { deducts_annual: boolean } | null;
    return lt?.deducts_annual ? sum + Number(r.days) : sum;
  }, 0);
  return { year, granted: Number(granted), used, remaining: Number(granted) - used };
}

// 관리자: 멤버별 부여량 입력/수정
export async function setLeaveGranted(userId: string, year: number, granted: number, note: string) {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };

  const { error } = await supabase.from('leave_balances').upsert({
    workspace_id: ws,
    user_id: userId,
    year,
    granted,
    note: note || null,
    updated_by: me.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath('/attendance/policy');
  return { success: true };
}

// 관리자: 전 멤버 부여/사용 현황
export interface TeamBalanceRow {
  user_id: string;
  name: string;
  granted: number;
  used: number;
  remaining: number;
  note: string | null;
}

export async function getTeamBalances(year: number): Promise<TeamBalanceRow[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return [];

  const members = await getWorkspaceMembers();
  const all = [{ user_id: me.id, name: me.name }, ...members.map((m) => ({ user_id: m.user_id, name: m.name }))];

  const [{ data: balances }, { data: approved }] = await Promise.all([
    supabase.from('leave_balances').select('user_id, granted, note').eq('year', year),
    supabase
      .from('leave_requests')
      .select('user_id, days, leave_types(deducts_annual)')
      .eq('status', 'approved')
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`),
  ]);

  return all.map((m) => {
    const bal = (balances ?? []).find((b) => b.user_id === m.user_id);
    const used = (approved ?? [])
      .filter((r) => r.user_id === m.user_id)
      .reduce((sum, r) => {
        const lt = r.leave_types as unknown as { deducts_annual: boolean } | null;
        return lt?.deducts_annual ? sum + Number(r.days) : sum;
      }, 0);
    const granted = Number(bal?.granted ?? 0);
    return { user_id: m.user_id, name: m.name, granted, used, remaining: granted - used, note: bal?.note ?? null };
  });
}

// ─── 부재 현황 (팀 캘린더 + 신청 충돌 표시) ───

export interface TeamLeaveItem {
  id: string;
  user_id: string;
  user_name: string | null;
  type_name: string;
  start_date: string;
  end_date: string;
  days: number;
  status: 'pending' | 'approved';
}

// 기간과 겹치는 팀 휴가 (승인 + 대기). 부재 현황판·"그날 이미 김대리 연차" 충돌 표시 공용.
export async function getTeamLeaves(from: string, to: string): Promise<TeamLeaveItem[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('leave_requests')
    .select('id, user_id, user_name, start_date, end_date, days, status, leave_types(name)')
    .in('status', ['pending', 'approved'])
    .lte('start_date', to)
    .gte('end_date', from)
    .order('start_date');
  return (data ?? []).map((r) => {
    const lt = r.leave_types as unknown as { name: string } | null;
    return {
      id: r.id,
      user_id: r.user_id,
      user_name: r.user_name,
      type_name: lt?.name ?? '휴가',
      start_date: r.start_date,
      end_date: r.end_date,
      days: Number(r.days),
      status: r.status as 'pending' | 'approved',
    };
  });
}
