# HR 모듈 설계 (근태 · 경비) — 방향과 결정 기록

> 이 문서는 근태관리·경비청구 등 HR 인접 기능을 이 ERP에 붙일 때의 **제품 방향·경계·설계 결정**을 정리한 것이다.
> 아직 구현 전이며(2026-07 기준), 다른 세션에서 이 문서만 읽어도 맥락을 이어갈 수 있게 작성했다.
> 코드 컨벤션·구조는 루트 `CLAUDE.md`, DB 스키마는 `docs/schema/current-schema.md`를 참조.

---

## 0. 한 줄 요약

**HR은 이 ERP의 "retention/편의 확장"이지, flex나 급여SW를 대체하려는 게 아니다.**
이미 우리 ERP 안에서 하루 종일 일하는 팀이 **딴 툴 안 켜고 근태·경비까지 여기서 끝내게** 하는 것이 목적.
우리는 **상류(데이터가 만들어지는 곳)**, 급여SW는 **하류(그 데이터로 돈 계산하는 곳)** — 적대가 아니라 밸류체인.

---

## 1. 포지셔닝 (왜 만드나 / 어디까지 하나)

- **경쟁 상대가 아님.** flex(HR SaaS)·더존/이카운트(ERP형 급여)·순수 급여SW를 이기려는 게 아니다.
- **우리 정체성 = operational hub.** 발주·물류·CRM·재고 + 협업(레코드 스레드·인박스·승인)이 매일 굴러가는 곳. 급여는 월 1회 재무 1명이 돌리는 back-office 정산이라 성격이 완전히 다르다.
- **HR 기능의 역할 두 가지:**
  1. **Retention/편의** — SMB의 툴 난립을 줄임. "이미 여기서 발주하니 근태·경비도 여기서."
  2. **급여SW의 상류 데이터 공급원** — 근무시간·경비를 모아 **export → 급여SW**. 경쟁이 아니라 파이프라인.
- **상류가 더 센 자리다.** 원천 데이터를 쥔 시스템이 sticky. 하류(급여SW)는 교체 가능, 상류(우리)는 자리 유지.

### flex가 실제로 파는 것 (우리가 안 하는 것)
급여(페이롤) + 4대보험 + 원천세 + **연말정산** + 전자근로계약 + 성과관리 + 채용(ATS). 이게 flex의 해자이고 **전부 우리가 안 만드는 무거운 컴플라이언스 영역**. 근태는 HR 시장에서 table-stakes라 그것 때문에 flex에 돈 내는 게 아님.

---

## 2. 핵심 원칙 — "엔진 vs 정책", "기록 vs 판정"

노동법 대응을 우리가 떠안으면 IT 제품이 아니라 노무 컨설팅이 된다. 그래서:

### (A) 정책은 데이터로 뺀다 (하드코딩 금지)
노동법 로직을 코드에 박지 말고 **회사별 설정값**으로 저장하고, 엔진은 그 값대로만 계산.
> 코드는 "주 52시간이 법이다"를 모른다. 그냥 "이 회사 설정값 `weekly_max_minutes`를 넘으면 플래그"만 한다. **법을 아는 건 코드가 아니라 고객이 넣은 설정값.**

### (B) "기록/원장 = 안전, 판정/단정 = 법"
- **기록·원장(ledger)** = 안전. 찍은 시각 저장, 사람이 입력한 값으로 산수(뺄셈/합산), 숫자 표시. → **엑셀과 같은 지위.** 노동법 부담 없음.
- **판정·단정** = 법. "법정 연차 15일이다", "52시간 위반이다", "연장수당 = ×1.5배"처럼 **법적/금전적 결론을 assert하는 순간** 책임 라인에 들어감.
- **철칙: 법적 의미가 있는 숫자는 전부 사람이 입력한다. 우리는 기록하고 투명하게 산수만 한다.** 라벨도 "부여 15일 (관리자 입력)"처럼 중립적으로, "법정"이라고 안 쓴다.

