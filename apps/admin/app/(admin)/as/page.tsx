import { getAsRequests, getCompaniesForAs, getProductsForAs, getWarrantyBatchBySerials } from '@/actions/asRequests';
import { getCurrentUser } from '@/actions/auth';
import AsListClient from './AsListClient';
import type { ComponentProps } from 'react';

export const dynamic = 'force-dynamic';

export default async function AsPage() {
  const [requests, companies, products, user] = await Promise.all([
    getAsRequests(),
    getCompaniesForAs(),
    getProductsForAs(),
    getCurrentUser(),
  ]);

  const serials = (requests as { serial_number: string | null }[])
    .map((r) => r.serial_number)
    .filter((s): s is string => !!s);

  const warrantyMap = await getWarrantyBatchBySerials(serials);

  return (
    <AsListClient
      requests={requests as unknown as ComponentProps<typeof AsListClient>['requests']}
      companies={companies}
      products={products}
      currentUserName={user?.name ?? ''}
      warrantyMap={warrantyMap}
    />
  );
}
