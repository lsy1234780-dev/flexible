'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { updateContactInfo } from '@/actions/company';

interface Props {
  company: {
    id: string;
    name: string;
    status: string;
  };
}

export default function SetupClient({ company }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const name = formData.get('contact_name');
    if (!name || String(name).trim() === '') {
      toast.error('담당자명을 입력해주세요');
      return;
    }

    setLoading(true);
    const result = await updateContactInfo(formData);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('정보가 저장되었습니다');
      router.push('/catalog');
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">담당자 정보 등록</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-medium">{company.name}</span> 담당자 정보를 입력해주세요.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact_name">담당자명 *</Label>
              <Input
                id="contact_name"
                name="contact_name"
                placeholder="홍길동"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_position">직무 / 직책</Label>
              <Input
                id="contact_position"
                name="contact_position"
                placeholder="구매팀장"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_phone">연락처 (전화번호)</Label>
              <Input
                id="contact_phone"
                name="contact_phone"
                type="tel"
                placeholder="010-1234-5678"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_email">담당자 이메일</Label>
              <Input
                id="contact_email"
                name="contact_email"
                type="email"
                placeholder="담당자@회사.com"
              />
              <p className="text-xs text-gray-400">로그인 계정과 다를 경우 입력하세요</p>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? '저장 중...' : '저장하고 시작하기'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
