import { getMyCompany } from '@/actions/company';
import { redirect } from 'next/navigation';
import SetupClient from './SetupClient';

export default async function SetupPage() {
  const company = await getMyCompany();
  if (!company) redirect('/login');

  // 이미 담당자 정보가 있으면 카탈로그로
  if (company.contact_name) redirect('/catalog');

  return <SetupClient company={company} />;
}
