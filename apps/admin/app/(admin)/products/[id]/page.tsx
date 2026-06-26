import { getProduct } from '@/actions/products';
import { getCategories } from '@/actions/categories';
import { notFound } from 'next/navigation';
import ProductDetailClient from './ProductDetailClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  try {
    const [product, categories] = await Promise.all([getProduct(id), getCategories()]);
    return <ProductDetailClient product={product} categories={categories} />;
  } catch {
    notFound();
  }
}
