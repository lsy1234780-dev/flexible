'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateContactInfo(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다' };

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  if (!company) return { error: '업체를 찾을 수 없습니다' };

  const contact_name = String(formData.get('contact_name') ?? '').trim() || null;
  const contact_phone = String(formData.get('contact_phone') ?? '').trim() || null;
  const contact_email = String(formData.get('contact_email') ?? '').trim() || null;
  const contact_position = String(formData.get('contact_position') ?? '').trim() || null;

  const { error } = await supabase
    .from('companies')
    .update({ contact_name, contact_phone, contact_email, contact_position })
    .eq('id', company.id);

  if (error) return { error: error.message };

  revalidatePath('/');
  return { success: true };
}

export async function getMyCompany() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('companies')
    .select('id, name, status, contact_name, contact_phone, contact_email, contact_position')
    .eq('auth_user_id', user.id)
    .single();

  return data;
}
