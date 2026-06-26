import Link from 'next/link';
import { ScanBarcode, History, PackageCheck, PackageOpen } from 'lucide-react';
import { LogoutButton } from './LogoutButton';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* 상단 헤더 */}
      <header className="flex-none bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-bold tracking-widest text-gray-300">물류 관리</span>
        <LogoutButton />
      </header>

      {/* 본문 */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      {/* 하단 탭 */}
      <nav className="flex-none bg-gray-900 border-t border-gray-800 grid grid-cols-4">
        <Link
          href="/scan"
          className="flex flex-col items-center justify-center py-4 gap-1 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors active:bg-gray-700"
        >
          <ScanBarcode size={26} />
          <span className="text-[11px] font-medium">수동 입출고</span>
        </Link>
        <Link
          href="/receiving"
          className="flex flex-col items-center justify-center py-4 gap-1 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors active:bg-gray-700"
        >
          <PackageOpen size={26} />
          <span className="text-[11px] font-medium">입고</span>
        </Link>
        <Link
          href="/delivery"
          className="flex flex-col items-center justify-center py-4 gap-1 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors active:bg-gray-700"
        >
          <PackageCheck size={26} />
          <span className="text-[11px] font-medium">출고 관리</span>
        </Link>
        <Link
          href="/history"
          className="flex flex-col items-center justify-center py-4 gap-1 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors active:bg-gray-700"
        >
          <History size={26} />
          <span className="text-[11px] font-medium">이력</span>
        </Link>
      </nav>
    </div>
  );
}