### (C) 결과적으로 노동법 부담 ≈ 0
근로기준법 계산 부담이 생기는 지점은 딱 둘 — **연차 자동 산정**과 **52시간 위반 판정**. 이 둘만 안 만들면 부담이 사라진다. (초기 설계에서 이 둘을 넣었다가 "과설계"로 판단해 **삭제**함.)
남는 건 노동법이 아니라 **일반 개인정보 처리**(출퇴근 시각·위치)인데, 이건 이미 ERP가 직원 데이터를 다루며 지는 부담이라 **근태 때문에 새로 생기는 게 아님**.

---

## 3. 감시(모니터링)에 대한 입장 — 안 만든다

- **주류 협업툴(슬랙/팀즈/잔디)은 "농땡이 감시"를 안 한다.** 슬랙의 초록 점은 presence(자리 표시)일 뿐, 키로그·스크린샷·활성창 추적을 관리자에게 주지 않는다. 의도적 선택.
- "농땡이 감시"는 별개 제품군(**bossware**: Teramind, Hubstaff, Time Doctor 등)이고 우리는 만들지 않는다.
- **이유:** ① 한국 법(개인정보보호법·근로기준법·통신비밀보호법 — 고지·동의 의무, 몰래 감시는 위법 소지), ② 감시를 붙이면 협업툴 신뢰가 붕괴해 정직한 입력(근태 자진 기록·CRM 메모)이 오염됨, ③ 우린 IT회사지 감시 벤더가 아님.
- **건강한 대안(넣어도 되는 것):** presence 상태(근무중/자리비움/재택/외근 — 본인 설정 or 활동 기반, 투명) + **결과 기반 지표**(키보드 두드림이 아니라 "수주 몇 건 처리했나" 같은 산출물 — 이미 ERP에 있음).

---

## 4. 근태 모듈 설계

### 4.1 모듈 등록 (기존 패턴 그대로)
- `apps/admin/lib/modules.ts`: `ALL_MODULE_KEYS`에 `'attendance'` 추가, `MODULE_CATALOG`에 카탈로그 항목, `MENU_MODULE_MAP`에 `/attendance → 'attendance'`
- `Sidebar.tsx`에 "근태" 메뉴 그룹
- `workspace_modules(module_key, enabled)`로 워크스페이스별 on/off (모듈 끄면 메뉴·기능 자동 소멸)

### 4.2 데이터 모델
```
attendance_policy        -- workspace당 1행 (정책 = 고객이 노무사와 정한 값; 대부분 표시용 기본값)
  workspace_id PK, punch_method('button'|'ip'|'gps'),
  allowed_ips text[], gps_lat/lng/radius_m,
  standard_start time, standard_end time, break_minutes int,
  work_days int[] (0~6), weekly_max_minutes int(예:3120=52h, 판정 아니라 알림 임계),
  updated_by, updated_at
  -- 주의: annual_leave_basis(연차 산정 기준) 같은 '법 해석' 파라미터는 넣지 않음(삭제됨)

attendance_records       -- 하루 한 행
  id, workspace_id, user_id, work_date,
  clock_in_at, clock_out_at, work_type('office'|'remote'|'field'),
  worked_minutes int(out-in-break 저장), status, memo,
  UNIQUE(workspace_id, user_id, work_date)

leave_types              -- 휴가 종류 (회사 정의: 연차/반차/병가/경조사/재택/외근…)
  id, workspace_id, name, deducts_annual bool, default_days numeric

leave_requests           -- 휴가 신청 (승인은 approvals 재사용)
  id, workspace_id, user_id, leave_type_id, start_date, end_date, days numeric, reason, status

leave_balances           -- 연차 잔여 (부여량은 관리자 입력, 우리는 차감만)
  workspace_id, user_id, year, granted numeric, used numeric,
  PK(workspace_id, user_id, year)

holidays                 -- 공휴일 (회사가 직접 등록 — 우리가 매년 갱신 책임 안 짐)
  id, workspace_id, holiday_date, name
```

