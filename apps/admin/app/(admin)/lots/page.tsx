import { getLots } from '@/actions/lots';
import { getProductsForReceiving } from '@/actions/receiving';
import LotsClient from './LotsClient';
import type { ComponentProps } from 'react';

export const dynamic = 'force-dynamic';

export default async function LotsPage() {
  const [lots, products] = await Promise.all([
    getLots(),
    getProductsForReceiving(),
  ]);

  return (
    <LotsClient
      initialLots={lots as unknown as ComponentProps<typeof LotsClient>['initialLots']}
      products={products}
    />
  );
}
