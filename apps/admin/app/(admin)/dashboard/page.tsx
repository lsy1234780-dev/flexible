import { getDashboardStats, getUrgentItems } from '@/actions/dashboard';
import { getUserRole } from '@/actions/auth';
import { getDepartments } from '@/actions/departments';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const [stats, urgentItems, role, departments] = await Promise.all([
    getDashboardStats(),
    getUrgentItems(),
    getUserRole(),
    getDepartments(),
  ]);

  const departmentLabel =
    departments.find((d) => d.id === role.department)?.label ?? role.department ?? '전체';

  return (
    <DashboardClient
      stats={stats}
      urgentItems={urgentItems}
      department={role.department ?? ''}
      departmentLabel={departmentLabel}
    />
  );
}