### 4.3 엔진 로직 (추가할 계산)
- **출퇴근(`clockIn`/`clockOut`)**: 오늘 record find-or-create. `punch_method`에 따라 검증 분기(ip=IP대조, gps=반경, button=검증없음). `worked_minutes = (out-in) - break`. **정책이 동작을 결정, 코드는 분기만.**
- **근무시간 집계**: 일별 저장 → 주/월 합산. `weekly_sum > weekly_max_minutes`면 **초과 플래그(알림만, 강제 없음)**. "52시간"은 코드에 없고 설정값일 뿐.
- **초과근무 = 안전한 산수**: 초과 = 실근무(기록) − 소정(회사 설정값). "오늘 9h (소정 8h + 초과 1h)" 표시. **금지선 둘: 연장수당 계산 금지, "위반" 단정 금지.** 시간 집계·표시는 OK.
- **근무일/휴가일수(`countWorkingDays`)**: 주말(work_days) + holidays 제외. 반차=0.5.
- **연차 잔여**: `remaining = granted(관리자 입력) − used(승인된 휴가 days 합)`. 단순 원장. **자동 산정 안 함.**

### 4.4 통합 (기존 자산 재사용)
- **승인** → `approvals` 테이블 재사용 (`entity_type='leave_request'`). 결재선·인박스 "내가 승인할 것"·무결성 트리거가 공짜.
- **인박스** → `getUrgentItems`(actions/dashboard.ts)에 "미출근"(근무일인데 미출근 + 승인휴가 없음), "결재 대기 휴가" 추가.
- **대시보드** → recharts 재사용, 팀 출근율·연차 소진율·초과근무 추이.
- **RBAC** → 본인은 자기 것, 관리자(직급 or workspace_members.role)는 팀 조회 + 정책 설정.

### 4.5 페이지 / RLS
- `/attendance`(내 근태·출퇴근 버튼·월 캘린더), `/attendance/leaves`(휴가 신청·잔여), `/attendance/team`(관리자 팀 현황), `/attendance/policy`(관리자 정책 + **면책 문구 필수**)
- RLS: `select using (user_id = auth.uid())` + 관리자 조회는 서버액션 `requireManager()` 게이트 후 service client
- 마이그레이션: `080_attendance_core`, `081_attendance_leaves`

### 4.6 팀 가시성 (이 모듈의 킬러 기능)
- **부재 현황판(팀 캘린더)** — 이번주/이번달 누가 연차·반차·외근·재택인지 한 화면에. 사장은 "누가 언제 쉬나", 직원은 이거 보고 업무 조율.
- **연차 신청 시 충돌 표시** — "그날 이미 김대리·박과장 연차" → 팀 전원이 같은 날 비는 사고 방지.

---

## 5. 경비 모듈 설계

### 5.1 흐름
기본 골격 **"돈 씀 → 증빙 → 신청 → 결재 → 정산"**. 두 모드:
1. **개인 경비 정산(흔함)** — 개인 돈/카드로 먼저 씀 → 영수증 청구 → 승인 → 회사가 환급(이체)
2. **법인카드 관리** — 법인카드 사용을 사후 등록 → 승인(환급 없음, 증빙만)

헤더+라인 구조 (구매발주 PO와 동일 패턴): "출장 경비" 신청 하나에 "택시/식대/숙박" 라인 여러 줄.

### 5.2 데이터 모델
```
expense_categories   -- 경비 항목(회사 정의: 교통/식대/접대/출장/소모품…) — leave_types와 같은 패턴
expense_claims       -- 신청 헤더 (user, title, total_amount, status, settle_status)
expense_claim_items  -- 라인 (category, amount, spent_at, merchant, payment_method, receipt_url, vat_amount, memo)
```

### 5.3 통합 (재사용)
- **결재** → `approvals` 재사용 (`entity_type='expense_claim'`).
- **영수증 첨부** → Supabase Storage + 채팅의 `message_attachments` 첨부 패턴 재사용.
- **인박스** → "결재 대기 경비", "반려된 내 경비".
- **대시보드** → 월별·부서별 경비 추이(recharts).
- **RecordThread** → 경비 건에 대화 부착.

### 5.4 정산 상태머신 (핵심 설계 결정)
결재(approvals)와 **별개** 상태머신. `expense_claim.settle_status`에 둔다.
실제 이체는 우리 밖(은행/급여SW)에서 일어나므로 "지급됨"은 외부 진실 → **쌍방 확인 + 무응답 자동마감** 패턴.

