import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-noto',
});

export const metadata: Metadata = {
  title: 'Flexible — 필요한 만큼만 조립하는 협업툴',
  description:
    '재고·발주·견적·근태·경비·팀 채팅까지, 우리 회사에 필요한 모듈만 골라 켜는 중소기업 비즈니스 워크스페이스.',
  openGraph: {
    title: 'Flexible — 필요한 만큼만 조립하는 협업툴',
    description: '필요한 모듈만 골라 켜는 중소기업 비즈니스 워크스페이스.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='ko'>
      <body className={`${notoSansKr.variable} font-sans antialiased`} style={{ fontFamily: 'var(--font-noto), system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
