import 'server-only';

// 웹푸시 발송 — 서버 전용.
// VAPID 키가 없으면 조용히 스킵(로컬/미설정 환경에서 채팅이 죽으면 안 됨).
// 구독 조회는 admin client(RLS 우회): "다른 유저에게 보내는" 서버 작업이라 유저 세션으론 불가능.
// 죽은 엔드포인트(404/410)는 발송 시점에 정리한다.
//
// 키 발급(사람이 직접): npx web-push generate-vapid-keys
//   → NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 를 .env.local에

import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/server';

export interface PushPayload {
  title: string;
  body: string;
  url: string;   // 알림 클릭 시 이동 (예: /chat?channel=...)
  tag?: string;  // 같은 tag는 브라우저가 겹쳐서 표시 (채널당 1개)
}

function vapidConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

// userIds의 모든 기기 구독으로 발송. 실패해도 절대 throw하지 않는다(부가 기능).
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0 || !vapidConfigured()) return;
  if (process.env.PREVIEW_MODE === 'true') return;

  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? 'mailto:lsy1234780@gmail.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );

    const admin = createAdminClient();
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', userIds);
    if (!subs || subs.length === 0) return;

    const body = JSON.stringify(payload);
    const deadIds: string[] = [];

    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
            { TTL: 60 * 60 }, // 1시간 지나면 폐기 (채팅 알림은 신선할 때만 의미)
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) deadIds.push(s.id); // 구독 만료 → 정리
        }
      }),
    );

    if (deadIds.length > 0) {
      await admin.from('push_subscriptions').delete().in('id', deadIds);
    }
    await admin
      .from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .in('user_id', userIds);
  } catch {
    // 푸시는 부가 기능 — 어떤 실패도 본 작업(메시지 전송)에 영향 주지 않는다
  }
}
