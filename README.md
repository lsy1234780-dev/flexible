# Flexible

중소 제조·유통 회사를 위한 모듈형 업무 툴입니다.
견적·재고·주문·A/S·근태·채팅·CRM을 모듈로 나누고, 회사마다 필요한 모듈만 켜서 씁니다.
같은 코드베이스로 성격이 다른 두 회사(로봇 제조사, 농산물 유통사)가 실제 업무에 사용하고 있습니다.

## 주요 기능

- **운영**: 제품·재고·LOT/시리얼, 입출고, 발주·수주, 견적서 PDF, A/S 접수·처리
- **협업**: 팀 채팅, 주문·견적 등 업무 건 멘션(@주문번호), 통합 인박스, 전역 검색(Ctrl+K)
- **사람**: 출퇴근·재택/외근·휴가·초과근무, 경비 청구와 정산
- **관리**: 승인 워크플로우, 부서/직급 권한, 회사(워크스페이스)별 데이터 격리
- **온보딩**: 업종 프리셋으로 시작하고, 모듈을 켜고 끄면 미리보기에 바로 반영

## 구조

```
apps/
  admin/        사내 업무 툴 (메인 앱)
  b2b-portal/   거래처용 주문·견적 포털
  logistics/    창고용 입고·출고·스캔 앱 (모바일)
  landing/      소개 페이지
supabase/
  migrations/   스키마·RLS 정책 마이그레이션
```

## 기술 스택

- Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4
- Supabase (Postgres, Auth, Realtime, Row Level Security)
- @react-pdf/renderer (견적서·계약서 PDF), Vitest

## 설계 포인트

- **모듈 구성**: 회사(워크스페이스)별로 켜진 모듈만 메뉴와 화면에 노출
- **데이터 격리**: 업무 테이블에 RLS를 적용해 다른 회사 데이터는 데이터베이스 단계에서 조회되지 않음
- **업무 건 중심 대화**: 채팅 메시지가 주문·견적·A/S 건에 연결되어, 대화가 업무 기록과 함께 남음

## 실행

```bash
cd apps/admin
# .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 설정
npm install
npm run dev
npm test                     # Vitest
```
