'use server';

import { createClient } from '@/lib/supabase/server';

// 워크스페이스 초대코드 (094) — 발급/회수는 owner·admin, 합류는 로그인 유저 누구나.
// 전부 anon+세션 클라이언트 → 권한 판정은 SECURITY DEFINER RPC와 RLS가 담당.

export interface WorkspaceInvite {
  id: string;
  code: string;
  expires_at: string;
  max_uses: number | null;
  used_count: number;
  revoked_at: string | null;
  created_at: string;
}

// 초대코드 목록 (RLS: owner/admin만 보임 — 비관리자는 빈 배열)
export async function getInvites(): Promise<WorkspaceInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspace_invites')
    .select('id, code, expires_at, max_uses, used_count, revoked_at, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []) as WorkspaceInvite[];
}

export async function createInvite(input: { expiresDays: number; maxUses: number | null }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_workspace_invite', {
    p_expires_days: input.expiresDays,
    p_max_uses: input.maxUses,
  });
  if (error) {
    if (error.message.includes('INVALID_EXPIRY')) return { error: '만료 기간은 1~90일이어야 합니다.' };
    return { error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { success: true, invite: row as { id: string; code: string; expires_at: string } };
}

export async function revokeInvite(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('revoke_workspace_invite', { p_id: id });
  if (error) return { error: error.message };
  return { success: true };
}

// 초대코드로 워크스페이스 합류 — /join 페이지에서 호출
export async function joinWithCode(code: string) {
  const trimmed = code.trim();
  if (!trimmed) return { error: '초대코드를 입력해주세요.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('join_workspace_with_code', { p_code: trimmed });
  if (error) {
    if (error.message.includes('INVALID_CODE')) return { error: '유효하지 않거나 만료된 초대코드입니다.' };
    if (error.message.includes('ALREADY_IN_WORKSPACE')) return { error: '이미 다른 워크스페이스에 소속된 계정입니다.' };
    if (error.message.includes('NOT_AUTHENTICATED')) return { error: '로그인이 필요합니다.' };
    return { error: error.message };
  }
  return { success: true, workspaceId: data as string };
}
