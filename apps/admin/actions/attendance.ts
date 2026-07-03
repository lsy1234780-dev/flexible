'use server';

// 근태 모듈 — 출퇴근 기록·정책·공휴일·관리자 부여 (docs/architecture/HR.md)
//
// 원칙: "기록·산수만, 판정 안 함". 법적 의미가 있는 숫자(주간 상한 등)는 전부
//       관리자가 정책에 입력한 값이고, 여기서는 그 값대로 비교·표시만 한다.
// 권한: 관리자 = attendance_managers에 명시적으로 부여받은 사람 (+ owner fallback).
//       팀 조회·정책 쓰기는 전부 anon+RLS(is_attendance_manager)로 격리 — service role 안 씀.

import dayjs from 'dayjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { getCurrentUser } from '@/actions/auth';
import { getWorkspaceMembers } from '@/actions/chat';
import { revalidatePath } from 'next/cache';

// ─── 타입 ───

export interface AttendancePolicy {
  workspace_id: string;
  punch_method: 'button' | 'ip' | 'gps';
  standard_start: string;   // 'HH:mm:ss'
  standard_end: string;
  break_minutes: number;
  work_days: number[];      // 0=일 ~ 6=토
  weekly_max_minutes: number | null;
}

export interface AttendanceRecord {
  id: string;
  user_id: string;
  work_date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  work_type: 'office' | 'remote' | 'field';
  worked_minutes: number | null;
  memo: string | null;
}

export interface AttendanceManager {
  user_id: string;
  name: string;
  granted_by_name: string | null;
  created_at: string;
}

export interface TeamMemberStatus {
  user_id: string;
  name: string;
  status: 'off' | 'working' | 'done' | 'leave' | 'not_in'; // 휴가 > 출근중 > 퇴근 > 미출근
  work_type: 'office' | 'remote' | 'field' | null;
  clock_in_at: string | null;
  clock_out_at: string | null;
  worked_minutes: number | null;
  leave_label: string | null; // 휴가면 종류명
}

// 정책 기본값 (DB에 행이 없을 때 — 관리자가 저장하면 행 생성)
const DEFAULT_POLICY: Omit<AttendancePolicy, 'workspace_id'> = {
  punch_method: 'button',
  standard_start: '09:00:00',
  standard_end: '18:00:00',
  break_minutes: 60,
  work_days: [1, 2, 3, 4, 5],
  weekly_max_minutes: null,
};

// ─── 관리자 판정 ───

// 현재 유저가 근태 관리자인가 (attendance_managers 등록 or 워크스페이스 owner)
export async function isAttendanceManagerAction(): Promise<boolean> {
  if (process.env.PREVIEW_MODE === 'true') return true;
  try {
    const supabase = await createClient();
    const ws = await getCurrentWorkspaceId();
    const { data } = await supabase.rpc('is_attendance_manager', { p_ws: ws });
    return data === true;
  } catch {
    return false;
  }
}

export async function getAttendanceManagers(): Promise<AttendanceManager[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('attendance_managers')
    .select('user_id, granted_by_name, created_at')
    .order('created_at');
  if (error) throw new Error(error.message);

  // 이름은 멤버 목록에서 (get_workspace_members는 본인 제외라 본인 보강)
  const members = await getWorkspaceMembers();
  const me = await getCurrentUser();
  const nameOf = (id: string) =>
    members.find((m) => m.user_id === id)?.name ?? (me?.id === id ? me.name : '알 수 없음');

  return (data ?? []).map((r) => ({
    user_id: r.user_id,
    name: nameOf(r.user_id),
    granted_by_name: r.granted_by_name,
    created_at: r.created_at,
  }));
}

export async function grantAttendanceManager(userId: string) {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };

  const { error } = await supabase.from('attendance_managers').insert({
    workspace_id: ws,
    user_id: userId,
    granted_by: me.id,
    granted_by_name: me.name,
  });
  if (error) {
    if (error.code === '23505') return { error: '이미 관리자입니다' };
    return { error: error.message };
  }
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function revokeAttendanceManager(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('attendance_managers').delete().eq('user_id', userId);
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  return { success: true };
}

