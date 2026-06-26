import { Suspense } from 'react';
import WarrantyClient from './WarrantyClient';

export const dynamic = 'force-dynamic';

export default function WarrantyPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-gray-400">불러오는 중…</div>}>
      <WarrantyClient />
    </Suspense>
  );
}
