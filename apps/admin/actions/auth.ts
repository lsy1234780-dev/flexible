'use server';

import { createClient } from '@/lib/supabase/server';
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

// 구글 OAuth 시작 — 비밀번호 없이 로그인 간소화.
// flow='login'  : 기존 워크스페이스 멤버만 통과(초대제). 비멤버는 콜백에서 차단.
// flow='signup' : 비멤버면 콜백이 /onboarding으로 보내 새 워크스페이스 생성.
export async function signInWithGoogle(flow: 'login' | 'signup' = 'login') {
  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl}/auth/callback?flow=${flow}`,
    },
  });

  if (error) return { error: error.message };
  if (data.url) redirect(data.url); // 구글 동의 화면으로 이동
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

  if (!password || password.length < 8) return { error: '비밀번호는 8자 이상이어야 합니다.' };
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return { error: '비밀번호는 영문자와 숫자를 모두 포함해야 합니다.' };
  }
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
  const supabase = await createClient();

  // 대상 유저의 app_metadata(부서/직급) 업데이트 — anon+RLS(SECURITY DEFINER, 권한 검증 내부)
  const { error } = await supabase.rpc('set_user_app_role', {
    p_user: userId,
    p_department: department,
    p_position: position,
  });

  if (error) return { error: error.message };
  return { success: true };
}

// 어드민 유저 목록 조회 (역할 관리용) — 현재 워크스페이스 멤버, anon+RLS(SECURITY DEFINER)
export async function getAdminUsers() {
  if (process.env.PREVIEW_MODE === 'true') return [];
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_workspace_users');
  if (error) throw new Error(error.message);

  return (data ?? []).map((u: {
    id: string; email: string | null; department: string | null;
    position: string | null; created_at: string; last_sign_in_at: string | null;
  }) => ({
    id: u.id,
    email: u.email ?? '',
    department: u.department ?? null,
    position: u.position ?? null,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
  }));
}
