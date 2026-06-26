'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { sendLoginLink } from '@/actions/auth';
import { Mail } from 'lucide-react';

export default function LoginClient() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState('');
  const searchParams = useSearchParams();

  useEffect(() => {
    const errorMsg = searchParams.get('error');
    if (errorMsg) {
      toast.error(errorMsg, { duration: 5000 });
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const result = await sendLoginLink(new FormData(e.currentTarget));
    setLoading(false);

    if (result?.error) {
      const isRateLimit = result.error.toLowerCase().includes('rate') || result.error.toLowerCase().includes('second');
      toast.error(
        isRateLimit
          ? '잠시 후 다시 시도해주세요. 방금 가입하셨다면 이메일에서 링크를 클릭하시면 바로 로그인됩니다.'
          : result.error,
        { duration: isRateLimit ? 6000 : 4000 },
      );
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <Card>
        <CardContent className="pt-8 pb-8 text-center space-y-3">
          <Mail size={36} className="mx-auto text-gray-400" />
          <p className="font-semibold text-gray-900">로그인 링크를 발송했습니다</p>
          <p className="text-sm text-gray-500">
            <span className="font-medium text-gray-700">{email}</span>으로 발송된<br />
            링크를 클릭하시면 자동으로 로그인됩니다.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="text-xs text-gray-400 hover:text-gray-600 mt-2"
          >
            다른 이메일로 시도
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">협력사 포털 로그인</CardTitle>
        <CardDescription>이메일로 로그인 링크를 받으세요</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              placeholder="example@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '발송 중...' : '로그인 링크 받기'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          계정이 없으신가요?{' '}
          <Link href="/register" className="text-gray-900 font-medium hover:underline">
            가입 신청
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
