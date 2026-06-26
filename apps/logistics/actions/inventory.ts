'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

interface ScanInput {
  barcode: string;
  quantity: number;
  type: 'in' | 'out';
  memo: string;
  warehouse_id?: string | null;
  location_id?: string | null;
}

export async function processBarcodeScan(formData: FormData): Promise<{
  success?: boolean;
  error?: string;
  message?: string;
}> {
  const supabase = await createClient();

  const barcode = (formData.get('barcode') as string)?.trim();
  const quantity = parseInt(formData.get('quantity') as string, 10) || 1;
  const type = (formData.get('type') as string) === 'out' ? 'out' : 'in';
  const memo = (formData.get('memo') as string)?.trim() || '';

  if (!barcode) return { error: '바코드를 입력하세요' };
  if (quantity < 1) return { error: '수량은 1 이상이어야 합니다' };

  // 바코드로 제품 조회
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, name, base_stock')
    .eq('barcode', barcode)
    .single();

  if (productError || !product) {
    return { error: `바코드 [${barcode}]에 해당하는 제품을 찾을 수 없습니다` };
  }

  // 출고 시 재고 부족 체크
  if (type === 'out' && product.base_stock < quantity) {
    return { error: `재고 부족 (현재: ${product.base_stock}개)` };
  }

  // 재고 이력 추가
  const { error: logError } = await supabase.from('inventory_logs').insert({
    product_id: product.id,
    quantity,
    type,
    memo: memo || null,
  });
  if (logError) return { error: logError.message };

  // 재고 수량 업데이트
  const newStock = type === 'in' ? product.base_stock + quantity : product.base_stock - quantity;
  const { error: stockError } = await supabase
    .from('products')
    .update({ base_stock: newStock })
    .eq('id', product.id);
  if (stockError) return { error: stockError.message };

  revalidatePath('/');
  revalidatePath('/scan');

  return {
    success: true,
    message: `${product.name} — ${type === 'in' ? '입고' : '출고'} ${quantity}개 완료 (현재고: ${newStock}개)`,
  };
}
