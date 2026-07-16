'use client';

// 서비스워커 전역 등록 — PWA 설치 가능 + 푸시 수신이 어느 화면에서든 준비되도록.
// (기존엔 채팅에서 알림을 켤 때만 등록했음 → 앱 진입 시 항상 등록)

import { useEffect } from 'react';

export default function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* 등록 실패는 무해 — 푸시/PWA만 비활성 */
      });
    }
  }, []);
  return null;
}
