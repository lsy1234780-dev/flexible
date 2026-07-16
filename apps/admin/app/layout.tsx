import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import SwRegister from '@/components/SwRegister';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ERP 어드민',
  description: 'OO산업 내부 어드민',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Flexible', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: 브라우저 확장(Grammarly, 자동완성, 번역 등)이
    // <html>/<body>에 속성을 주입해 발생하는 무해한 하이드레이션 경고를 억제한다.
    // 이 요소 1개에만 적용되며 자식 트리의 실제 불일치는 그대로 잡힌다.
    <html lang="ko" suppressHydrationWarning>
      <body className={geist.className} suppressHydrationWarning>
        {children}
        <Toaster richColors />
        <SwRegister />
      </body>
    </html>
  );
}
