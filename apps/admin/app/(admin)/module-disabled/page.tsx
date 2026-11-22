import Link from 'next/link';
import { PowerOff } from 'lucide-react';
import { MODULE_CATALOG } from '@/lib/modules';
import { Button } from '@/components/ui/button';

// 꺼진 모듈의 페이지에 접근했을 때 middleware가 보내는 안내 화면.
export default async function ModuleDisabledPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const { module: moduleKey } = await searchParams;
  const label = MODULE_CATALOG.find((m) => m.key === moduleKey)?.label;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <PowerOff className="h-5 w-5 text-gray-500" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">
          {label ? `'${label}' 기능이 꺼져 있습니다` : '이 기능이 꺼져 있습니다'}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          이 워크스페이스에서는 해당 모듈을 사용하지 않도록 설정되어 있습니다.
          필요하면 관리자가 설정에서 모듈을 다시 켤 수 있습니다.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="outline">
            <Link href="/inbox">인박스로</Link>
          </Button>
          <Button asChild>
            <Link href="/settings">모듈 설정</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
