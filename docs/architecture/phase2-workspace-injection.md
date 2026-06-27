# Phase 2 — 앱 코드 워크스페이스 주입 (진행상황 + 체크리스트)

> 멀티테넌시 Phase 0/1/3은 DB 마이그레이션 052~055로 완료(RLS 격리 + workspace_id NOT NULL).
> Phase 2는 **앱 코드가 workspace를 인식하게** 만드는 단계. 이 문서가 그 작업의 현황판.

## 핵심 원칙

- **읽기(SELECT):** `createClient()`(유저세션 + RLS)가 자동 격리 → **수정 불필요.**
- **쓰기(INSERT):** workspace_id를 명시적으로 넣어야 함.
  - `createClient()` 경로: RLS `WITH CHECK`가 workspace_id를 요구.
  - `createAdminClient()`(service-role) 경로: RLS 우회 → 누락 시 DB 055 NOT NULL이 **에러로 막음**(유출 대신 실패). 그래도 반드시 넣어야 정상 동작.
- 주입은 헬퍼로 통일: `apps/admin/lib/workspace.ts`
  - `getCurrentWorkspaceId()` — 현재 유저의 workspace_id (요청 스코프 캐시).
  - `withWorkspace(row)` — row에 workspace_id를 합쳐 반환.

## 표준 패턴 (레퍼런스: `actions/products.ts` createProduct ✅ 적용완료)

```ts
import { getCurrentWorkspaceId } from '@/lib/workspace';

const workspaceId = await getCurrentWorkspaceId();
await supabase.from('products').insert({ ...parsed.data, workspace_id: workspaceId });
// 같은 액션 내 자식 테이블 insert에도 동일 workspaceId를 그대로 전달.
// 배치 insert는 .map(row => ({ ...row, workspace_id: workspaceId })).
```

## 완료 (apps/admin 전체)

- [x] `lib/workspace.ts` — 헬퍼
- [x] `actions/workspaces.ts` — 신규 가입 흐름(registerWorkspace): workspace+owner멤버+모듈시드
- [x] `actions/products.ts` — createProduct (products / product_lots / inventory_movements / inventory_logs)
- [x] `actions/asRequests.ts` — as_requests, as_logs(×3)
- [x] `actions/categories.ts` — categories
- [x] `actions/companies.ts` — companies (parsed.data에 spread)
- [x] `actions/departments.ts` — departments, positions (특수PK)
- [x] `actions/inboundShipments.ts` — inbound_shipments, inbound_shipment_items(×2), inbound_shipment_events(×3), receiving_orders, receiving_items
- [x] `actions/inventory.ts` — orders, order_items, shipments, shipment_serials, inventory_movements(×3), inventory_logs
- [x] `actions/lots.ts` — product_lots
- [x] `actions/orders.ts` — crm_logs(×2, logCrm 헬퍼 포함), shipments, order_items, quotation_items
- [x] `actions/purchaseOrders.ts` — purchase_orders, purchase_order_items(×2), purchase_order_payments
- [x] `actions/quotations.ts` — quotations(×2), quotation_items(×3), order_items
- [x] `actions/receiving.ts` — receiving_orders(×2), receiving_items(×2), product_lots, inventory_movements, inventory_logs
- [x] `actions/roleGroups.ts` — role_groups, user_role_groups
- [x] `actions/shipments.ts` — shipment_serials(×5)
- [x] `actions/warehouses.ts` — warehouses, warehouse_locations, warehouse_inventory, inventory_movements

> 검증: `.map()` 콜백 내 `await` 버그패턴 0건, 전 insert 사이트 workspace_id 주입 확인.
> DB 음성테스트 통과 — workspace_id 없는 insert는 NOT NULL로 거부(친구 실수 방어), 있으면 통과.

## ⚠️ 아직 안 한 앱 (다음 세션)

- [ ] `apps/b2b-portal` — 발주는 `create_order_with_stock_deduction` RPC(056에서 ws 자동파생)라 무수정 OK. 직접 insert(견적/프로필 등)가 있으면 동일 패턴 적용 필요.
- [ ] `apps/logistics` — receiving_staging 스캔 insert 등 점검 필요.
- 참고: admin은 단일 워크스페이스 유저 전제. b2b-portal 가입자도 workspace_members로 매핑돼야 `getCurrentWorkspaceId()`가 동작.

## ✅ DB RPC — `056_rpc_workspace_id.sql` (적용·라이브검증 완료)

점검 결과 INSERT 때문에 실제로 깨지는 함수는 2개뿐이었음. workspace_id를 **부모 행에서 내부 파생**
(파라미터 추가 X → 함수 시그니처 불변 → 앱 호출부 무수정). 겸사겸사 `search_path=public`도 고정.

- [x] `generate_inventory_items` → inventory_items (products.workspace_id 파생)
- [x] `create_order_with_stock_deduction` (오버로드 2개) → orders, order_items (companies.workspace_id 파생)
- [x] confirm/cancel/restore_order_* — UPDATE만 하므로 안 깨짐 → 수정 불필요 확인
- [x] `generate_product_serials`(3-arg) — 존재하지 않는 product_serials 참조하는 죽은 레거시 → 무시
- 라이브 검증: 임시 company/product로 두 RPC 호출 → orders/order_items/inventory_items에 workspace_id 정확히 주입 확인 후 정리(잔여 0).

## 그 다음 단계 (Phase 2 이후)

1. 가입 UI 페이지(`/register`) + 로그인 후 workspace 컨텍스트 표시(서브도메인 or `/w/slug`)
2. 모듈 게이팅 — `canAccessMenu()`를 `workspace_modules.enabled` 기준으로 확장
3. CRM/채팅 + 엔티티멘션 구현 (`docs/architecture/crm-chat-schema.md`)
