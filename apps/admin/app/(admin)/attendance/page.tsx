import dayjs from 'dayjs';
import {
  getAttendancePolicy,
  getMyTodayRecord,
  getMyMonthRecords,
  getMyWeeklySummary,
  getHolidays,
} from '@/actions/attendance';
import { getMyLeaveRequests } from '@/actions/leaves';
import AttendanceClient from './AttendanceClient';

export const dynamic = 'force-dynamic';

export default async function AttendancePage() {
  const now = dayjs();
  const [policy, today, monthRecords, weekly, holidays, myLeaves] = await Promise.all([
    getAttendancePolicy(),
    getMyTodayRecord(),
    getMyMonthRecords(now.year(), now.month() + 1),
    getMyWeeklySummary(),
    getHolidays(now.year()),
    getMyLeaveRequests(now.year()),
  ]);

  return (
    <AttendanceClient
      policy={policy}
      initialToday={today}
      initialMonthRecords={monthRecords}
      initialWeekly={weekly}
      initialHolidays={holidays}
      initialLeaves={myLeaves.filter((l) => l.status === 'approved')}
    />
  );
}
