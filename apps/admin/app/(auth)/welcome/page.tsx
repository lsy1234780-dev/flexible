import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import WelcomeClient from './WelcomeClient';

export const dynamic = 'force-dynamic';

// 로그인은 했지만 아직 어느 워크스페이스에도 소속되지 않은 유저의 갈림길.
// - 새로 도입 → /onboarding (워크스페이스 생성 + 모듈 조합)
// - 기존 회사 합류 → /join (초대코드 입력)
export default async function WelcomePage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) redirect('/login');

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', claims.sub)
    .limit(1)
    .maybeSingle();
  if (membership) redirect('/products');

  return <WelcomeClient email={(claims.email as string) ?? ''} />;
}
