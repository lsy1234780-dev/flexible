import { getCompanies } from '@/actions/companies';
import { getProducts } from '@/actions/products';
import NewQuotationClient from './NewQuotationClient';

export const dynamic = 'force-dynamic';

export default async function NewQuotationPage() {
  const [companies, products] = await Promise.all([getCompanies(), getProducts()]);
  const activeCompanies = companies.filter((c) => c.status === 'active');
  return <NewQuotationClient companies={activeCompanies} products={products} />;
}
