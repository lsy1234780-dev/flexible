import Link from 'next/link';
import { ScanBarcode, History, PackageCheck } from 'lucide-react';

// 물류팀 전용 레이아웃: 모바일 PDA 최적화
// 하단 탭 네비, 큰 터치 영역, 단순 UI
export default function LogisticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* 상단 헤더 */}
      <header className="flex-none bg-gray-900 border-b border-gray-800 px-4 py-3 text-center">
        <span className="text-sm font-bold tracking-widest text-gray-300">물류 관리</span>
      </header>

      {/* 본문 */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      {/* 하단 탭 */}
      <nav className="flex-none bg-gray-900 border-t border-gray-800 grid grid-cols-3">
        <Link
          href="/logistics-scan"
          className="flex flex-col items-center justify-center py-4 gap-1 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors active:bg-gray-700"
        >
          <ScanBarcode size={28} />
          <span className="text-xs font-medium">수동 입출고</span>
        </Link>
        <Link
          href="/logistics-delivery"
          className="flex flex-col items-center justify-center py-4 gap-1 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors active:bg-gray-700"
        >
          <PackageCheck size={28} />
          <span className="text-xs font-medium">출고 관리</span>
        </Link>
        <Link
          href="/logistics-history"
          className="flex flex-col items-center justify-center py-4 gap-1 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors active:bg-gray-700"
        >
          <History size={28} />
          <span className="text-xs font-medium">처리 이력</span>
        </Link>
      </nav>
    </div>
  );
}
