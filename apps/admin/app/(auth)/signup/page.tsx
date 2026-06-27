'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { signInWithGoogle } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SignupPage() {
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleGoogle() {
    setError('');
    startTransition(async () => {
      // flow='signup' → 콜백이 워크스페이스 없는 신규 계정을 /onboarding으로 보냄
      const result = await signInWithGoogle('signup');
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">회원가입</CardTitle>
          <p className="text-sm text-gray-500">Google 계정으로 새 워크스페이스를 시작하세요</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" className="w-full" onClick={handleGoogle} disabled={isPending}>
            {isPending ? '이동 중...' : 'Google로 시작하기'}
          </Button>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <p className="text-center text-sm text-gray-500">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="font-medium text-gray-900 hover:underline">
              로그인
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
