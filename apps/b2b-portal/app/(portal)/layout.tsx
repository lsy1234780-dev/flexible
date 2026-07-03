import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { signOut } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import NavLinks from '@/components/NavLinks';
import { getSessionCompany } from '@/lib/portal';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // 업체 정보 조회 (BFF) — B2B 계정이 아니면(어드민 등) 즉시 로그아웃
  const company = await getSessionCompany();

  if (!company) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* 상단 네비 */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold text-gray-900">B2B 포털</span>
            <NavLinks />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{company.name}</span>
            {company?.status === 'pending' && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">승인 대기중</span>
            )}
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm" className="text-xs">로그아웃</Button>
            </form>
          </div>
        </div>
      </header>

      {/* 승인 대기 배너 */}
      {company?.status === 'pending' && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-center py-2.5 text-sm text-yellow-800">
          관리자 승인 대기 중입니다. 승인 완료 후 발주가 가능합니다.
        </div>
      )}

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