// ─── 정책 ───

export async function getAttendancePolicy(): Promise<AttendancePolicy> {
  const ws = await getCurrentWorkspaceId();
  if (process.env.PREVIEW_MODE === 'true') return { workspace_id: ws, ...DEFAULT_POLICY };

  const supabase = await createClient();
  const { data } = await supabase
    .from('attendance_policy')
    .select('*')
    .eq('workspace_id', ws)
    .maybeSingle();
  if (!data) return { workspace_id: ws, ...DEFAULT_POLICY };
  return data as AttendancePolicy;
}

export async function updateAttendancePolicy(fields: {
  standard_start?: string;
  standard_end?: string;
  break_minutes?: number;
  work_days?: number[];
  weekly_max_minutes?: number | null;
}) {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };

  // upsert — RLS(is_attendance_manager)가 관리자 아닌 쓰기를 차단
  const { error } = await supabase.from('attendance_policy').upsert({
    workspace_id: ws,
    ...fields,
    updated_by: me.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath('/attendance', 'layout');
  return { success: true };
}

// ─── 출퇴근 ───

export async function getMyTodayRecord(): Promise<AttendanceRecord | null> {
  if (process.env.PREVIEW_MODE === 'true') return null;
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return null;

  const { data } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('user_id', me.id)
    .eq('work_date', dayjs().format('YYYY-MM-DD'))
    .maybeSingle();
  return data as AttendanceRecord | null;
}

export async function clockIn(workType: 'office' | 'remote' | 'field' = 'office') {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };

  const today = dayjs().format('YYYY-MM-DD');
  const existing = await getMyTodayRecord();
  if (existing?.clock_in_at) return { error: '이미 출근 처리되었습니다' };

  if (existing) {
    const { error } = await supabase
      .from('attendance_records')
      .update({ clock_in_at: new Date().toISOString(), work_type: workType, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from('attendance_records').insert({
      workspace_id: ws,
      user_id: me.id,
      work_date: today,
      clock_in_at: new Date().toISOString(),
      work_type: workType,
    });
    if (error) {
      if (error.code === '23505') return { error: '이미 출근 처리되었습니다' };
      return { error: error.message };
    }
  }
  revalidatePath('/attendance');
  return { success: true };
}

export async function clockOut() {
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };

  const record = await getMyTodayRecord();
  if (!record?.clock_in_at) return { error: '출근 기록이 없습니다' };
  if (record.clock_out_at) return { error: '이미 퇴근 처리되었습니다' };

  // 산수: (퇴근 - 출근) - 휴게. "판정"이 아니라 뺄셈 결과 저장.
  const policy = await getAttendancePolicy();
  const now = new Date();
  const rawMinutes = Math.floor((now.getTime() - new Date(record.clock_in_at).getTime()) / 60000);
  const workedMinutes = Math.max(0, rawMinutes - policy.break_minutes);

  const { error } = await supabase
    .from('attendance_records')
    .update({
      clock_out_at: now.toISOString(),
      worked_minutes: workedMinutes,
      updated_at: now.toISOString(),
    })
    .eq('id', record.id);
  if (error) return { error: error.message };
  revalidatePath('/attendance');
  return { success: true };
}

// ─── 내 근태 조회 ───

// 월 기록 (캘린더용)
export async function getMyMonthRecords(year: number, month: number): Promise<AttendanceRecord[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return [];

  const start = dayjs(new Date(year, month - 1, 1));
  const { data } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('user_id', me.id)
    .gte('work_date', start.format('YYYY-MM-DD'))
    .lte('work_date', start.endOf('month').format('YYYY-MM-DD'))
    .order('work_date');
  return (data ?? []) as AttendanceRecord[];
}

export interface WeeklySummary {
  weekStart: string;
  totalMinutes: number;        // 이번주 합계 (퇴근 처리된 기록 기준)
  weeklyMaxMinutes: number | null;
  overLimit: boolean;          // 설정값 초과 여부 — "알림"일 뿐 판정 아님
}

// 이번주(월~일) 근무시간 합계 + 정책 임계 초과 플래그
export async function getMyWeeklySummary(): Promise<WeeklySummary> {
  const policy = await getAttendancePolicy();
  // dayjs 기본 주 시작은 일요일 — 월요일 시작으로 보정
  const today = dayjs();
  const dow = today.day(); // 0=일
  const weekStart = today.subtract(dow === 0 ? 6 : dow - 1, 'day').startOf('day');

  if (process.env.PREVIEW_MODE === 'true') {
    return { weekStart: weekStart.format('YYYY-MM-DD'), totalMinutes: 0, weeklyMaxMinutes: policy.weekly_max_minutes, overLimit: false };
  }

  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return { weekStart: weekStart.format('YYYY-MM-DD'), totalMinutes: 0, weeklyMaxMinutes: policy.weekly_max_minutes, overLimit: false };

  const { data } = await supabase
    .from('attendance_records')
    .select('worked_minutes')
    .eq('user_id', me.id)
    .gte('work_date', weekStart.format('YYYY-MM-DD'))
    .lte('work_date', weekStart.add(6, 'day').format('YYYY-MM-DD'));

  const total = (data ?? []).reduce((sum, r) => sum + (r.worked_minutes ?? 0), 0);
  return {
    weekStart: weekStart.format('YYYY-MM-DD'),
    totalMinutes: total,
    weeklyMaxMinutes: policy.weekly_max_minutes,
    overLimit: policy.weekly_max_minutes != null && total > policy.weekly_max_minutes,
  };
}

// ─── 공휴일 ───

export async function getHolidays(year: number): Promise<{ id: string; holiday_date: string; name: string }[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('holidays')
    .select('id, holiday_date, name')
    .gte('holiday_date', `${year}-01-01`)
    .lte('holiday_date', `${year}-12-31`)
    .order('holiday_date');
  return data ?? [];
}

export async function addHoliday(date: string, name: string) {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const { error } = await supabase.from('holidays').insert({
    workspace_id: ws,
    holiday_date: date,
    name: name.trim(),
  });
  if (error) {
    if (error.code === '23505') return { error: '이미 등록된 날짜입니다' };
    return { error: error.message };
  }
  revalidatePath('/attendance/policy');
  return { success: true };
}

export async function deleteHoliday(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('holidays').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/attendance/policy');
  return { success: true };
}

// ─── 팀 현황 (관리자) ───

// 오늘 팀원별 상태 — RLS가 관리자 아닌 유저에게는 본인 기록만 돌려주므로
// 관리자가 아니면 자연스럽게 자기 것만 보이지만, 페이지에서 한 번 더 게이트한다.
export async function getTeamTodayStatus(): Promise<TeamMemberStatus[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return [];

  const today = dayjs().format('YYYY-MM-DD');
  const members = await getWorkspaceMembers();
  const all = [{ user_id: me.id, name: me.name, email: me.email, department: null as string | null }, ...members];

  const [{ data: records }, { data: leaves }] = await Promise.all([
    supabase.from('attendance_records').select('*').eq('work_date', today),
    supabase
      .from('leave_requests')
      .select('user_id, leave_types(name)')
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today),
  ]);

  return all.map((m) => {
    const leave = (leaves ?? []).find((l) => l.user_id === m.user_id);
    if (leave) {
      const lt = leave.leave_types as unknown as { name: string } | null;
      return {
        user_id: m.user_id, name: m.name, status: 'leave' as const,
        work_type: null, clock_in_at: null, clock_out_at: null, worked_minutes: null,
        leave_label: lt?.name ?? '휴가',
      };
    }
    const rec = (records ?? []).find((r) => r.user_id === m.user_id);
    if (!rec?.clock_in_at) {
      return {
        user_id: m.user_id, name: m.name, status: 'not_in' as const,
        work_type: null, clock_in_at: null, clock_out_at: null, worked_minutes: null, leave_label: null,
      };
    }
    return {
      user_id: m.user_id,
      name: m.name,
      status: rec.clock_out_at ? ('done' as const) : ('working' as const),
      work_type: rec.work_type,
      clock_in_at: rec.clock_in_at,
      clock_out_at: rec.clock_out_at,
      worked_minutes: rec.worked_minutes,
      leave_label: null,
    };
  });
}
