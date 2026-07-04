import { notFound } from 'next/navigation';
import { getClaim, getExpenseCategories } from '@/actions/expenses';
import { getApprovalStatus } from '@/actions/approvals';
import { getWorkspaceMembers } from '@/actions/chat';
import { getCurrentUser } from '@/actions/auth';
import ExpenseDetailClient from './ExpenseDetailClient';

export const dynamic = 'force-dynamic';

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, categories, approval, members, me] = await Promise.all([
    getClaim(id),
    getExpenseCategories(),
    getApprovalStatus('expense', id),
    getWorkspaceMembers(),
    getCurrentUser(),
  ]);
  if (!detail) notFound();

  return (
    <ExpenseDetailClient
      claim={detail.claim}
      items={detail.items}
      categories={categories}
      approval={approval}
      members={members}
      myId={me?.id ?? null}
    />
  );
}
