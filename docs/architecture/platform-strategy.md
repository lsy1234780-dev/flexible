# 플랫폼 전략

## 최종 목표

| 앱 | 현재 | 최종 | 기술 |
|----|------|------|------|
| admin | Next.js 웹 | 데스크톱 앱 | Tauri + Supabase Realtime |
| logistics | Next.js 웹 | 모바일 앱 | PWA → Capacitor |
| b2b-portal | Next.js 웹 | 웹 유지 | Next.js 그대로 |

---

## 개발 전략: 웹 먼저, 껍데기는 나중에

```
1~4차: Next.js 웹으로 전체 기능 개발
4차 완료 후:
  → admin에 Tauri 데스크톱 래퍼 씌우기
  → logistics에 PWA 설정 추가 (manifest.json + service worker)
  → 필요 시 Capacitor로 네이티브 앱 전환
```

### 이유

- 웹 코드 자산을 100% 재활용
- 개발 중 서비스워커 캐싱이 디버깅 방해하므로 나중에 추가
- Tauri/Capacitor 전환 자체가 설정 파일 수준의 작업

---

## Tauri (데스크톱)

admin을 데스크톱 앱으로 감싸는 목적:
- 프로그램 실행으로 바로 접속 (웹 브라우저 거치지 않음)
- 시스템 트레이, 네이티브 알림
- Supabase Realtime으로 실시간 재고/주문 업데이트
- 항상 켜두는 앱이므로 Electron보다 메모리 가벼운 Tauri 선택

### 모노레포 구조

```
apps/
├── admin/              # Next.js 코드 (공유)
└── admin-desktop/      # Tauri 설정 파일만 (src-tauri/)
```

`admin-desktop`은 `admin`을 빌드해서 로드하는 래퍼입니다. 코드 중복 없음.

---

## Capacitor (모바일)

logistics를 모바일 앱으로 전환하는 목적:
- 창고 직원이 스마트폰에서 앱 아이콘으로 바로 실행
- 바코드 스캔 (카메라), 오프라인 캐싱
- Android/iOS 모두 지원

### PWA 먼저 → Capacitor 나중에

```
Step 1: PWA 설정 (manifest.json + service worker)
  → 홈화면 추가로 앱처럼 사용 가능
  → 코드 변경 거의 없음

Step 2: 한계 느껴지면 Capacitor로 전환
  → `next build` + `npx cap add ios/android`
  → 앱스토어 없이 APK 직접 배포 가능 (사내)
```

---

## B2B Portal (웹 유지)

- 거래처에 앱을 설치하게 할 수 없으므로 웹 브라우저 접속
- 영원히 Next.js 웹으로 유지
- 별도 플랫폼 전환 계획 없음

---

## Supabase Realtime (공통)

4차 이후 적용 예정:
- 재고 변경 감지 → 관련 화면 자동 갱신
- 주문 상태 변경 → 알림
- 대시보드 실시간 현황

Tauri 데스크톱 앱에서 Realtime 구독하면 특정 영역만 주기적으로 갱신하는 구조.
