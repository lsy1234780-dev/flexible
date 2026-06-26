import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'B2B 협력사 포털',
  description: 'ERP B2B 협력사 발주 포털',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='ko'>
      <body className={`${geist.variable} font-sans antialiased bg-gray-50`}>
        {children}
        <Toaster position='top-center' richColors />
      </body>
    </html>
  );
}
