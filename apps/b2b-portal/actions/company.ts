'use server';

import { createServiceClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getSessionCompany } from '@/lib/portal';

// B2B 세션은 RLS로 companies를 읽고 쓸 수 없으므로 BFF(세션 업체 스코프)로 처리한다.

export async function updateContactInfo(formData: FormData) {
  const company = await getSessionCompany();
  if (!company) return { error: '업체를 찾을 수 없습니다' };

  const contact_name = String(formData.get('contact_name') ?? '').trim() || null;
  const contact_phone = String(formData.get('contact_phone') ?? '').trim() || null;
  const contact_email = String(formData.get('contact_email') ?? '').trim() || null;
  const contact_position = String(formData.get('contact_position') ?? '').trim() || null;

  const service = createServiceClient();
  const { error } = await service
    .from('companies')
    .update({ contact_name, contact_phone, contact_email, contact_position })
    .eq('id', company.id);

  if (error) return { error: error.message };

  revalidatePath('/');
  return { success: true };
}

export async function getMyCompany() {
  const company = await getSessionCompany();
  if (!company) return null;
  const { id, name, status, contact_name, contact_phone, contact_email, contact_position } = company;
  return { id, name, status, contact_name, contact_phone, contact_email, contact_position };
}
