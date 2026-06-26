import { getCategories, getCategoryProductCounts } from '@/actions/categories';
import CategoriesClient from './CategoriesClient';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const [categories, productCounts] = await Promise.all([
    getCategories(),
    getCategoryProductCounts(),
  ]);
  return <CategoriesClient categories={categories} productCounts={productCounts} />;
}
