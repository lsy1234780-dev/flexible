# CRM + 채팅 설계 v2 — "슬랙 이상"의 통합 협업 레이어

> 목적: ① 이미 있는 CRM(`crm_logs`)을 버리지 않고 변형·확장, ② 뗐다 붙였다 되는 모듈로 만들기,
> ③ 슬랙 수준을 **넘어서는** 채팅 설계.
> 토대 문서: `crm-chat-schema.md`(기본 스키마), `module-map.md`(모듈 게이팅), `multi-tenancy-migration.md`(workspace_id).
> 전제: 멀티테넌시(052~056) + 모듈 게이팅(완료)이 이미 적용됨.

---

## 0. 한 장 요약 (비개발자용)

- **CRM은 새로 안 만든다.** 지금 거래처마다 쌓이는 "활동 기록(`crm_logs`)"이 이미 CRM의 절반이다. 여기에 "영업 기회(딜) 칸반"만 얹으면 완성.
- **핵심 무기 = 통합 타임라인.** 한 거래처(또는 주문·딜)를 열면 → 시스템이 남긴 일(발주확정·출고) + 사람이 쓴 메모 + 팀 채팅 + AI 요약이 **한 줄기 시간순**으로 보인다. 슬랙은 채팅만, 이카운트는 기록만. 우리는 **한 화면에 합친다.**
- **엔티티 멘션이 그 둘을 잇는 못.** 채팅에서 주문/딜/거래처를 태그하면 → 그 레코드 화면에 그 대화가 자동으로 붙는다(양방향).
- **전부 뗐다 붙였다.** CRM도 채팅도 `workspace_modules` 토글. 끄면 메뉴·입력이 사라지고, 켜면 즉시 산다(이미 만든 게이팅 위에서 동작).

---

## 1. 기존 CRM 변형·활용 (버리지 않는다)

### 1-1. 지금 있는 것 — `crm_logs` (= `crm_basic` 모듈)

```
crm_logs (company_id, order_id, action, memo, created_by, created_at, workspace_id)
```
- 거래처별 **append-only 활동 피드.** 주문 상태전이(`logCrm`)가 자동으로, 사람이 `addCrmMemo`로 수동으로 쌓음.
- 거래처 상세(`companies/[id]`)에 타임라인으로 노출.
- **판정: 재활용 A급.** 이게 곧 "거래처 360뷰"의 토대. 버리지 말 것.

### 1-2. 변형 1 — `crm_logs`를 "범용 활동 로그"로 일반화

지금은 거래처+주문에만 묶임. 멘션/딜/AS 등 어디서나 활동이 쌓이게 일반화:

```sql
alter table crm_logs add column entity_type text;   -- 'company','deal','order','as_request'...
alter table crm_logs add column entity_id uuid;      -- 그 레코드 (다형성, FK 없음 — 멘션과 동일 패턴)
-- 기존 데이터 백필: entity_type='company', entity_id=company_id
-- order_id는 보조 링크로 유지(호환), 신규는 entity_type/id 사용
```
→ 이제 `crm_logs`는 **"아무 레코드에나 붙는 활동 한 줄"**. company_id 전용 제약을 풂.

### 1-3. 변형 2 — 표준 활동 타입 + 자동 이벤트 확장

`action`을 자유 텍스트 → 느슨한 enum 권장: `system`(자동), `note`(사람 메모), `call`/`meeting`/`task`(영업활동), `stage_change`(딜 단계이동). 기존 한국어 action 값은 `system`로 흡수하며 호환.

### 1-4. 신규 — `crm_pipeline` (딜 칸반)

`crm-chat-schema.md` 1장 그대로: `deal_stages`(워크스페이스별 편집 가능 단계) + `deals`(영업기회, company/quotation/order 연동) + `deal_activities`. **"우리 입맛"의 실체 = `deal_stages`를 고객이 직접 편집** → 제조업/서비스업/총판마다 다른 파이프라인.

> deal_activities vs crm_logs 중복? → **deal_activities를 없애고 crm_logs(일반화본)로 통일** 권장. 딜 활동 = `crm_logs(entity_type='deal', entity_id=deal.id)`. 테이블 하나로 모든 레코드의 활동을 모음 = 1-5의 통합 타임라인이 공짜로 나옴.

### 1-5. ★ 통합 타임라인 (이 설계의 심장)

한 레코드(거래처/딜/주문)를 열면 세 소스를 created_at로 머지해 한 줄기로:

