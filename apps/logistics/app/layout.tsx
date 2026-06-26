import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '물류 관리',
  description: '물류팀 전용 관리 시스템',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body className={geist.className}>
        {children}
        <Toaster theme="dark" richColors />
      </body>
    </html>
  );
}
