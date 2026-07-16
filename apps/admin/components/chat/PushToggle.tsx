'use client';

// 브라우저 푸시 알림 토글 — 채팅 사이드바 헤더에 놓는 작은 버튼.
// 켜면: 권한 요청 → sw.js 등록 → 구독 → 서버 저장. 끄면: 구독 해제 + 서버 삭제.
// VAPID 공개키가 없거나(미설정 환경) 브라우저가 미지원이면 아예 렌더하지 않는다.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, BellOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { savePushSubscription, removePushSubscription } from '@/actions/push';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = 'unsupported' | 'off' | 'on' | 'busy';

export default function PushToggle() {
  const [state, setState] = useState<State>('unsupported');

  useEffect(() => {
    if (!VAPID_PUBLIC || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker
      .getRegistration('/sw.js')
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  if (state === 'unsupported') return null;

  async function enable() {
    setState('busy');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast.error('브라우저 알림 권한이 거부되어 있습니다');
        setState('off');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC!) as BufferSource,
        }));
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('구독 생성 실패');
      const res = await savePushSubscription(
        { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
        navigator.userAgent,
      );
      if (res?.error) throw new Error(res.error);
      setState('on');
      toast.success('멘션·DM을 브라우저 알림으로 받습니다');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '알림 설정에 실패했습니다');
      setState('off');
    }
  }

  async function disable() {
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
      toast.success('브라우저 알림을 껐습니다');
    } catch {
      toast.error('알림 해제에 실패했습니다');
      setState('on');
    }
  }

  const on = state === 'on';
  return (
    <button
      onClick={() => (state === 'busy' ? undefined : on ? disable() : enable())}
      disabled={state === 'busy'}
      className={cn(
        'p-1 rounded transition-colors',
        on ? 'text-blue-600 hover:text-blue-700' : 'text-gray-400 hover:text-gray-700',
      )}
      title={on ? '브라우저 알림 켜짐 (멘션·DM) — 클릭해서 끄기' : '브라우저 알림 켜기 (멘션·DM)'}
    >
      {on ? <BellRing size={15} /> : <BellOff size={15} />}
    </button>
  );
}
