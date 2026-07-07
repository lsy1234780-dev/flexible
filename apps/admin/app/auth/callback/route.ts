import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const flow = searchParams.get('flow'); // 'login' | 'signup' | null(비번리셋 등)
  const next = searchParams.get('next');

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // 비밀번호 리셋 등 next가 명시된 흐름은 그대로 진행 (기존 동작 유지)
  if (next) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // OAuth 로그인/가입: 워크스페이스 멤버십으로 분기 (멀티테넌시 격리)
  // getUser() 대신 getClaims(): user.id만 필요, RBAC 프레시니스 무관.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ? { id: data.claims.sub } : null;

  if (user) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (membership) {
      // 기존 멤버 → 앱으로
      return NextResponse.redirect(`${origin}/products`);
    }

    // 워크스페이스 없음
    if (flow === 'signup') {
      // 회원가입 흐름 → 온보딩(새 워크스페이스 생성)으로
      return NextResponse.redirect(`${origin}/onboarding`);
    }

    if (flow === 'join') {
      // 팀 합류 흐름 → 초대코드 입력으로
      return NextResponse.redirect(`${origin}/join`);
    }

    // 일반 로그인으로 들어온 비멤버 → 선택 화면(새 워크스페이스 도입 / 초대코드 합류)
    return NextResponse.redirect(`${origin}/welcome`);
  }

  return NextResponse.redirect(`${origin}/login`);
}
