'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { parseRole } from '@/lib/roles';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import type { UserRole, Department, Position } from '@/lib/roles';

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };
  redirect('/products');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

// 비밀번호 리셋 이메일 발송
export async function sendPasswordReset(formData: FormData) {
  const email = formData.get('email') as string;
  if (!email) return { error: '이메일을 입력해주세요.' };

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
  });

  if (error) return { error: error.message };
  return { success: true };
}

// 비밀번호 변경 (리셋 토큰으로 로그인된 상태에서)
export async function updatePassword(formData: FormData) {
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!password || password.length < 6) return { error: '비밀번호는 6자 이상이어야 합니다.' };
  if (password !== confirmPassword) return { error: '비밀번호가 일치하지 않습니다.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };
  return { success: true };
}

// 현재 로그인 유저 기본 정보 조회
export async function getCurrentUser() {
  if (process.env.PREVIEW_MODE === 'true') {
    return { id: 'preview', name: '홍길동', email: 'preview@example.com' };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const name =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    user.email?.split('@')[0] ||
    '사용자';
  return { id: user.id, name, email: user.email ?? '' };
}

// 현재 로그인 유저의 역할 조회 (직급 레벨 포함)
export async function getUserRole(): Promise<UserRole> {
  // 미리보기 모드: 최고 권한으로 반환
  if (process.env.PREVIEW_MODE === 'true') {
    return { department: 'management', position: 'director', positionLevel: 99 };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const role = parseRole(user.app_metadata);

  // 직급 레벨 조회
  const { data: posData } = await supabase
    .from('positions')
    .select('level')
    .eq('id', role.position)
    .single();

  return {
    ...role,
    positionLevel: posData?.level ?? 0,
  };
}

// 유저 역할 변경 (마스터만 가능)
export async function updateUserRole(userId: string, department: Department, position: Position) {
  await requireSuperAdmin();
  const adminClient = await createAdminClient();

  // 대상 유저의 app_metadata 업데이트
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { department, position },
  });

  if (error) return { error: error.message };
  return { success: true };
}

// 어드민 유저 목록 조회 (역할 관리용)
export async function getAdminUsers() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const adminClient = await createAdminClient();

  const { data, error } = await adminClient.auth.admin.listUsers();
  if (error) throw new Error(error.message);

  // admin 타입 회사에 연결된 유저만 필터 (또는 전체)
  return data.users.map((u) => ({
    id: u.id,
    email: u.email ?? '',
    department: (u.app_metadata?.department as string) ?? null,
    position: (u.app_metadata?.position as string) ?? null,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
  }));
}
