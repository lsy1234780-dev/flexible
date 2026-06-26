'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { sendPasswordReset } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ForgotPasswordPage() {
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await sendPasswordReset(formData);
      if (result?.error) setError(result.error);
      else setSent(true);
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">비밀번호 찾기</CardTitle>
          <p className="text-sm text-gray-500">가입한 이메일로 재설정 링크를 보내드립니다</p>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-green-600">
                비밀번호 재설정 링크가 이메일로 발송되었습니다.
              </p>
              <p className="text-xs text-gray-500">
                이메일이 오지 않으면 스팸함을 확인해주세요.
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full mt-2">로그인으로 돌아가기</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">이메일</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? '발송 중...' : '재설정 링크 발송'}
              </Button>
              <div className="text-center">
                <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700 underline">
                  로그인으로 돌아가기
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
