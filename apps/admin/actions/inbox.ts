'use server';

// 인박스 상단 "내 하루" 브리핑 — 실무직원이 로그인 후 첫 화면에서
// "오늘 내가 뭘 해야 하는지 + 뭘 알아둬야 하는지"를 한눈에 본다.
//
// 원칙: 기존 액션(leaves/approvals/attendance)의 데이터를 조합만 한다. 새 판정·계산 로직 없음.
//       근태/경비 모듈이 꺼져 있으면 해당 항목은 null로 빠진다.

import dayjs from 'dayjs';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/actions/auth';
import { getEnabledModules } from '@/actions/modules';
import { getMyLeaveBalance } from '@/actions/leaves';
import { isAttendanceManagerAction, getTeamTodayStatus, getAttendancePolicy } from '@/actions/attendance';

export interface MyNextLeave {
  onLeaveToday: boolean;   // 오늘이 휴가 기간 안인가
  dday: number;            // 시작일까지 남은 일수 (오늘 시작이면 0)
  start_date: string;
  end_date: string;
  label: string;           // 휴가 종류명
}

export interface MyDayBriefing {
  name: string;
  today: string;                    // ISO date (YYYY-MM-DD)
  holidayName: string | null;       // 오늘이 공휴일이면 이름
  approvalsToReview: number;        // 내가 승인해야 할 결재 대기 건수
  myPendingLeaves: number;          // 내가 올린 휴가 신청 중 결재 대기 건수
  nextLeave: MyNextLeave | null;    // 다가오는(또는 오늘) 내 승인된 휴가
  leaveBalance: { remaining: number; granted: number } | null;
}

export async function getMyDayBriefing(): Promise<MyDayBriefing | null> {
  const me = await getCurrentUser();
  if (!me) return null;

  const today = dayjs().format('YYYY-MM-DD');
  const briefing: MyDayBriefing = {
    name: me.name,
    today,
    holidayName: null,
    approvalsToReview: 0,
    myPendingLeaves: 0,
    nextLeave: null,
    leaveBalance: null,
  };

  const enabled = await getEnabledModules();
  const attendanceOn = enabled.includes('attendance');

  const supabase = await createClient();

  // ① 내가 승인해야 할 결재 (모듈 무관 — 수주·구매발주·휴가·경비 무엇이든)
  const { count: approvalCount } = await supabase
    .from('approvals')
    .select('id', { count: 'exact', head: true })
    .eq('approver_id', me.id)
    .eq('status', 'pending');
  briefing.approvalsToReview = approvalCount ?? 0;

  // ②~④ 휴가 관련은 attendance 모듈이 켜진 경우만
  if (attendanceOn) {
    const [{ count: pendingLeaveCount }, { data: nextLeaveRows }, { data: holiday }, balance] =
      await Promise.all([
        supabase
          .from('leave_requests')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', me.id)
          .eq('status', 'pending'),
        supabase
          .from('leave_requests')
          .select('start_date, end_date, leave_types(name)')
          .eq('user_id', me.id)
          .eq('status', 'approved')
          .gte('end_date', today)
          .order('start_date', { ascending: true })
          .limit(1),
        supabase
          .from('holidays')
          .select('name')
          .eq('holiday_date', today)
          .maybeSingle(),
        getMyLeaveBalance(dayjs().year()),
      ]);

    briefing.myPendingLeaves = pendingLeaveCount ?? 0;
    briefing.holidayName = holiday?.name ?? null;
    briefing.leaveBalance = { remaining: balance.remaining, granted: balance.granted };

    const nl = nextLeaveRows?.[0];
    if (nl) {
      const lt = nl.leave_types as unknown as { name: string } | null;
      const start = dayjs(nl.start_date).startOf('day');
      const now = dayjs().startOf('day');
      briefing.nextLeave = {
        onLeaveToday: (nl.start_date <= today && today <= nl.end_date),
        dday: start.diff(now, 'day'),
        start_date: nl.start_date,
        end_date: nl.end_date,
        label: lt?.name ?? '휴가',
      };
    }
  }

  return briefing;
}

// ─── 관리자용: 오늘 팀 출근 현황 (인박스 위젯) ───
// "근무시간인데 휴가자 빼고 다 출근했나"를 인박스에서 바로 본다.
// getTeamTodayStatus(계산) + 정책(근무일·표준출근시각)만 조합. 근태 관리자에게만 반환.

export interface ManagerAttendanceSnapshot {
  isWorkday: boolean;       // 오늘이 정책상 근무일인가
  pastStart: boolean;       // 지금이 표준 출근시각을 지났는가 (출근 전 강조 조건)
  standardStart: string;    // 'HH:mm'
  total: number;            // 집계 대상 인원
  working: number;          // 근무 중 (사무실·재택·외근 포함)
  done: number;             // 퇴근 완료
  onLeave: number;          // 휴가
  notIn: { user_id: string; name: string }[]; // 아직 출근 안 함 (휴가 아님)
}

export async function getManagerAttendanceSnapshot(): Promise<ManagerAttendanceSnapshot | null> {
  // 근태 관리자에게만 — 아니면 위젯 자체를 렌더하지 않는다
  if (!(await isAttendanceManagerAction())) return null;

  const [team, policy] = await Promise.all([getTeamTodayStatus(), getAttendancePolicy()]);
  if (team.length === 0) return null;

  const now = dayjs();
  const isWorkday = policy.work_days.includes(now.day());
  const standardStart = (policy.standard_start ?? '09:00:00').slice(0, 5); // HH:mm
  const [sh, sm] = standardStart.split(':').map(Number);
  const pastStart = now.hour() > sh || (now.hour() === sh && now.minute() >= (sm ?? 0));

  return {
    isWorkday,
    pastStart,
    standardStart,
    total: team.length,
    working: team.filter((m) => m.status === 'working').length,
    done: team.filter((m) => m.status === 'done').length,
    onLeave: team.filter((m) => m.status === 'leave').length,
    notIn: team
      .filter((m) => m.status === 'not_in')
      .map((m) => ({ user_id: m.user_id, name: m.name })),
  };
}
