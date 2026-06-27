'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createWorkspaceForCurrentUser } from '@/actions/workspaces';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// 회사명 → slug 자동 변환 (영소문자/숫자/하이픈)
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/[\s가-힣]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function OnboardingPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleNameChange(value: string) {
    setCompanyName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const result = await createWorkspaceForCurrentUser({ companyName, slug });
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
          <CardTitle className="text-xl">워크스페이스 만들기</CardTitle>
          <p className="text-sm text-gray-500">회사 정보를 입력하면 워크스페이스가 생성됩니다</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="companyName">회사명</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="예: 정욱상사"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">워크스페이스 주소</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(e.target.value);
                }}
                placeholder="jungwook"
                required
              />
              <p className="text-xs text-gray-400">영소문자, 숫자, 하이픈만 사용 가능</p>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? '생성 중...' : '워크스페이스 생성'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
