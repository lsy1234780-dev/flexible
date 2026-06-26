'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { ensureCompany } from '@/actions/auth';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const error = params.get('error');
    const errorCode = params.get('error_code');

    if (error) {
      const isExpired = errorCode === 'otp_expired';
      const msg = isExpired
        ? '링크가 만료됐습니다. 다시 요청해주세요.'
        : '인증에 실패했습니다. 다시 시도해주세요.';
      router.replace(`/login?error=${encodeURIComponent(msg)}`);
      return;
    }

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
      // 해시에 토큰이 없으면 로그인으로
      router.replace('/login');
      return;
    }

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(async ({ error: sessionError }) => {
        if (sessionError) {
          router.replace(`/login?error=${encodeURIComponent('인증에 실패했습니다. 다시 시도해주세요.')}`);
          return;
        }
        await ensureCompany();
        // 담당자 정보 미등록이면 setup으로
        const res = await fetch('/api/check-setup');
        const { needsSetup } = await res.json().catch(() => ({ needsSetup: false }));
        router.replace(needsSetup ? '/setup' : '/catalog');
      });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
      로그인 처리 중...
    </div>
  );
}
