'use server';

// 웹푸시 구독 등록/해제.
// 저장은 admin client로 한다: endpoint는 전역 유니크라, 같은 브라우저에서 계정을 바꿔
// 로그인한 경우 기존 행(다른 user_id 소유)을 새 유저로 넘겨받아야 하는데 RLS로는 불가능.
// 유저 신원은 이 액션이 세션에서 직접 확인하므로 안전하다.

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/actions/auth';
import { getCurrentWorkspaceId } from '@/lib/workspace';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscription(sub: PushSubscriptionInput, userAgent?: string) {
  if (process.env.PREVIEW_MODE === 'true') return { error: '미리보기 모드에서는 사용할 수 없습니다' };
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { error: '잘못된 구독 정보입니다' };

  const me = await getCurrentUser();
  if (!me?.id) return { error: '로그인이 필요합니다' };
  const workspaceId = await getCurrentWorkspaceId();

  const admin = createAdminClient();
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: me.id,
      workspace_id: workspaceId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent ?? null,
    },
    { onConflict: 'endpoint' },
  );
  if (error) return { error: error.message };
  return { success: true };
}

// ─── DND (알림 일시중지) — notification_settings, RLS own-row ───

export async function getDndUntil(): Promise<string | null> {
  if (process.env.PREVIEW_MODE === 'true') return null;
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me?.id) return null;
  const { data } = await supabase
    .from('notification_settings')
    .select('dnd_until')
    .eq('user_id', me.id)
    .maybeSingle();
  const until = data?.dnd_until as string | null | undefined;
  return until && new Date(until) > new Date() ? until : null;
}

// until: ISO 문자열(그때까지 푸시 스킵) 또는 null(해제)
export async function setDndUntil(until: string | null) {
  if (process.env.PREVIEW_MODE === 'true') return { error: '미리보기 모드에서는 사용할 수 없습니다' };
  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me?.id) return { error: '로그인이 필요합니다' };
  const { error } = await supabase
    .from('notification_settings')
    .upsert({ user_id: me.id, dnd_until: until, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  return { success: true };
}

export async function removePushSubscription(endpoint: string) {
  if (process.env.PREVIEW_MODE === 'true') return { success: true };
  const me = await getCurrentUser();
  if (!me?.id) return { error: '로그인이 필요합니다' };

  const admin = createAdminClient();
  // 본인 소유 행만 삭제 (endpoint 탈취로 남의 구독을 지우지 못하게)
  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', me.id);
  if (error) return { error: error.message };
  return { success: true };
}
