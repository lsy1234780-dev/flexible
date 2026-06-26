'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { signIn } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signIn(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">ERP 어드민</CardTitle>
          <p className="text-sm text-gray-500">OO산업 내부 관리 시스템</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">이메일</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">비밀번호</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? '로그인 중...' : '로그인'}
            </Button>
            <div className="text-center">
              <Link href="/forgot-password" className="text-sm text-gray-500 hover:text-gray-700 underline">
                비밀번호를 잊으셨나요?
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
