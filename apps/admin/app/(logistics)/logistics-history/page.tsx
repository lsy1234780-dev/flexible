import { getLogisticsHistory } from '@/actions/orders';
import HistoryClient from './HistoryClient';

export const dynamic = 'force-dynamic';

export default async function LogisticsHistoryPage() {
  const history = await getLogisticsHistory(100);

  return (
    <div className="p-4">
      <HistoryClient history={history} />
    </div>
  );
}
