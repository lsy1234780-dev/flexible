'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { updatePassword } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
    });
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updatePassword(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        alert('비밀번호가 변경되었습니다.');
        router.push('/login');
      }
    });
  }

  if (hasSession === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">로딩 중...</p>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">비밀번호 재설정</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-red-500">
              유효하지 않거나 만료된 링크입니다.
            </p>
            <p className="text-xs text-gray-500">
              비밀번호 재설정 이메일을 다시 요청해주세요.
            </p>
            <Link href="/forgot-password">
              <Button variant="outline" className="w-full mt-2">비밀번호 찾기로 이동</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">비밀번호 재설정</CardTitle>
          <p className="text-sm text-gray-500">새 비밀번호를 입력해주세요</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">새 비밀번호</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={6} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">비밀번호 확인</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={6} />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? '변경 중...' : '비밀번호 변경'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
