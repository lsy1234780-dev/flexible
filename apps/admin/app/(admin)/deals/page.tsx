import { getDealStages, getDeals, getDealForecast } from '@/actions/deals';
import { getActiveCompanies } from '@/actions/inventory';
import DealsBoard from './DealsBoard';

export const dynamic = 'force-dynamic';

export default async function DealsPage() {
  const [stages, deals, forecast, companies] = await Promise.all([
    getDealStages(),
    getDeals(),
    getDealForecast(),
    getActiveCompanies(),
  ]);

  return (
    <DealsBoard
      stages={stages}
      deals={deals as unknown as DealCard[]}
      forecast={forecast}
      companies={companies}
    />
  );
}

// page → client 전달 타입 (DealsBoard와 공유)
export interface DealCard {
  id: string;
  title: string;
  value: number;
  status: 'open' | 'won' | 'lost';
  stage_id: string | null;
  expected_close_date: string | null;
  source: string | null;
  notes: string | null;
  company_id: string | null;
  companies: { id: string; name: string } | null;
  deal_stages: { id: string; name: string; kind: string; color: string | null } | null;
}
