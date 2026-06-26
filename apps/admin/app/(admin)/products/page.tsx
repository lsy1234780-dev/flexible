import { getProducts } from '@/actions/products';
import { getCategories } from '@/actions/categories';
import ProductsClient from './ProductsClient';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string; newBarcode?: string }> }) {
  const { category, newBarcode } = await searchParams;
  const [products, categories] = await Promise.all([getProducts(), getCategories()]);
  return <ProductsClient products={products} categories={categories} initialCategory={category} initialBarcode={newBarcode} />;
}
