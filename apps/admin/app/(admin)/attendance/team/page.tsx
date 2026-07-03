import dayjs from 'dayjs';
import { isAttendanceManagerAction, getTeamTodayStatus, getAttendancePolicy, getHolidays } from '@/actions/attendance';
import { getTeamLeaves } from '@/actions/leaves';
import TeamClient from './TeamClient';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const isManager = await isAttendanceManagerAction();
  if (!isManager) {
    return (
      <div className="max-w-lg rounded-xl border bg-white p-8 text-center">
        <p className="font-semibold text-gray-900">근태 관리자 권한이 필요합니다</p>
        <p className="text-sm text-gray-500 mt-1">
          워크스페이스 소유자 또는 기존 근태 관리자에게 권한 부여를 요청하세요.
        </p>
      </div>
    );
  }

  const month = dayjs().startOf('month');
  const [todayStatus, policy, holidays, monthLeaves] = await Promise.all([
    getTeamTodayStatus(),
    getAttendancePolicy(),
    getHolidays(month.year()),
    getTeamLeaves(month.format('YYYY-MM-DD'), month.endOf('month').format('YYYY-MM-DD')),
  ]);

  return (
    <TeamClient
      todayStatus={todayStatus}
      policy={policy}
      initialHolidays={holidays}
      initialLeaves={monthLeaves}
    />
  );
}