```
①  crm_logs (entity=record)         시스템 이벤트 + 사람 메모 + 영업활동
②  messages (context=record)        그 레코드에 달린 팀 채팅 스레드
③  message_mentions → messages      그 레코드를 "언급한" 다른 채널의 메시지
(+ 후속) AI 요약 카드                 위를 LLM이 한 줄 요약
```
→ **슬랙(채팅만)·이카운트(기록만)가 절대 못 주는 화면.** "이 거래처에 무슨 일이 있었나"가 진짜로 한눈에.

---

## 2. 모듈화 — 뗐다 붙였다

이미 만든 `workspace_modules` 게이팅 위에서 동작. 물리적으로 코드를 안 뜯고 **설정으로 켜고 끔.**

| 모듈 | 내용 | 의존 | 토글 시 |
|---|---|---|---|
| `crm_basic` | 활동 타임라인(crm_logs 일반화) | partners | OFF → 거래처/레코드의 활동탭 숨김 |
| `crm_pipeline` | 딜 칸반(deals/stages) | partners | OFF → /deals 메뉴·라우트 숨김, 테이블은 빈 채 |
| `chat` | 채널 채팅 + 엔티티 멘션 | (소프트) 전부 | OFF → 채팅 UI·멘션입력·레코드 대화탭 숨김 |

**게이팅 규칙 (이미 만든 엔진에 추가):**
- 사이드바: `MENU_MODULE_MAP`에 `/deals→crm_pipeline`, `/chat→chat` 추가.
- **멘션 후보 필터:** 엔티티 멘션 자동완성은 **현재 워크스페이스에 켜진 모듈의 entity_type만** 노출(`getEnabledModules` 재사용). 예: `crm_pipeline` OFF면 딜 멘션 불가.
- **레코드 대화탭:** 그 레코드 모듈이 켜져 있을 때만 표시.
- **라우트 가드(후속):** 꺼진 모듈 URL 직접 접근 차단(현재 사이드바만 숨김 — 공통 과제).

**데이터는 항상 존재, 노출만 게이팅** = 껐다 켜도 데이터 안 날아감(슬랙/노션식 기능 잠금).

---

## 3. "슬랙 이상" 채팅 설계

`crm-chat-schema.md` 2장(channels/messages/message_mentions)을 토대로 슬랙 패리티 + 그 이상을 얹음.

### 3-A. 슬랙 패리티 (있어야 본전)

| 기능 | 설계 |
|---|---|
| 채널 / DM / 그룹DM | `channels.kind in ('channel','dm','group_dm')` + `channel_members`. DM도 멤버 2명짜리 채널로 통일 |
| 스레드 | `messages.thread_root_id`(루트 메시지 id). 루트=null, 답글=루트 가리킴. `reply_count` 캐시 |
| 반응(이모지) | `message_reactions (message_id, user_id, emoji)` |
| 파일/이미지 | Supabase Storage 업로드 → `message_attachments (message_id, storage_path, mime, size, name)` |
| 읽음/안읽음 | `channel_reads (channel_id, user_id, last_read_at)` → 안읽음 카운트 |
| 사람 멘션 @ | `message_mentions(entity_type='user', entity_id=user_id)` → 알림 트리거 |
| 알림 인박스 | `notifications (user_id, type, source_message_id, read_at)` — @멘션·DM·스레드답글 |
| 실시간 수신 | **Supabase Realtime**(Postgres 변경 구독)을 `messages`에 채널/스레드 단위 구독 |
| 타이핑·접속중 | **Realtime Presence**(DB 아님, 휘발성) |
| 검색 | Postgres 전문검색(`tsvector` on messages.body) — 중소팀 규모엔 충분 |
| 편집/삭제 | `edited_at`, soft-delete(`deleted_at`) |

> 우리 타겟이 5~50명 SMB라 Supabase Realtime/Postgres로 **충분히 슬랙 체감**이 나온다. (1만명 조직용 아키텍처는 의도적으로 비범위.)

### 3-B. 슬랙 이상 — 진짜 차별점 (여기가 핵심)

1. **★ 엔티티 멘션 (양방향 레코드 링크)**
   채팅에서 `#주문ORD-2025-001`, `@@정욱상사`, `~딜:로봇납품`을 태그 → 칩으로 렌더, 클릭 시 그 레코드로 점프. 동시에 그 레코드 화면엔 이 대화가 자동으로 붙음(1-5 통합 타임라인). `message_mentions` 다형성으로 구현(설계 완료). **슬랙 링크 언퍼를을 "내부 ERP 데이터"로, 그것도 양방향으로.**

