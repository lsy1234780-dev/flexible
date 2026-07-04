import { getMyMentions, getRecordActivity } from '@/actions/chat';
import { getUrgentItems } from '@/actions/dashboard';
import { getEnabledModules } from '@/actions/modules';
import { getTeamSnapshot } from '@/actions/presence';
import { getMyTodayRecord, getAttendancePolicy, getMyWeeklySummary } from '@/actions/attendance';
import { getMyExpenseFlow } from '@/actions/expenses';
import InboxClient from './InboxClient';
import type { InboxAttendanceData } from './InboxAttendance';

export const dynamic = 'force-dynamic';

// 통합 인박스 — 로그인 후 첫 화면.
// "내 근태(출퇴근) + 내 경비 진행 + 멘션 + 레코드 스레드 활동 + ERP 긴급 + 오늘의 팀"을 한 화면에 모은다.
// 카톡 대신 아침에 여는 화면이 되는 것이 목표 (F안).
export default async function InboxPage() {
  const enabled = await getEnabledModules();
  const chatOn = enabled.includes('chat');
  const attendanceOn = enabled.includes('attendance');
  const expensesOn = enabled.includes('expenses');

  const [mentions, activity, urgent, snapshot, attendance, myExpenses] = await Promise.all([
    chatOn ? getMyMentions(30).catch(() => []) : Promise.resolve([]),
    chatOn ? getRecordActivity(30).catch(() => []) : Promise.resolve([]),
    getUrgentItems().catch(() => []),
    getTeamSnapshot(),
    attendanceOn
      ? Promise.all([getMyTodayRecord(), getAttendancePolicy(), getMyWeeklySummary()])
          .then(([today, policy, weekly]): InboxAttendanceData => ({ today, policy, weekly }))
          .catch(() => null)
      : Promise.resolve(null),
    expensesOn ? getMyExpenseFlow() : Promise.resolve([]),
  ]);

  return (
    <InboxClient
      mentions={mentions}
      activity={activity}
      urgent={urgent}
      snapshot={snapshot}
      attendance={attendance}
      myExpenses={myExpenses}
      chatEnabled={chatOn}
    />
  );
}
