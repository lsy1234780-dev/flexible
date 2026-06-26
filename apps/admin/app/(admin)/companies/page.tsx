import { getCompanies } from '@/actions/companies';
import CompaniesClient from './CompaniesClient';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  const companies = await getCompanies();
  return <CompaniesClient companies={companies} />;
}
