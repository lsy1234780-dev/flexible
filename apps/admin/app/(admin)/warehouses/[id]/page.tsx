export const dynamic = 'force-dynamic';

import { getWarehouse, getLocationTree } from '@/actions/warehouses';
import WarehouseDetailClient from './WarehouseDetailClient';
import type { ComponentProps } from 'react';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function WarehouseDetailPage({ params }: Props) {
  const { id } = await params;
  const [warehouse, locationTree] = await Promise.all([
    getWarehouse(id),
    getLocationTree(id),
  ]);

  return (
    <WarehouseDetailClient
      warehouse={warehouse as unknown as ComponentProps<typeof WarehouseDetailClient>['warehouse']}
      initialLocationTree={locationTree as unknown as ComponentProps<typeof WarehouseDetailClient>['initialLocationTree']}
    />
  );
}