```
approved
  ├─(재무: 이체 마킹 + 이체증 첨부)→ paid_notified  (직원 인박스: "확인해주세요" D-14)
  │     ├─(직원: 수령확인)──────→ confirmed     (closed_by='employee')
  │     ├─(직원: 이의제기/미수령)→ disputed → (재무 재이체/정정) → 다시 paid_notified
  │     └─(14일 무응답)─────────→ auto_closed   (closed_by='auto', "미이의 마감")
  └─(재무: 이체 취소)───────────→ approved 롤백
```

**꼭 지킬 두 가지:**
1. **직원 쪽은 "확인/이의제기" 둘 다.** "확인"만 있으면 "못 받았다" 케이스가 갈 곳이 없다.
2. **14일 자동마감은 "확인됨"이 아니라 "미이의 마감"으로 기록.** `closed_by`로 경로 구분(`employee` vs `auto`). 안 누른 걸 "확인함"으로 기록하면 거짓 기록 → 분쟁 시 뒤집힘.

**A안 vs B안 (재무 완료 ↔ 직원 확인 관계):**
- **A(묶음):** 상태 하나. 재무 이체+직원 확인 둘 다 돼야 "완료". 단순하지만 재무 장부 마감이 직원 클릭에 인질.
- **B(분리, 권장):** 트랙 둘 — ①지급상태(회계): 재무 이체하면 즉시 "지급완료"(직원 안 기다림). ②수령확인(직원): 별도 플래그. **재무는 예외(미수령)만 처리**하면 됨 = management by exception. 리포팅도 "지급완료율/수령확인율" 분리 가능.
- 14일 자동마감은 두 방식 다 사용. 차이는 "재무 완료를 직원 클릭에 묶느냐(A) 떼느냐(B)"뿐. 월 마감 깐깐한 조직이면 B.

### 5.5 정산 배치 (구매발주 결제 패턴 재사용)
건별 마킹이 아니라 재무가 실제 이체하는 시점에 **묶어서**: 이번달 승인 경비 N건 선택 → "정산 배치" 생성 → 이체일+이체증 첨부 → 일괄 지급완료. `purchase_order_payments`(발주에 결제 여러 건 붙이는) 구조 재사용. "누가 버튼 눌렀다"가 아니라 근거 있는 회계 이벤트가 됨.

### 5.6 갭 방지 (미지급 유실 방지)
- **aging 알림**: 승인 후 N일 미지급 → 재무 인박스 긴급.
- **직원 본인 가시성**: 돈 받을 사람이 자기 상태를 봄 → 가장 강력한 감시자. 미지급이 방치 안 됨.

---

## 6. 명세서 / 문서 (지급명세서 3종 구분)

"지급명세서"는 실무에서 세 가지를 가리키며 우리 경계가 각각 다르다:

| 문서 | 우리 | 비고 |
|------|------|------|
| **경비 지급 내역서** | ✅ 제공 | 우리 `expense_claim` 데이터를 포맷. `apps/admin/lib/pdf`(견적서 PDF `generateQuotation`) 인프라 재사용 → `generateExpenseStatement`. 계산·세무 없음 |
| **급여명세서(임금명세서)** | ❌ | 급여 계산 결과물. 2021.11 근로기준법 교부 의무. 급여SW/flex가 발행. (계산값 import해 "포맷·배포"만 하는 얇은 옵션은 회색지대) |
| **국세청 지급명세서(세무신고)** | ❌ | 홈택스 제출. 세무사/세무SW 영역. 절대 손대지 않음 |

---

## 7. 급여SW와의 관계 (밸류체인)

