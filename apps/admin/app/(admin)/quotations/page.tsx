import { getQuotations } from '@/actions/quotations';
import QuotationsClient from './QuotationsClient';

export const dynamic = 'force-dynamic';

export default async function QuotationsPage() {
  const quotations = await getQuotations();
  return <QuotationsClient quotations={quotations} />;
}
