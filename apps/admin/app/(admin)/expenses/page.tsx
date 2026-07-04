import { getMyClaims, getMyAwaitingConfirm } from '@/actions/expenses';
import ExpensesClient from './ExpensesClient';

export const dynamic = 'force-dynamic';

export default async function ExpensesPage() {
  const [claims, awaiting] = await Promise.all([
    getMyClaims(),
    getMyAwaitingConfirm(),
  ]);

  return <ExpensesClient claims={claims} awaiting={awaiting} />;
}
