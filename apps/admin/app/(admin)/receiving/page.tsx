import { getPurchaseOrders } from '@/actions/purchaseOrders';
import { getSuppliers } from '@/actions/companies';
import InboundManagementClient from './InboundManagementClient';

export default async function ReceivingPage() {
  const [purchaseOrders, suppliers] = await Promise.all([
    getPurchaseOrders(),
    getSuppliers(),
  ]);

  return (
    <InboundManagementClient
      purchaseOrders={purchaseOrders}
      suppliers={suppliers}
    />
  );
}
