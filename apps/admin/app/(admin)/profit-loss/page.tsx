import { getPlData } from '@/actions/profitLoss';
import ProfitLossClient from './ProfitLossClient';

export const dynamic = 'force-dynamic';

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const data = await getPlData({ from: params.from, to: params.to });

  return (
    <ProfitLossClient
      data={data}
      filters={{ from: params.from, to: params.to }}
      defaultTab={params.tab ?? 'overview'}
    />
  );
}
