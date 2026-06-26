import { getUserRole, getAdminUsers } from '@/actions/auth';
import { getRoleGroups, getAllUserRoleGroups } from '@/actions/roleGroups';
import { getMenuAccessRules } from '@/actions/menuAccess';
import { getDepartments, getPositions } from '@/actions/departments';
import { getSuperAdminMinLevel } from '@/actions/settings';
import { isSuperAdmin } from '@/lib/roles';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [role, superAdminMinLevel] = await Promise.all([
    getUserRole(),
    getSuperAdminMinLevel(),
  ]);
  const isAdmin = isSuperAdmin(role, superAdminMinLevel);
  const [users, groups, userGroupMappings, menuRules, departments, positions] = isAdmin
    ? await Promise.all([
        getAdminUsers(),
        getRoleGroups(),
        getAllUserRoleGroups(),
        getMenuAccessRules(),
        getDepartments(),
        getPositions(),
      ])
    : [[], [], [], [], [], []];

  return (
    <SettingsClient
      role={role}
      users={users}
      groups={groups}
      userGroupMappings={userGroupMappings}
      menuRules={menuRules}
      departments={departments}
      positions={positions}
      superAdminMinLevel={superAdminMinLevel}
    />
  );
}
