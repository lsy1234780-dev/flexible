import dayjs from 'dayjs';
import { getLeaveTypes, getMyLeaveBalance, getMyLeaveRequests } from '@/actions/leaves';
import { getMyPendingApprovals } from '@/actions/approvals';
import { getWorkspaceMembers } from '@/actions/chat';
import LeavesClient from './LeavesClient';

export const dynamic = 'force-dynamic';

export default async function LeavesPage() {
  const year = dayjs().year();
  const [types, balance, requests, pendingApprovals, members] = await Promise.all([
    getLeaveTypes(),
    getMyLeaveBalance(year),
    getMyLeaveRequests(year),
    getMyPendingApprovals(),
    getWorkspaceMembers(),
  ]);

  return (
    <LeavesClient
      types={types}
      balance={balance}
      requests={requests}
      leaveApprovals={pendingApprovals.filter((a) => a.entity_type === 'leave')}
      members={members}
    />
  );
}
