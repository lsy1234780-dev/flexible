'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

export interface DepartmentRow {
  id: string;
  label: string;
  sort_order: number;
}

export interface PositionRow {
  id: string;
  label: string;
  level: number;
}

// 부서 목록 조회
export async function getDepartments(): Promise<DepartmentRow[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('departments')
    .select('id, label, sort_order')
    .order('sort_order');
  if (error) throw new Error(error.message);
  return data;
}

// 직급 목록 조회
export async function getPositions(): Promise<PositionRow[]> {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('positions')
    .select('id, label, level')
    .order('level');
  if (error) throw new Error(error.message);
  return data;
}

// 부서 추가
export async function createDepartment(id: string, label: string, sortOrder: number) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from('departments')
    .insert({ id, label, sort_order: sortOrder, workspace_id: await getCurrentWorkspaceId() });

  if (error) {
    if (error.code === '23505') return { error: '이미 존재하는 부서 ID입니다' };
    return { error: error.message };
  }

  revalidatePath('/settings');
  return { success: true };
}

// 부서 수정
export async function updateDepartment(id: string, label: string, sortOrder: number) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from('departments')
    .update({ label, sort_order: sortOrder })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { success: true };
}

// 부서 삭제
export async function deleteDepartment(id: string) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  // 해당 부서에 배정된 유저가 있는지 확인
  const adminClient = createAdminClient();
  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const usersInDept = usersData?.users.filter(
    (u) => u.app_metadata?.department === id,
  );
  if (usersInDept && usersInDept.length > 0) {
    return { error: `해당 부서에 ${usersInDept.length}명의 사용자가 있습니다. 먼저 부서를 변경해주세요.` };
  }

  const { error } = await admin
    .from('departments')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { success: true };
}

// 직급 추가
export async function createPosition(id: string, label: string, level: number) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from('positions')
    .insert({ id, label, level, workspace_id: await getCurrentWorkspaceId() });

  if (error) {
    if (error.code === '23505') return { error: '이미 존재하는 직급 ID입니다' };
    return { error: error.message };
  }

  revalidatePath('/settings');
  return { success: true };
}

// 직급 수정
export async function updatePosition(id: string, label: string, level: number) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from('positions')
    .update({ label, level })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { success: true };
}

// 직급 삭제
export async function deletePosition(id: string) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const adminClient = createAdminClient();
  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const usersInPos = usersData?.users.filter(
    (u) => u.app_metadata?.position === id,
  );
  if (usersInPos && usersInPos.length > 0) {
    return { error: `해당 직급에 ${usersInPos.length}명의 사용자가 있습니다. 먼저 직급을 변경해주세요.` };
  }

  const { error } = await admin
    .from('positions')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { success: true };
}
