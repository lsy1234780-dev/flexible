import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { moduleForPath } from '@/lib/modules';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 미리보기 모드: 인증 우회 — 프로덕션 배포에서는 env가 잘못 설정되어도 절대 우회되지 않는다
  if (process.env.PREVIEW_MODE === 'true' && process.env.VERCEL_ENV !== 'production') {
    return response;
  }

  const { data: claimsData } = await supabase.auth.getClaims();

  // getUser() 대신 getClaims(): 로컬 서명 검증(네트워크 왕복 없음). RBAC 프레시니스가 필요없는 단순 인증 확인 자리.

  const user = claimsData?.claims ? { id: claimsData.claims.sub, email: claimsData.claims.email, user_metadata: claimsData.claims.user_metadata, app_metadata: claimsData.claims.app_metadata } : null;

  const publicPaths = ['/login', '/forgot-password', '/reset-password', '/auth/callback', '/join', '/signup'];
  const isPublic = publicPaths.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && ['/login', '/forgot-password'].includes(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/products', request.url));
  }

  // 모듈 게이팅(라우트 단위): 꺼진 모듈의 페이지는 메뉴뿐 아니라 URL 직접 접근도 막는다.
  // 페이지 이동(GET)만 대상 — 서버 액션(POST)은 다른 모듈 화면에서도 공유되므로 여기서 막지 않는다.
  // 판정은 getEnabledModules와 동일: 현재 워크스페이스에 enabled=true 행이 있어야 켜진 것.
  // 조회 오류 시에는 열어 둔다(fail-open) — 일시적 DB 오류로 업무 화면 전체가 잠기는 것을 방지.
  const requiredModule = user && request.method === 'GET' ? moduleForPath(request.nextUrl.pathname) : null;
  if (requiredModule) {
    const { data, error } = await supabase
      .from('workspace_modules')
      .select('module_key')
      .eq('module_key', requiredModule)
      .eq('enabled', true)
      .limit(1);
    if (!error && (data ?? []).length === 0) {
      const url = new URL('/module-disabled', request.url);
      url.searchParams.set('module', requiredModule);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
