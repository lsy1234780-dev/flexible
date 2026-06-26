# 도메인 맵 — ERP 마스터 백오피스

## 멀티 도메인 구조

본 시스템은 **하나의 DB + 도메인별 앱 분리** 구조로 확장됩니다.

### 대상 사업

| 시스템 | 업종 | 특성 |
|--------|------|------|
| A | 전자기기 유통 | 다SKU, 대량, 채널판매, 후처리 시리얼, B2C+B2B |
| B | 로봇 총판 | 소수모델, 시리얼 필수, 설치/보증/A/S, B2B only |

### 공통 vs 분기

```
공통 (DB 공유)
├── companies     — A의 B2B 거래처 + B의 계약 업체
├── products      — serial_mode로 관리 방식 분기
├── users / auth  — 동일 인증 체계
├── quotations    — 견적서 구조 자체는 동일
└── 정산 / 세금계산서 — 재무 데이터는 항상 공유

분기 (앱/UI 분리)
├── 시리얼 관리   — A: pool(정품등록 후 매칭) / B: strict(1:1 추적)
├── 물류 흐름     — A: 해상·대량·장기 / B: 항공·소량·단기
├── CRM 연결      — A: 정품등록 후 연결 / B: 계약 동시 연결
└── A/S 흐름      — A: 접수 후 수리 / B: 출장·설치·보증 포함
```

---

## 도메인 레이어

```
┌─────────────────────────────────────────────────┐
│                MASTER DATA                      │
│  products / companies / users / departments     │
│  positions / categories / warehouses            │
└────────────────────┬────────────────────────────┘
           ┌─────────┼──────────┐
           ▼         ▼          ▼
┌──────────────┐ ┌────────┐ ┌──────────────┐
│ SUPPLY CHAIN │ │ SALES  │ │ FULFILLMENT  │
│              │ │        │ │              │
│ 발주 (PO)   │ │ 견적   │ │ 입고지시서   │
│ 선적/통관   │ │ 수주   │ │ 출고         │
│ 입고검수    │ │ 계약   │ │ 배송추적     │
│ RMA         │ │ 정산   │ │ 위탁재고     │
└──────────────┘ └────────┘ └──────────────┘
           ▼         ▼          ▼
┌──────────────────────────────────────────┐
│            CRM / SERVICE                 │
│                                          │
│  A/S 접수·점검·수리    (as_requests)     │
│  교환·반품             (return_orders)   │
│  보증관리              (warranties)      │
│  정품등록              (시스템 A 전용)    │
└──────────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────┐
│         MD / REFURB / ANALYTICS          │
│                                          │
│  리퍼브 등급·재판매                       │
│  inventory_ledger (재고 변동 원장)       │
│  AI Agent 분석용 View                    │
│  메타데이터 문서 (erp-metadata.yaml)     │
└──────────────────────────────────────────┘
```

---

## 제품 모드 분기 (`serial_mode`)

`products.serial_mode` 컬럼으로 제품별 관리 방식을 선언적으로 결정합니다.

| 모드 | 설명 | 시리얼 테이블 사용 | 대표 업종 |
|------|------|------------------|-----------|
| `none` | 시리얼 없는 저가/소모품 | X | 라벨지, 충전기 |
| `pool` | 시리얼 보유, 대량, 정품등록 후 매칭 | O (느슨) | 키보드, 모니터 |
| `strict` | 수주 전부터 1:1 추적 필수 | O (엄격) | 로봇, 고가 장비 |

### 시리얼 상태 매핑

```
pool 모드:
  in_pool → registered (정품등록 완료)

strict 모드:
  available → reserved (수주 배정) → shipped → installed → in_service

공통:
  in_service (A/S 중) → 수리 후 원래 상태로 복귀
  disposed (폐기)
```

---

## 앱 구조 (모노레포)

### 현재

```
apps/
├── admin/          # 내부 어드민 (Next.js 16)
├── b2b-portal/     # B2B 업체 포털 (Next.js 16)
└── logistics/      # 물류팀 전용 (Next.js 16, PWA)
```

### 최종 목표

```
apps/
├── admin/              # 공통 어드민 (도메인별 메뉴 분기 by RBAC)
├── admin-desktop/      # Tauri 데스크톱 껍데기 (4차 이후)
├── b2b-portal/         # B2B 업체 포털 (웹 유지)
├── logistics/          # 물류팀 모바일 (Next.js → PWA → Capacitor)
└── logistics-mobile/   # Capacitor 껍데기 (4차 이후)
```

> **현재 단계에서는 admin 하나로 유지**합니다.
> RBAC(부서/직급/그룹 롤)로 팀별 메뉴를 분리하고, 워크플로우가 완전히 갈라지는 시점에 앱을 분리합니다.

---

## 확장 로드맵

| 단계 | 영역 | 주요 테이블 | 상태 |
|------|------|-------------|------|
| 현재 | Master Data + 재고·견적·수주·A/S | products, orders, as_requests | ✅ 완료 |
| 다음 | Supply Chain (PO, 입고검수, 통관) | purchase_orders, inbound_shipments | 예정 |
| 다음 | CRM 확장 (교환·반품) | crm_tickets, return_orders | 예정 |
| 후속 | Settlement (위탁·채널 정산) | settlement_periods, tax_invoices | 예정 |
| 후속 | RMA (본사 불량 반품) | rma_requests, rma_items | 예정 |
| 후속 | Refurb (리퍼브 등급·재판매) | refurb_assessments, refurb_products | 예정 |
| 후속 | Analytics (AI Agent 분석 레이어) | inventory_ledger, 분석용 Views | 예정 |
