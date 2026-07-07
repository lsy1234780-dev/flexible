import { getUserRole, getAdminUsers } from '@/actions/auth';
import { getRoleGroups, getAllUserRoleGroups } from '@/actions/roleGroups';
import { getMenuAccessRules } from '@/actions/menuAccess';
import { getDepartments, getPositions } from '@/actions/departments';
import { getSuperAdminMinLevel } from '@/actions/settings';
import { getEnabledModules } from '@/actions/modules';
import { getInvites, type WorkspaceInvite } from '@/actions/invites';
import { isSuperAdmin } from '@/lib/roles';
import SettingsClient from './SettingsClient';
import InviteCodesCard from '@/components/InviteCodesCard';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [role, superAdminMinLevel] = await Promise.all([
    getUserRole(),
    getSuperAdminMinLevel(),
  ]);
  const isAdmin = isSuperAdmin(role, superAdminMinLevel);
  const [users, groups, userGroupMappings, menuRules, departments, positions, enabledModules, invites] = isAdmin
    ? await Promise.all([
        getAdminUsers(),
        getRoleGroups(),
        getAllUserRoleGroups(),
        getMenuAccessRules(),
        getDepartments(),
        getPositions(),
        getEnabledModules(),
        getInvites(),
      ])
    : [[], [], [], [], [], [], [], []];

  const joinUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/join`;

  return (
    <div className="space-y-6">
      <SettingsClient
        role={role}
        users={users}
        groups={groups}
        userGroupMappings={userGroupMappings}
        menuRules={menuRules}
        departments={departments}
        positions={positions}
        superAdminMinLevel={superAdminMinLevel}
        enabledModules={enabledModules as string[]}
      />
      {isAdmin && <InviteCodesCard invites={invites as WorkspaceInvite[]} joinUrl={joinUrl} />}
    </div>
  );
}
