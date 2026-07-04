import {
  isExpenseManagerAction, getFinanceClaims, getExpenseCategories, getExpenseManagers,
} from '@/actions/expenses';
import { getWorkspaceMembers } from '@/actions/chat';
import FinanceClient from './FinanceClient';

export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  const isManager = await isExpenseManagerAction();
  if (!isManager) {
    return (
      <div className="max-w-lg rounded-xl border bg-white p-8 text-center">
        <p className="font-semibold text-gray-900">재무 담당 권한이 필요합니다</p>
        <p className="text-sm text-gray-500 mt-1">
          워크스페이스 소유자 또는 기존 재무 담당자에게 권한 부여를 요청하세요.
        </p>
      </div>
    );
  }

  const [finance, categories, managers, members] = await Promise.all([
    getFinanceClaims(),
    getExpenseCategories(),
    getExpenseManagers(),
    getWorkspaceMembers(),
  ]);

  return (
    <FinanceClient
      finance={finance}
      categories={categories}
      managers={managers}
      members={members}
    />
  );
}