```
우리(상류)                          급여SW(하류)
근태(근무시간·초과·휴가) ─┐
경비(지출·정산)          ─┼─ export ─→  급여 계산·4대보험·세무신고·급여명세서
발주/수주/재고           ─┘             지급명세서 발행
"데이터가 만들어지는 곳"                "데이터로 돈 계산하는 곳"
```
- 급여SW를 쓴다는 게 우리를 안 쓸 이유가 아니라, **우리가 그 급여SW를 먹여주는 상류 시스템**이 된다.
- **연동이 해자**: 더존·이카운트·flex로 export를 깔끔히 뽑아주면 우린 "너희 급여SW를 먹여주는 시스템"이 되어 빼기 어려워짐.
- **실제 연동 노력이 들어갈 seam = export 포맷.** 우리 근태/경비 데이터가 급여SW가 import할 모양(양식 맞춘 CSV, 나중엔 API)으로 나와야 이 workflow가 말뿐이 아니게 됨. (지금 만들 건 아님, 위치만 기록.)

---

## 8. v1 / v2 컷

**근태 v1**: 출퇴근(버튼) + 근무시간 집계 + 휴가 신청·결재(approvals) + 정책 설정 + 미출근/초과 알림 + 부재 현황판.
**경비 v1**: 신청(헤더+라인) + 영수증 첨부 + 결재(approvals) + 정산 상태머신(쌍방확인+14일자동마감) + 지급 내역서 PDF + 정산 배치.
**공통 v1 연동**: 인박스(getUrgentItems)·대시보드(recharts)·RecordThread 재사용.

**v2 / 선택**: 출퇴근 IP/GPS 인정, 초과근무 사전 신청·승인, 월 근태/경비 **CSV export**(급여SW 연동), ~~presence 상태~~(✅ 2026-07-04 구현 — 마이그 085: 채팅·미니채팅 부재 배지. 휴가=승인에서 자동 파생, 자리비움/외근=본인 설정·당일만 유효. 감시 아님), 교대 스케줄(로스터), 보상휴가, 법인카드 피드 자동매칭(비즈플레이·스펜딧류 — 금융 연동이라 직접 구현보다 연동 권장), 지각/조퇴 표시(감시로 오해되기 쉬워 신중).

**절대 안 함**: 급여 계산, 4대보험, 연말정산, 세무신고, 실제 이체, 세액 판정, 농땡이 감시.

---

## 9. 착수 전 확정해야 할 결정 → 확정됨 (2026-07-04, 오너 결정)

1. **관리자 판정 기준** — ✅ **명시적 권한 부여** (제3의 선택지). RBAC 직급도 workspace role도 아닌,
   `attendance_managers` 테이블에 등록된 사람만 관리자. 이유: 진짜 소규모 기업·스타트업은 인사팀이
   없는 경우가 많아, 권한을 자기들이 자유롭게 부여하는 방식이 맞음. 워크스페이스 owner는
   락아웃 방지 fallback으로 항상 관리자 지정 가능. (근태 v1에서 구현 — 마이그 080)
2. **출퇴근 인정 방식 v1 범위** — ✅ 버튼만. (ip/gps 컬럼은 정책 테이블에 예비로 존재, UI 미노출)
3. **연차 v1 범위** — ✅ 관리자 수동 입력 + 잔여 표시만. used는 저장하지 않고 승인된 신청에서 계산.
4. **경비 정산 상태머신** — ✅ **B안 확정** (2026-07-04). 회계 트랙(`settle_status`: 재무 이체 즉시
   지급완료 — 직원 클릭에 인질 안 잡힘)과 수령확인 트랙(`confirm_status`: 확인/이의제기 양방향,
   14일 무응답은 `auto_closed`="미이의 마감")을 분리. 무응답을 "확인함"으로 기록하지 않고
   `closed_by`('employee'|'auto')로 경로를 구분. 재무 담당은 `expense_managers` 명시 부여
   (근태 관리자와 동일 패턴). (경비 v1에서 구현 — 마이그 083~084)

### 근태 v1 구현 기록 (2026-07-04)

- 마이그레이션: `080_attendance_core`, `081_attendance_leaves`
- 승인 연동: `approvals(entity_type='leave')` 재사용. 승인/반려 → `leave_requests.status`는
  DB 트리거(`approvals_sync_leave`)가 동기화, 요청자 바꿔치기는 `leave_requests_guard`가 차단.
- 권한: 문서 4.5의 "관리자 조회는 service client" 대신 **anon+RLS**(`is_attendance_manager()`)로 구현
  (오너 표준: service role 최소화). 페이지·액션 이중 게이트.
