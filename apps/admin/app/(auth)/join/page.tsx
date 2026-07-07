import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import JoinClient from './JoinClient';

export const dynamic = 'force-dynamic';

// 기존 회사(워크스페이스)에 초대코드로 합류하는 페이지.
// - 미로그인: Google 로그인 유도 (flow='join' → 콜백이 다시 이곳으로)
// - 로그인 + 이미 멤버: 앱으로
// - 로그인 + 비멤버: 초대코드 입력 폼
export default async function JoinPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (claims) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', claims.sub)
      .limit(1)
      .maybeSingle();
    if (membership) redirect('/products');
  }

  return <JoinClient authed={!!claims} email={(claims?.email as string) ?? null} />;
}
