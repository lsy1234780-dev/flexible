export const dynamic = 'force-dynamic';

import { getWarehouses } from '@/actions/warehouses';
import WarehousesClient from './WarehousesClient';
import type { ComponentProps } from 'react';

export default async function WarehousesPage() {
  const warehouses = await getWarehouses();

  return (
    <WarehousesClient
      initialWarehouses={warehouses as unknown as ComponentProps<typeof WarehousesClient>['initialWarehouses']}
    />
  );
}
