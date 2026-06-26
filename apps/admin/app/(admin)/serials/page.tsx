import { getProductsForSerials } from '@/actions/products';
import SerialsListClient from './SerialsListClient';
import type { ComponentProps } from 'react';

export const dynamic = 'force-dynamic';

export default async function SerialsPage() {
  const products = await getProductsForSerials();
  return <SerialsListClient products={products as unknown as ComponentProps<typeof SerialsListClient>['products']} />;
}
