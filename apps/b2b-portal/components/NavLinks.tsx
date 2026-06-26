'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/catalog', label: '제품 카탈로그' },
  { href: '/orders', label: '발주 내역' },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 text-sm">
      {links.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`py-1 transition-colors ${
              active
                ? 'text-gray-900 font-bold'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
