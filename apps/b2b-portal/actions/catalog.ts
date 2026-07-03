'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getSessionCompany, loadCatalog } from '@/lib/portal';

// 로그인한 B2B 사용자의 company 조회
// - 세션 없으면 → /login
// - company 없으면 (어드민 계정 등) → /login (세션 초기화 후)
// B2B 세션은 RLS로 companies를 읽을 수 없으므로 BFF(getSessionCompany)로 조회한다.
export async function getMyCompany() {
  const company = await getSessionCompany();
  if (!company) {
    // B2B 계정이 아닌 세션(어드민 등) 또는 미로그인 — 세션 정리 후 로그인 페이지로
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
  }
  return company;
}

// 업체별 노출 제품 + 단가 목록 — 세션에서 업체를 유도 (클라이언트 companyId 신뢰 금지)
export async function getCatalog() {
  const company = await getSessionCompany();
  if (!company || company.status !== 'active') return [];
  return loadCatalog(company);
}
