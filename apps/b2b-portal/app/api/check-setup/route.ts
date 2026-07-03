import { NextResponse } from 'next/server';
import { getSessionCompany } from '@/lib/portal';

export async function GET() {
  // B2B 세션은 RLS로 companies를 읽을 수 없으므로 BFF로 조회
  const company = await getSessionCompany();
  return NextResponse.json({ needsSetup: !!company && !company.contact_name });
}
