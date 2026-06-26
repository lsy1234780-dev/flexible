import { getCompany, getCompanyProducts, getCompanyTransactions } from '@/actions/companies';
import { getCompanyCrmLogs } from '@/actions/orders';
import { notFound } from 'next/navigation';
import CompanyDetailClient from './CompanyDetailClient';

export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ id: string }>; }

export default async function CompanyDetailPage({ params }: Props) {
  const { id } = await params;
  try {
    const [company, companyProducts, crmLogs, transactions] = await Promise.all([
      getCompany(id),
      getCompanyProducts(id),
      getCompanyCrmLogs(id),
      getCompanyTransactions(id),
    ]);
    return (
      <CompanyDetailClient
        company={company}
        companyProducts={companyProducts}
        crmLogs={crmLogs}
        transactions={transactions}
      />
    );
  } catch {
    notFound();
  }
}
