import { getCatalog, getMyCompany } from '@/actions/catalog';
import { redirect } from 'next/navigation';
import NewOrderClient from './NewOrderClient';

export const dynamic = 'force-dynamic';

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const company = await getMyCompany();
  if (company.status !== 'active') redirect('/catalog');

  const { product: initialProductId } = await searchParams;
  const products = await getCatalog(company.id);
  return <NewOrderClient company={company} products={products} initialProductId={initialProductId} />;
}
