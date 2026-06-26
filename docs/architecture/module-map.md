# 모듈 지도 — 기능 팔레트 · 의존성 · 세그먼트

> 목적: 기존 ERP 기능을 "조립 가능한 모듈"로 분해하고, 세그먼트별 추천 조합을 정의.
> 핵심 통찰: **"ERP"는 한 덩어리가 아니다.** 재고·입고·발주·견적·수주·출고·시리얼·A/S 등
> **독립적으로 켜고 끌 수 있는 기능 영역들의 묶음**이다.

---

## 1. 설계 원칙

- 조립 단위 = **기능 영역(큰 틀)**. 주문·제품 같은 잘잔 기능은 분해하지 않는다(아무도 원치 않음).
- 모듈은 3층: **코어(자동 ON)** / **선택(자유 토글)** / **클러스터(묶음 토글)**.
- 의존성 규칙으로 "깨진 조합" 방지 (예: 재고는 제품 없이 못 켬). → 제약이 아니라 보호.
- 세그먼트(업종)는 **추천 출발점**일 뿐, 고객이 이후 자유 토글 가능.
- 표기: ✅ 기존 코드 있음 / 🆕 신규 개발 / 🔶 부분 존재(확장 필요)

---

## 2. 기능 팔레트 (모듈 카탈로그)

기존 코드 매핑 포함. `workspace_modules.module_key`가 이 key가 됨.

### A. 코어 (항상 ON — 선택 화면에 안 띄움)

| key | 이름 | 상태 | 테이블 | 액션/라우트 |
|---|---|---|---|---|
| `partners` | 거래처/고객 | ✅ | companies, company_products | companies.ts · /companies |
| `products` | 제품/카탈로그 | ✅ | products, categories | products.ts, categories.ts · /products, /categories |
| `platform` | 인증·RBAC·설정 | ✅ | departments, positions, role_groups, menu_access_rules | auth.ts, settings.ts, roleGroups.ts · /settings |

### B. 운영 (Operations) — "ERP"가 쪼개진 독립 모듈들

| key | 이름 | 상태 | 테이블 | 액션/라우트 | 의존(하드) |
|---|---|---|---|---|---|
| `quotations` | 견적 | ✅ | quotations, quotation_items | quotations.ts · /quotations | products, partners |
| `orders` | 수주(판매주문) | ✅ | orders, order_items | orders.ts · /orders | products, partners |
| `inventory` | 재고·창고 | ✅ | inventory_items, inventory_movements, inventory_logs, warehouses(+locations) | inventory.ts, warehouses.ts · /inventory, /warehouses | products |
| `serials` | 시리얼·바코드 추적 | ✅ | (inventory_items 시리얼 필드), shipment_serials, product_lots | lots.ts · /serials, /lots | inventory |
| `receiving` | 입고 | ✅ | receiving_orders, receiving_items, receiving_staging | receiving.ts · /receiving, /receiving-orders | products, inventory |
| `purchasing` | 발주·구매·대금 | ✅ | purchase_orders, (payments) | purchaseOrders.ts | products, partners |
| `supply` | 선적·통관(공급망) | ✅ | inbound_shipments | inboundShipments.ts | purchasing |
| `fulfillment` | 출고·물류 | ✅ | shipments, shipment_serials | shipments.ts · logistics 앱 | orders, inventory |

### C. 서비스 (Service)

| key | 이름 | 상태 | 테이블 | 액션/라우트 | 의존 |
|---|---|---|---|---|---|
| `service` | A/S·수리 | ✅ | as_requests, as_logs | asRequests.ts · /as | (소프트) products, partners |
| `warranty` | 보증 관리 | 🔶 | warranties(예정) | /warranty | service |

### D. 영업·관계 (Sales & Relationship)

| key | 이름 | 상태 | 테이블 | 의존 |
|---|---|---|---|---|
| `crm_basic` | 거래처 이력·메모 | ✅ | crm_logs (현재 orders.ts에 내장) | partners |
| `crm_pipeline` | 영업 파이프라인(리드→딜) | 🆕 | leads, deal_stages (신규) | partners |

### E. 협업 (Collaboration)

| key | 이름 | 상태 | 의존 |
|---|---|---|---|
| `chat` | 팀 채팅 + 엔티티 멘션 | 🆕 | (소프트) 전체 — 켜진 모듈의 레코드를 태그 |

### F. 인사이트 (Insight)

| key | 이름 | 상태 | 액션/라우트 | 의존 |
|---|---|---|---|---|
| `analytics` | 손익·대시보드 | ✅ | profitLoss.ts · /profit-loss | 켜진 운영 모듈에서 읽음 |

### G. 채널 (Channels)

| key | 이름 | 상태 | 의존 |
|---|---|---|---|
| `b2b_portal` | B2B 고객 셀프 포털 | ✅ | partners, products, orders, quotations |
| `ecommerce` | 온라인스토어 연동 | 🆕 | products, inventory, orders |
| `pos` | 오프라인 POS | 🆕 | products, inventory |

