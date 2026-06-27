'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';

export async function getCategories() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order')
    .order('name');

  if (error) throw new Error(error.message);
  return data;
}

export async function getCategoryProductCounts(): Promise<Record<string, number>> {
  if (process.env.PREVIEW_MODE === 'true') return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select('category_id');

  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const p of data) {
    if (p.category_id) {
      counts[p.category_id] = (counts[p.category_id] ?? 0) + 1;
    }
  }
  return counts;
}

export async function createCategory(name: string, parentId: string | null) {
  const supabase = await createClient();

  const trimmed = name.trim();
  if (!trimmed) return { error: '카테고리명을 입력하세요' };

  const { error } = await supabase.from('categories').insert({
    name: trimmed,
    parent_id: parentId || null,
    workspace_id: await getCurrentWorkspaceId(),
  });

  if (error) return { error: error.message };
  revalidatePath('/categories');
  revalidatePath('/products');
  return { success: true };
}

export async function updateCategory(id: string, name: string, parentId: string | null) {
  const supabase = await createClient();

  const trimmed = name.trim();
  if (!trimmed) return { error: '카테고리명을 입력하세요' };

  // 자기 자신을 부모로 설정 방지
  if (parentId === id) return { error: '자기 자신을 상위 카테고리로 설정할 수 없습니다' };

  const { error } = await supabase
    .from('categories')
    .update({ name: trimmed, parent_id: parentId || null })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/categories');
  revalidatePath('/products');
  return { success: true };
}

export async function deleteCategory(id: string) {
  const supabase = await createClient();

  // 하위 카테고리가 있으면 삭제 불가
  const { data: children } = await supabase
    .from('categories')
    .select('id')
    .eq('parent_id', id)
    .limit(1);

  if (children && children.length > 0) {
    return { error: '하위 카테고리가 있어 삭제할 수 없습니다. 하위 카테고리를 먼저 삭제하세요.' };
  }

  // 해당 카테고리의 제품들은 category_id = null 처리
  await supabase
    .from('products')
    .update({ category_id: null })
    .eq('category_id', id);

  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/categories');
  revalidatePath('/products');
  return { success: true };
}

export async function reorderCategory(id: string, sortOrder: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('categories')
    .update({ sort_order: sortOrder })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/categories');
  return { success: true };
}
