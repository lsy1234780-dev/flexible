import dayjs from 'dayjs';
import {
  getAttendancePolicy,
  getMyTodayRecord,
  getMyMonthRecords,
  getMyWeeklySummary,
  getHolidays,
} from '@/actions/attendance';
import { getMyLeaveRequests } from '@/actions/leaves';
import { getMyOvertime } from '@/actions/overtime';
import { getMyPendingApprovals } from '@/actions/approvals';
import { getWorkspaceMembers } from '@/actions/chat';
import AttendanceClient from './AttendanceClient';

export const dynamic = 'force-dynamic';

export default async function AttendancePage() {
  const now = dayjs();
  const [policy, today, monthRecords, weekly, holidays, myLeaves, myOvertime, pendingApprovals, members] = await Promise.all([
    getAttendancePolicy(),
    getMyTodayRecord(),
    getMyMonthRecords(now.year(), now.month() + 1),
    getMyWeeklySummary(),
    getHolidays(now.year()),
    getMyLeaveRequests(now.year()),
    getMyOvertime(now.year()),
    getMyPendingApprovals(),
    getWorkspaceMembers(),
  ]);

  return (
    <AttendanceClient
      policy={policy}
      initialToday={today}
      initialMonthRecords={monthRecords}
      initialWeekly={weekly}
      initialHolidays={holidays}
      initialLeaves={myLeaves.filter((l) => l.status === 'approved')}
      myOvertime={myOvertime}
      overtimeApprovals={pendingApprovals.filter((a) => a.entity_type === 'overtime')}
      members={members}
    />
  );
}
