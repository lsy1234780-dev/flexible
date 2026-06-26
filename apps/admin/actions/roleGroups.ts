'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

// 그룹 목록 조회
export async function getRoleGroups() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('role_groups')
    .select('*')
    .order('name');
  if (error) throw new Error(error.message);
  return data;
}

// 그룹 생성
export async function createRoleGroup(name: string, description: string, allowedMenus: string[]) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('role_groups')
    .insert({ name, description: description || null, allowed_menus: allowedMenus })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return { error: '이미 존재하는 그룹명입니다' };
    return { error: error.message };
  }

  revalidatePath('/settings');
  return { success: true, group: data };
}

// 그룹 수정
export async function updateRoleGroup(id: string, name: string, description: string, allowedMenus: string[]) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from('role_groups')
    .update({ name, description: description || null, allowed_menus: allowedMenus })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { success: true };
}

// 그룹 삭제
export async function deleteRoleGroup(id: string) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  // 매핑도 CASCADE로 삭제됨
  const { error } = await admin
    .from('role_groups')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { success: true };
}

// 유저의 그룹 목록 조회
export async function getUserRoleGroups(userId: string) {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_role_groups')
    .select('role_group_id, role_groups(id, name, allowed_menus)')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return data;
}

// 전체 유저-그룹 매핑 조회 (설정 페이지용)
export async function getAllUserRoleGroups() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_role_groups')
    .select('user_id, role_group_id');

  if (error) throw new Error(error.message);
  return data;
}

// 유저에 그룹 배정
export async function assignRoleGroup(userId: string, roleGroupId: string) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from('user_role_groups')
    .insert({ user_id: userId, role_group_id: roleGroupId });

  if (error) {
    if (error.code === '23505') return { error: '이미 배정된 그룹입니다' };
    return { error: error.message };
  }

  revalidatePath('/settings');
  return { success: true };
}

// 유저에서 그룹 제거
export async function removeRoleGroup(userId: string, roleGroupId: string) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from('user_role_groups')
    .delete()
    .eq('user_id', userId)
    .eq('role_group_id', roleGroupId);

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { success: true };
}

// 현재 로그인 유저의 그룹 기반 추가 메뉴 조회
export async function getMyExtraMenus(): Promise<string[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('user_role_groups')
    .select('role_groups(allowed_menus)')
    .eq('user_id', user.id);

  if (!data) return [];

  // 모든 그룹의 allowed_menus를 합침 (중복 제거)
  const allMenus = new Set<string>();
  for (const row of data) {
    const group = row.role_groups as unknown as { allowed_menus: string[] } | null;
    if (group?.allowed_menus) {
      for (const menu of group.allowed_menus) {
        allMenus.add(menu);
      }
    }
  }

  return Array.from(allMenus);
}
