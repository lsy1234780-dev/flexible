import { getCatalog, getMyCompany } from '@/actions/catalog';
import CatalogClient from './CatalogClient';

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const company = await getMyCompany();
  const isActive = company.status === 'active';
  const products = isActive ? await getCatalog() : [];

  return <CatalogClient products={products} isActive={isActive} />;
}
