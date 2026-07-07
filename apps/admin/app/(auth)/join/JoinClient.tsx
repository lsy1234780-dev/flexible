'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithGoogle, signOut } from '@/actions/auth';
import { joinWithCode } from '@/actions/invites';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  authed: boolean;
  email: string | null;
}

export default function JoinClient({ authed, email }: Props) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleGoogle() {
    setError('');
    startTransition(async () => {
      const result = await signInWithGoogle('join');
      if (result?.error) setError(result.error);
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const result = await joinWithCode(code);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.replace('/products');
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">팀에 합류하기</CardTitle>
          <p className="text-sm text-gray-500">
            {authed
              ? '관리자에게 받은 초대코드를 입력하세요'
              : '먼저 로그인하고, 관리자에게 받은 초대코드로 합류하세요'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {authed ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="FLX-XXXXXX"
                autoFocus
                className="text-center font-mono tracking-widest"
                maxLength={12}
              />
              <Button type="submit" className="w-full" disabled={isPending || !code.trim()}>
                {isPending ? '확인 중...' : '합류하기'}
              </Button>
              {email && (
                <p className="text-center text-xs text-gray-400">
                  {email} 계정으로 합류합니다 ·{' '}
                  <button
                    type="button"
                    onClick={() => startTransition(async () => { await signOut(); })}
                    className="underline hover:text-gray-600"
                  >
                    다른 계정 사용
                  </button>
                </p>
              )}
            </form>
          ) : (
            <Button type="button" className="w-full" onClick={handleGoogle} disabled={isPending}>
              {isPending ? '이동 중...' : 'Google로 계속하기'}
            </Button>
          )}
          {error && <p className="text-center text-sm text-red-500">{error}</p>}
          <p className="text-center text-sm text-gray-500">
            새 워크스페이스를 만드시나요?{' '}
            <Link href="/signup" className="font-medium text-gray-900 hover:underline">
              회원가입
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