- 페이지: `/attendance`(내 근태), `/attendance/leaves`(휴가+내가 승인할 것),
  `/attendance/team`(오늘 보드+부재 현황판), `/attendance/policy`(정책·공휴일·휴가종류·연차부여·관리자, 면책 문구 고정)
- 인박스: `getUrgentItems`에 관리자용 "출근 전 인원" 알림 추가 (근무일+기준시간 경과+휴가 제외).
- 인박스 워크플로우(2026-07-04 추가): 로그인 첫 화면 상단에 **내 근태 카드**(출퇴근 버튼+오늘 상태+이번주 집계, `InboxAttendance`) +
  **오늘의 팀 카드**(휴가 중·자리비움·예정 휴가·진행 중 결재). `/attendance`까지 안 가도 아침에 인박스에서 바로 출근/퇴근.
- 대시보드 recharts 위젯은 v1에서 제외 (팀 현황판이 그 역할) — 필요 시 후속.

### 경비 v1 구현 기록 (2026-07-04)

- 마이그레이션: `083_expense_core`, `084_expense_receipts_storage`
- 구조: 헤더(`expense_claims`) + 라인(`expense_claim_items`) — 구매발주 PO 패턴.
  두 모드: `reimbursement`(환급) / `corporate_card`(법인카드 사후 등록 — 환급 없음, 증빙만).
- 결재: `approvals(entity_type='expense')` 재사용. 상태머신 전이(결재/지급/수령확인 3트랙)는
  전부 DB 트리거(`expense_claims_guard`)가 강제 — 돈이 걸린 전이를 앱 코드에 안 맡김.
  라인은 draft에서만 수정 가능(`expense_items_guard`).
- 정산: 재무가 은행 이체 후 배치(`expense_settlement_batches`)로 일괄 지급 처리 + 이체증 첨부.
  직원에게 수령확인 요청 → 확인/이의제기, 14일 무응답은 lazy 자동마감(cron 없음 — 목록 로드 시 처리).
- 영수증: `expense-receipts` 비공개 버킷, 경로 기반 RLS(`can_access_expense_object`).
- RLS: 경비는 본인+재무만 조회 (휴가와 달리 금액·사용처 민감 — 팀 공개 안 함).
- 페이지: `/expenses`(내 경비+수령확인 배너), `/expenses/[id]`(라인·영수증·결재·RecordThread),
  `/expenses/finance`(재무 전용 — 지급 대기/이의제기/지급 완료/법인카드/경비 항목/담당자).
- PDF: 지급 내역서(`/api/expenses/[id]/statement`) — 급여명세서·세무 문서 대체 아님 면책 고정.
- 인박스: 내 수령확인 D-n + 재무용 이의제기(high)·7일 경과 미지급 노화 알림.

---

## 관련 재사용 자산 (구현 시 참조)

| 자산 | 위치 | 근태·경비에서의 쓰임 |
|------|------|---------------------|
| 승인 워크플로우 | `apps/admin/actions/approvals.ts`, `components/ApprovalPanel.tsx`, `approvals` 테이블(마이그 077~079) | 휴가·경비 결재 |
| 인박스 긴급 피드 | `actions/dashboard.ts` `getUrgentItems`, `app/(admin)/inbox` | 미출근·결재대기·미지급 알림 |
| 차트 | `app/(admin)/dashboard` (recharts) | 근태·경비 현황 위젯 |
| 파일 첨부 | Supabase Storage + `message_attachments` 패턴 | 영수증·이체증 |
| PDF 생성 | `apps/admin/lib/pdf` (`generateQuotation`) | 경비 지급 내역서 |
| 결제 라인 패턴 | `purchase_order_payments` + PurchaseOrderDetailClient 결제 섹션 | 경비 정산 배치 |
| 모듈 게이팅 | `lib/modules.ts`, `workspace_modules` | attendance/expense 모듈 on/off |
| 레코드 스레드 | `components/RecordThread.tsx`, `moduleRegistry.ts` | 경비/휴가 건에 대화 부착 |