2. **라이브 언퍼를(Unfurl)**
   엔티티 칩은 죽은 링크가 아니라 **실시간 미리보기 카드** — 주문 칩이 "확정·85만원·출고대기"를 그 자리에서 보여줌(레코드에서 즉시 조회). 상태 바뀌면 카드도 바뀜.

3. **액션 메시지 / 슬래시 커맨드**
   채팅에서 바로 ERP를 움직임: `/견적 정욱상사` → 견적 초안 생성, `/딜 로봇납품 → 계약` → 단계 이동, `/재고 BT-100` → 재고 카드. `messages.message_type='action'` + `payload jsonb`. **대화가 곧 업무 실행**(슬랙 워크플로 그 이상 — 우리 도메인에 네이티브).

4. **레코드-결합 스레드**
   모든 주문/딜/거래처가 자기 대화방을 가짐(`context_type/context_id`). "이 주문 어떻게 됐어?"를 그 주문 화면에서 바로 대화. 슬랙엔 없는 개념(채널만 있음).

5. **AI 협업 레이어** (`ai-agent-design.md` 연동)
   채팅 + 엔티티 그래프를 Agent가 읽어: "이 거래처 관련 대화·주문·미수금 요약해줘", 채널 일일 요약, 멘션된 레코드 자동 브리핑. **채팅이 ERP 데이터와 융합돼 있어서** 가능한 일 — 슬랙 AI는 채팅만 본다.

### 3-C. 모듈/멀티테넌시/권한 정합

- 모든 테이블 `workspace_id` 스코프 + 표준 RLS(052~056 패턴 그대로).
- 비공개 채널: 정책에 "`channel_members`에 속한 유저만" 추가 조건.
- 멘션 후보 = 켜진 모듈만(2장).
- RBAC: 채널 접근은 워크스페이스 격리 + 멤버십. 메뉴 노출은 `chat` 모듈 토글.

---

## 4. 마이그레이션 / 구현 순서

```
057_crm_generalize.sql   crm_logs에 entity_type/id 추가 + 백필 + 활동타입 정리
058_crm_pipeline.sql     deal_stages, deals (+ 기본단계 시드 함수) — deal_activities는 crm_logs로 통일
059_chat_core.sql        channels, channel_members, messages, message_mentions, channel_reads
060_chat_rich.sql        message_reactions, message_attachments, notifications + Realtime publication
```
워크스페이스 생성 훅(`createWorkspaceForCurrentUser`)에 **기본 단계 + 기본 채널(#general) 시드** 추가.

**UI 단계:**
1. 통합 타임라인 컴포넌트(거래처/딜/주문 공용) — 기존 crm_logs 뷰를 이걸로 교체
2. 딜 칸반(`/deals`)
3. 채팅 셸(채널 목록 + 메시지 + 실시간) → 스레드/반응/파일 → 멘션 자동완성 + 칩/언퍼를 → 액션 커맨드
4. AI 요약(후속)

---

## 5. 현실 점검 (정직하게)

- **분량:** crm_pipeline은 中(기존 패턴 재사용). **채팅은 大** — 실시간·멘션·언퍼를·파일까지면 이 프로젝트 최대 단일 기능. 3-A(패리티) → 3-B(차별점) 순으로 단계 출시 권장. MVP는 "채널 채팅 + 엔티티 멘션 + 통합 타임라인"만으로도 비전 증명됨.
- **인프라:** Supabase Realtime/Storage/Postgres로 SMB 규모 커버. 한계 지점(언젠가): 대규모 검색, 오프라인 푸시 알림(Edge Function + Web Push/이메일 파이프 필요 — 후속), 모바일 푸시.
- **"슬랙 이상"의 진짜 의미:** 메시징 기능을 슬랙보다 많이 만드는 게 아니라, **채팅이 ERP 데이터와 한 몸**이라 슬랙이 구조적으로 못 하는 것(양방향 레코드 링크 · 라이브 언퍼를 · 대화로 업무실행 · AI가 전체 맥락 읽기)을 한다는 것. 메시징 패리티는 따라가되, 승부는 "통합"에서.

---

## 6. 다음 액션 후보

1. `057~058`(CRM 일반화 + 파이프라인) 먼저 — 작고, 기존 코드 재활용, 통합 타임라인까지 도달
2. 또는 `059 chat_core` — 채널 채팅 + 엔티티 멘션 MVP로 **비전의 데모 임팩트** 바로 확보
3. 프로토타입 `index.html`의 멘션 데모를 실제 컴포넌트 스펙으로 환산
