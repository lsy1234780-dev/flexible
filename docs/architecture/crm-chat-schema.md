# CRM 파이프라인 + 채팅 스키마 설계

> 모듈 지도(`module-map.md`)에서 유일한 🆕 신규 영역 2개의 DB 설계.
> 전제: 멀티테넌시(`multi-tenancy-migration.md`)가 먼저 적용되어 `workspaces`가 존재.
> 제안 마이그레이션: 멀티테넌시(041~044) 다음 → `045_crm_pipeline.sql`, `046_chat.sql`.

---

## 0. 비개발자용 요약

- **CRM 파이프라인** = 영업 기회(딜)를 "리드→상담→견적→계약" 칸반으로 관리. 거래처(`companies`)에 연결.
- **채팅** = 팀 대화 + **엔티티 멘션**(메시지에서 주문/딜/거래처를 태그 → 클릭하면 그 레코드로 점프).
- 멘션은 별도 테이블(`message_mentions`)에 "이 메시지가 저 레코드를 가리킨다"를 저장 → **양방향**으로 작동:
  채팅→레코드(클릭 점프) / 레코드→채팅(이 주문에 대한 대화 모아보기).

---

## 1. CRM 파이프라인

### 1-1. `deal_stages` — 파이프라인 단계 (워크스페이스별 설정)

```sql
create table deal_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,                 -- '리드','상담','견적','협상','계약'
  sort_order integer not null default 0,
  kind text not null default 'open'   -- open | won | lost
    check (kind in ('open','won','lost')),
  color text,
  created_at timestamptz default now()
);
```

> 단계를 테이블로 둔 이유: 워크스페이스마다 영업 단계가 다름(서비스업 vs 제조업). 고객이 자기 단계를 편집.
> v1은 워크스페이스당 단일 파이프라인. (다중 파이프라인은 후속 — `pipelines` 테이블 추가 시 확장)

### 1-2. `deals` — 영업 기회

```sql
create table deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  company_id uuid references companies(id) on delete set null,  -- 거래처(partners 모듈)
  stage_id uuid references deal_stages(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,   -- 담당자
  value numeric default 0,            -- 예상 매출
  currency text default 'KRW',
  status text not null default 'open' -- open | won | lost
    check (status in ('open','won','lost')),
  expected_close_date date,
  source text,                        -- 유입 경로(추천/광고/인바운드)
  quotation_id uuid references quotations(id) on delete set null, -- 견적 모듈 연동(선택)
  order_id uuid references orders(id) on delete set null,         -- 수주 전환(선택)
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

> **모듈 연동 포인트:** `quotation_id`/`order_id`는 견적·수주 모듈이 켜져 있을 때만 의미.
> 딜이 '계약(won)'되면 → 견적 생성 또는 수주 전환. 기존 `createQuotationFromOrder` 패턴과 연결.

### 1-3. `deal_activities` — 딜 활동 로그 (통화/미팅/할일)

```sql
create table deal_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  type text not null check (type in ('call','meeting','task','note','email')),
  content text,
  due_at timestamptz,                 -- task일 때 마감
  done boolean default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
```

### 1-4. 기본 단계 시드 (워크스페이스 생성 시)

```sql
-- 신규 워크스페이스에 기본 파이프라인 깔기 (함수 or 온보딩에서 호출)
insert into deal_stages (workspace_id, name, sort_order, kind) values
  (:ws, '리드',  0, 'open'),
  (:ws, '상담',  1, 'open'),
  (:ws, '견적',  2, 'open'),
  (:ws, '협상',  3, 'open'),
  (:ws, '계약',  4, 'won'),
  (:ws, '실패',  5, 'lost');
