'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { sendRegisterLink } from '@/actions/auth';
import { Mail } from 'lucide-react';

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const result = await sendRegisterLink(new FormData(e.currentTarget));
    setLoading(false);

    if (result?.error) { toast.error(result.error); return; }
    setDone(true);
  }

  if (done) {
    return (
      <Card>
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <Mail size={36} className="mx-auto text-gray-400" />
          <div className="space-y-1">
            <p className="font-semibold text-gray-900">이메일을 확인해주세요</p>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">{email}</span>으로 링크를 발송했습니다
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-800 text-left space-y-1">
            <p className="font-medium">📧 링크를 클릭하면 자동으로 로그인됩니다</p>
            <p className="text-blue-600 text-xs">별도 로그인 없이 바로 포털로 이동합니다.<br />관리자 승인 전에는 발주 기능이 제한됩니다.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">협력사 가입 신청</CardTitle>
        <CardDescription>이메일 인증 후 관리자 승인이 필요합니다</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="company_name">업체명</Label>
            <Input id="company_name" name="company_name" required placeholder="(주)협력사" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="example@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '처리 중...' : '가입 신청 및 인증 링크 받기'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-gray-900 font-medium hover:underline">로그인</Link>
        </p>
      </CardContent>
    </Card>
  );
}
