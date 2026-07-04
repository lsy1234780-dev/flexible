'use server';

// 초과근무 사전 신청 — 시작~종료 시각 방식 (HR.md v2, 오너 확정 2026-07-04).
//
// 결재: approvals 재사용(entity_type='overtime'). 승인/반려 → DB 트리거(090)가 status 동기화.
// 철칙: 신청·승인 "기록"과 분 단위 "산수"만. 수당 계산·인정 판정 안 함.
//       야간근로 구분 등은 시각을 그대로 내보내 급여SW가 판단하게 한다.

import dayjs from 'dayjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { getCurrentUser } from '@/actions/auth';
import { getWorkspaceMembers } from '@/actions/chat';
import { requestApproval } from '@/actions/approvals';
import { revalidatePath } from 'next/cache';

export interface OvertimeRequest {
  id: string;
  user_id: string;
  user_name: string | null;
  work_date: string;
  start_at: string;
  end_at: string;
  planned_minutes: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
}

// 신청 — 시작~종료는 'HH:mm'. 종료가 시작보다 이르면 자정 넘김(다음날)으로 처리.
export async function requestOvertime(input: {
  workDate: string;     // YYYY-MM-DD
  startTime: string;    // HH:mm
  endTime: string;      // HH:mm
  reason: string;
  approverId: string;
  approverName: string;
}) {
  const supabase = await createClient();
  const ws = await getCurrentWorkspaceId();
  const me = await getCurrentUser();
  if (!me) return { error: '로그인이 필요합니다' };
  if (!input.workDate || !input.startTime || !input.endTime) return { error: '날짜와 시간을 입력하세요' };

  const start = dayjs(`${input.workDate} ${input.startTime}`);
  let end = dayjs(`${input.workDate} ${input.endTime}`);
  if (!end.isAfter(start)) end = end.add(1, 'day'); // 19:00~01:00 같은 자정 넘김
  const minutes = end.diff(start, 'minute');
  if (minutes <= 0) return { error: '종료 시각이 시작보다 늦어야 합니다' };
  if (minutes > 16 * 60) return { error: '한 번에 16시간을 넘는 신청은 할 수 없습니다' };

  const { data: created, error } = await supabase
    .from('overtime_requests')
    .insert({
      workspace_id: ws,
      user_id: me.id,
      user_name: me.name,
      work_date: input.workDate,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      planned_minutes: minutes,
      reason: input.reason || null,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const label = `${me.name} 초과근무 ${dayjs(input.workDate).format('M/D')} ${input.startTime}~${input.endTime} (${h}시간${m ? ` ${m}분` : ''})`;
  const res = await requestApproval('overtime', created.id, label, input.approverId, input.approverName, input.reason);
  if (res?.error) {
    // 결재 생성 실패 → 고아 신청 방지 (leave와 동일 패턴)
    await supabase.from('overtime_requests').update({ status: 'cancelled' }).eq('id', created.id);
    return { error: res.error };
  }

  revalidatePath('/attendance');
  return { success: true };
}

export async function cancelOvertime(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('overtime_requests').update({ status: 'cancelled' }).eq('id', id);
  if (error) return { error: '대기 상태의 신청만 취소할 수 있습니다' };
  revalidatePath('/attendance');
  return { success: true };
}

export async function getMyOvertime(year: number): Promise<OvertimeRequest[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return [];
  const { data } = await supabase
    .from('overtime_requests')
    .select('*')
    .eq('user_id', me.id)
    .gte('work_date', `${year}-01-01`)
    .lte('work_date', `${year}-12-31`)
    .order('work_date', { ascending: false });
  return (data ?? []) as OvertimeRequest[];
}

// ─── 팀 초과근무 (관리자·집계용) ───

export interface TeamOvertimeRow {
  user_id: string;
  name: string;
  approved_minutes: number; // 해당 월 승인 합계
  count: number;
}

// 해당 월 승인된 초과근무 — 인별 합계 (팀 현황·CSV 요약용)
export async function getTeamOvertimeStats(year: number, month: number): Promise<TeamOvertimeRow[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me) return [];

  const start = dayjs(new Date(year, month - 1, 1));
  const { data } = await supabase
    .from('overtime_requests')
    .select('user_id, user_name, planned_minutes')
    .eq('status', 'approved')
    .gte('work_date', start.format('YYYY-MM-DD'))
    .lte('work_date', start.endOf('month').format('YYYY-MM-DD'));

  const members = await getWorkspaceMembers();
  const nameOf = (id: string, snap: string | null) =>
    snap ?? members.find((m) => m.user_id === id)?.name ?? (me.id === id ? me.name : '멤버');

  const byUser = new Map<string, TeamOvertimeRow>();
  for (const r of data ?? []) {
    let row = byUser.get(r.user_id);
    if (!row) {
      row = { user_id: r.user_id, name: nameOf(r.user_id, r.user_name), approved_minutes: 0, count: 0 };
      byUser.set(r.user_id, row);
    }
    row.approved_minutes += r.planned_minutes;
    row.count += 1;
  }
  return [...byUser.values()].sort((a, b) => b.approved_minutes - a.approved_minutes);
}

// 해당 월 승인 초과근무 원본 목록 (CSV 상세용)
export async function getTeamOvertimeList(year: number, month: number): Promise<OvertimeRequest[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const start = dayjs(new Date(year, month - 1, 1));
  const { data } = await supabase
    .from('overtime_requests')
    .select('*')
    .eq('status', 'approved')
    .gte('work_date', start.format('YYYY-MM-DD'))
    .lte('work_date', start.endOf('month').format('YYYY-MM-DD'))
    .order('work_date');
  return (data ?? []) as OvertimeRequest[];
}