```

---

## 2. 채팅 + 엔티티 멘션

### 2-1. `channels` / `channel_members`

```sql
create table channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,                 -- '영업팀','물류'
  is_private boolean default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table channel_members (
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  primary key (channel_id, user_id)
);
```

### 2-2. `messages` — 채널 메시지 OR 레코드 첨부 스레드

```sql
create table messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,

  -- 위치는 둘 중 하나: 채널 대화 OR 특정 레코드에 달린 스레드
  channel_id uuid references channels(id) on delete cascade,
  context_type text,                  -- 'order','deal','partner','as_request' ...
  context_id uuid,                    -- 그 레코드 id (FK 없음 — 다형성)

  reply_to uuid references messages(id) on delete set null,  -- 스레드 답글
  edited_at timestamptz,
  created_at timestamptz default now(),

  -- 채널 메시지이거나, 레코드 스레드이거나 — 정확히 하나
  check (
    (channel_id is not null and context_type is null)
    or (channel_id is null and context_type is not null and context_id is not null)
  )
);
create index on messages (channel_id, created_at);
create index on messages (context_type, context_id, created_at);
```

> `context_type/context_id`가 **"레코드 → 채팅"**의 핵심. 주문 상세 화면 옆 "이 건 대화"가 여기 저장됨.

### 2-3. ★ `message_mentions` — 엔티티 멘션 (양방향 연결의 심장)

```sql
create table message_mentions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  entity_type text not null,          -- 'order','partner','product','deal','quotation','as_request'
  entity_id uuid not null,            -- 대상 레코드 (FK 없음 — 여러 테이블을 가리킴)
  label text not null,                -- 멘션 시점 표시 텍스트(스냅샷)
  created_at timestamptz default now()
);
create index on message_mentions (entity_type, entity_id);  -- 역방향 조회 핵심 인덱스
```

**왜 FK가 없나 (다형성):** `entity_id`는 주문·거래처·딜 등 **여러 테이블 중 하나**를 가리켜서 단일 외래키를 못 건다. 대신:
- 앱 계층에서 유효성 검증(존재하는 레코드인지),
- `label`에 표시 텍스트를 **스냅샷**으로 저장 → 원본이 삭제/개명돼도 멘션 텍스트 유지.
- `entity_type` 값은 모듈 지도(`module-map.md`)의 module key 체계와 일치 → 새 모듈도 마이그레이션 없이 멘션 가능.

---

## 3. 양방향 연결 작동 방식

### 채팅 → 레코드 (클릭 점프)
```
메시지 렌더 시: message_mentions 조회 → 본문의 토큰을 칩으로 치환
칩 클릭 → navTo(entity_type, entity_id) → 해당 모듈 페이지 + 레코드 하이라이트
```

### 레코드 → 채팅 (관련 대화 모아보기)
```sql
-- 예: 이 주문(X)을 언급한 모든 메시지
select m.* from messages m
join message_mentions mm on mm.message_id = m.id
where mm.entity_type = 'order' and mm.entity_id = :X
order by m.created_at desc;
```
+ 주문에 직접 달린 스레드: `messages where context_type='order' and context_id=:X`.

> 프로토타입(`index.html`)에서 이미 이 UX를 가짜 데이터로 증명함. 이 스키마가 그 진짜 버전.

---

## 4. RLS · 실시간 · 권한

- **RLS:** 모든 테이블 `workspace_id` 스코프(멀티테넌시 표준 정책 그대로).
- **비공개 채널:** `messages`/`channels` 정책에 "비공개면 `channel_members`에 속한 유저만" 추가 조건.
- **실시간:** `messages` 테이블에 Supabase Realtime 구독(채널/스레드 단위) → 즉시 수신.
- **멘션 알림(후속):** `message_mentions`에서 사람 멘션(`entity_type='user'`)은 인박스/알림으로 확장 가능(지금 범위 밖).

---

## 5. 모듈 게이팅과의 관계

- `crm_pipeline` 모듈 OFF → deals/stages 메뉴·라우트 숨김(테이블은 비어있을 뿐).
- `chat` 모듈 OFF → 채팅 UI·멘션 입력 숨김. 단 다른 모듈 레코드는 정상 동작.
- 멘션 가능한 `entity_type`은 **현재 워크스페이스에 켜진 모듈**로 제한(꺼진 모듈 레코드는 멘션 후보에서 제외).

---

## 6. 다음 단계

1. (선행) 멀티테넌시 041~044 적용 → `workspaces` 존재
2. `045_crm_pipeline.sql` (deal_stages, deals, deal_activities + RLS + 기본단계 시드)
3. `046_chat.sql` (channels, channel_members, messages, message_mentions + RLS + Realtime)
4. UI: 칸반(deals) / 채팅 + 멘션 자동완성 — 프로토타입을 실제 컴포넌트로
5. 워크스페이스 생성 훅에 기본 단계 + 기본 채널(#general) 시드 추가
