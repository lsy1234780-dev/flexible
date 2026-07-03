import dayjs from 'dayjs';
import {
  isAttendanceManagerAction, getAttendancePolicy, getHolidays, getAttendanceManagers,
} from '@/actions/attendance';
import { getLeaveTypes, getTeamBalances } from '@/actions/leaves';
import { getWorkspaceMembers } from '@/actions/chat';
import PolicyClient from './PolicyClient';

export const dynamic = 'force-dynamic';

export default async function PolicyPage() {
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

  const year = dayjs().year();
  const [policy, holidays, types, balances, managers, members] = await Promise.all([
    getAttendancePolicy(),
    getHolidays(year),
    getLeaveTypes(),
    getTeamBalances(year),
    getAttendanceManagers(),
    getWorkspaceMembers(),
  ]);

  return (
    <PolicyClient
      policy={policy}
      holidays={holidays}
      types={types}
      balances={balances}
      managers={managers}
      members={members}
      year={year}
    />
  );
}
