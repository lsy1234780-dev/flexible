import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest) {
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

  // 미리보기 모드: 인증 우회
  if (process.env.PREVIEW_MODE === 'true') {
    return response;
  }

  const { data: { user } } = await supabase.auth.getUser();

  const publicPaths = ['/login', '/forgot-password', '/reset-password', '/auth/callback'];
  const isPublic = publicPaths.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && ['/login', '/forgot-password'].includes(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/products', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