> **요약:** 기존 ERP에서 이미 ✅인 모듈이 14개. 🆕 신규는 4개(crm_pipeline, chat, ecommerce, pos)뿐.
> 즉 비전의 대부분은 **기존 코드를 모듈로 게이팅**하는 작업이고, 진짜 새로 짜는 건 소수.

---

## 3. 의존성 그래프

```
                        [platform] (항상)
                            │
        ┌──────────────[partners]──────────────┐
        │                   │                   │
   [crm_basic]        [crm_pipeline]🆕     [products]──────────────┐
        │                                       │                  │
     [service]                          ┌───────┼───────┐          │
                                   [inventory] [quotations] [orders]
                                        │           │         │
                          ┌─────────────┼──────┐    └──[b2b_portal]┘
                       [serials]   [receiving] [fulfillment]
                                        │           ▲
                                   [purchasing]     │ (orders+inventory)
                                        │
                                    [supply]

   [pos]🆕 → products,inventory      [ecommerce]🆕 → products,inventory,orders
   [analytics] → 켜진 운영 모듈에서 읽음
   [chat]🆕 → 켜진 모든 모듈의 레코드를 멘션
```

- **하드 의존(없으면 못 켬):** 위 화살표.
- **소프트 의존(있으면 더 좋음):** analytics·chat은 뭐가 켜지든 거기에 맞춰 동작.
- **자동 동반:** 모듈 켤 때 하드 의존 모듈은 자동으로 같이 켜지거나, "먼저 X를 켜세요" 안내.

---

## 4. 세그먼트 → 추천 모듈 지도

코어(partners/products/platform)는 생략(자동). 아래는 **선택 모듈 추천 세트**.

| 세그먼트 | 추천 선택 모듈 | 빠지는 것 |
|---|---|---|
| **제조업** | inventory, receiving, purchasing, orders, quotations, serials, analytics | crm_pipeline, pos, ecommerce |
| **유통/도매** | inventory, receiving, purchasing, orders, quotations, fulfillment, crm_pipeline, analytics | pos, serials(선택) |
| **전자기기 유통**(친구 회사 원형) | inventory, serials, receiving, purchasing, supply, orders, quotations, fulfillment, b2b_portal, service, analytics | crm_pipeline, pos |
| **소매점** | inventory, pos, orders, analytics | purchasing(선택), 견적/물류 |
| **이커머스** | inventory, ecommerce, orders, fulfillment, analytics | 견적, A/S(선택) |
| **서비스업** | crm_pipeline, service, chat, analytics | inventory·재고 계열 전부 ❌ |
| **로봇/설비 총판** | serials, inventory, orders, quotations, service, warranty, fulfillment, b2b_portal | pos, ecommerce |

> 서비스업엔 재고 계열이 통째로 빠지고, 제조업엔 CRM 파이프라인이 옵션 — 정확히 의도한 그림.
> 이 표가 프로토타입 `INDUSTRIES` 배열 / 신규 `workspace_modules` 시드의 v1 소스.

---

## 5. 모듈 게이팅 작동 방식 (구현 메커니즘)

1. `workspace_modules`에 워크스페이스별 on/off 저장 (멀티테넌시 설계 참조).
2. **사이드바**: 기존 RBAC `canAccessMenu()` 엔진을 확장 — "권한 OK" + "모듈 ON"이어야 메뉴 표시.
3. **라우트 가드**: 꺼진 모듈의 페이지 진입 시 차단/리다이렉트(미들웨어).
4. **의존성 검증**: 모듈 토글 시 하드 의존 체크(재고 끄면 serials/receiving도 경고).
5. **온보딩**: 세그먼트 선택 → 위 표대로 `workspace_modules` 시드.

> 코드는 물리적으로 안 뜯는다. **설정 기반 게이팅**(슬랙/노션식 기능 잠금)으로 켜고 끈다.

---

## 6. 신규 개발 분량 (현실 점검)

| 분류 | 모듈 | 작업량 |
|---|---|---|
| 게이팅만 (코드 있음) | partners, products, quotations, orders, inventory, serials, receiving, purchasing, supply, fulfillment, service, crm_basic, analytics, b2b_portal | 모듈 레지스트리 + 나비/가드만 |
| 신규 스키마+UI | crm_pipeline 🆕, chat 🆕 | 중 |
| 후속(나중) | ecommerce 🆕, pos 🆕, warranty 확장 | 후순위 |

---

## 7. 다음 단계

1. `workspace_modules` 시드 = 위 4번 세그먼트 표 코드화
2. **모듈 레지스트리** 정의(이 문서 2번을 코드 상수로) + 사이드바/가드 연결
3. 신규 `crm_pipeline`, `chat` 스키마 설계(별도 문서)
4. 멀티테넌시(`docs/architecture/multi-tenancy-migration.md`)와 순서 조율 — 보통 멀티테넌시 → 모듈 게이팅 순.
