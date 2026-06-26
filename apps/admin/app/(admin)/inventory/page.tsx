import { getInventory, getRecentLogs, getActiveCompanies } from '@/actions/inventory';
import InventoryClient from './InventoryClient';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const [products, logs, companies] = await Promise.all([
    getInventory(),
    getRecentLogs(),
    getActiveCompanies(),
  ]);
  return (
    <InventoryClient
      products={products as unknown as Parameters<typeof InventoryClient>[0]['products']}
      logs={logs}
      companies={companies}
    />
  );
}
