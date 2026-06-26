import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ERP 어드민',
  description: 'OO산업 내부 어드민',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={geist.className}>
        {children}
        <Toaster richColors />
      </body>
    </html>
  );
}
