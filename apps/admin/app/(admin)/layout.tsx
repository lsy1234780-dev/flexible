import Sidebar from '@/components/Sidebar';
import { ModulesProvider } from '@/components/ModulesProvider';
import ChatWidget from '@/components/chat/ChatWidget';
import GlobalSearch from '@/components/GlobalSearch';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getUserRole, getCurrentUser } from '@/actions/auth';
import { getMyExtraMenus } from '@/actions/roleGroups';
import { getMenuAccessRules } from '@/actions/menuAccess';
import { getDepartments, getPositions } from '@/actions/departments';
import { getSuperAdminMinLevel } from '@/actions/settings';
import { getEnabledModules } from '@/actions/modules';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [role, extraMenus, menuRules, departments, positions, superAdminMinLevel, currentUser, enabledModules] = await Promise.all([
    getUserRole(),
    getMyExtraMenus(),
    getMenuAccessRules(),
    getDepartments(),
    getPositions(),
    getSuperAdminMinLevel(),
    getCurrentUser(),
    getEnabledModules(),
  ]);
  const roleWithExtras = { ...role, extraMenus };

  // label lookup 맵 생성
  const deptLabelMap: Record<string, string> = {};
  for (const d of departments) deptLabelMap[d.id] = d.label;
  const posLabelMap: Record<string, string> = {};
  for (const p of positions) posLabelMap[p.id] = p.label;

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-gray-50">
        <Sidebar
          role={roleWithExtras}
          menuRules={menuRules}
          departmentLabels={deptLabelMap}
          positionLabels={posLabelMap}
          superAdminMinLevel={superAdminMinLevel}
          enabledModules={enabledModules}
          userName={currentUser?.name ?? '사용자'}
        />
        <ModulesProvider modules={enabledModules}>
          <main className="flex-1 overflow-y-auto p-4 pt-18 md:p-6 md:pt-6">{children}</main>
          <ChatWidget />
          <GlobalSearch />
        </ModulesProvider>
      </div>
    </TooltipProvider>
  );
}
