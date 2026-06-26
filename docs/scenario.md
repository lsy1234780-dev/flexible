# ERP 전산망 — 사용자 시나리오 차트

> 작성일: 2026-03-06
> 대상: 재고관리사원, 물류담당직원, B2B 협력사(정발행/역발행)

---

## 전체 시스템 흐름 개요

```mermaid
flowchart TD
    subgraph ADMIN["apps/admin (내부 어드민)"]
        A1[재고관리사원\n제품등록·바코드·입고]
        A2[영업/B2B 관리사원\n업체승인·단가설정·견적서]
        A3[발주확정 담당자\n주문확정·재고차감]
    end

    subgraph B2B["apps/b2b-portal (협력사 포털)"]
        B1[B2B 협력사 1\n정발행 발주]
        B2[B2B 협력사 2\n역발행 발주]
    end

    subgraph LOGISTICS["apps/logistics (물류팀)"]
        L1[물류담당직원\n출고지시·스캔·완료]
    end

    subgraph DB["Supabase (PostgreSQL + RLS)"]
        D1[(products\ninventory_logs)]
        D2[(companies\ncompany_products)]
        D3[(quotations\norders)]
        D4[(shipments\ncrm_logs)]
    end

    A1 --> D1
    A2 --> D2
    A2 --> D3
    A3 --> D3
    B1 --> D3
    B2 --> D3
    L1 --> D4

    D3 -->|주문 확정 후| L1
```

---

## 시나리오 1 — 재고관리사원: 제품 등록 & 바코드 입고

> **1차 구현** | 앱: `apps/admin` | 패키지: `barqr-lib`

```mermaid
sequenceDiagram
    actor Staff as 재고관리사원
    participant Admin as apps/admin
    participant SA as Server Action
    participant DB as Supabase DB
    participant Barqr as barqr-lib

    Note over Staff,Barqr: [신규 제품 등록]
    Staff->>Admin: /products 접속 → 제품명·바코드·기본단가 입력
    Admin->>SA: createProduct(name, barcode, base_price)
    SA->>SA: 세션 확인 (auth-lib)
    SA->>DB: INSERT INTO products
    DB-->>SA: 저장 완료
    SA-->>Admin: 성공

    Note over Staff,Barqr: [바코드 라벨 생성]
    Staff->>Admin: 바코드 생성 버튼 클릭
    Admin->>Barqr: generateBarcode(barcode_value)
    Barqr-->>Admin: SVG/Canvas 렌더링
    Staff->>Admin: 라벨 프린트 (수량별 일련번호)

    Note over Staff,Barqr: [BT 스캐너 입고 처리]
    Staff->>Admin: /inventory/scan 접속
    Admin->>Barqr: onScanInput(inputEl, callback)
    Staff->>Admin: 스캐너로 바코드 스캔 (Enter 이벤트)
    Admin->>SA: createInventoryLog(product_id, qty, type:'in')
    SA->>DB: INSERT INTO inventory_logs\nUPDATE products.base_stock
    DB-->>SA: 완료
    SA-->>Admin: 입고 완료 알림
    Admin-->>Staff: 재고 수량 업데이트 표시
```

---

## 시나리오 2 — 영업/B2B 관리사원: 업체 승인 & 단가 설정

> **2~3차 구현** | 앱: `apps/admin` | 패키지: `auth-lib`

```mermaid
sequenceDiagram
    actor Manager as 영업/B2B관리사원
    participant Admin as apps/admin
    participant SA as Server Action
    participant DB as Supabase DB

    Note over Manager,DB: [업체 가입 승인]
    Manager->>Admin: /companies 접속 → pending 업체 확인
    Manager->>Admin: 승인 버튼 클릭
    Admin->>SA: approveCompany(company_id)
    SA->>DB: UPDATE companies SET status='active'
    DB-->>SA: 완료
    SA-->>Manager: 승인 완료

    Note over Manager,DB: [업체별 단가·노출 설정]
    Manager->>Admin: /companies/[id] → 제품 단가 설정
    Manager->>Admin: 제품별 custom_price 입력
    Admin->>SA: upsertCompanyProduct(company_id, product_id, custom_price)
    SA->>DB: UPSERT company_products\n(custom_price, visible_stock, is_visible)
    DB-->>SA: 완료
    SA-->>Manager: 설정 저장

    Note over Manager,DB: [단가 결정 로직]
    Note right of DB: company_products 레코드 있음?<br/>YES → custom_price != null → custom_price<br/>YES → custom_price == null → base_price<br/>NO  → is_visible_default=true → base_price
```

---

## 시나리오 3 — 정발행 발주 (어드민 주도)

> **2~3차 구현** | 앱: `apps/admin` + `apps/b2b-portal` | 패키지: `pdf-lib`, `email-lib`

```mermaid
sequenceDiagram
    actor Manager as 영업/B2B관리사원
    actor Partner1 as B2B 협력사 1
    participant Admin as apps/admin
    participant Portal as apps/b2b-portal
    participant SA as Server Action
    participant PdfLib as pdf-lib
    participant EmailLib as email-lib
    participant DB as Supabase DB

    Note over Manager,DB: [어드민이 견적서 생성 → 협력사에 전달]
    Manager->>Admin: /quotations → 새 견적서 작성
    Manager->>Admin: 업체 선택 + 제품·수량 입력
    Admin->>SA: createQuotation(company_id, items[])
    SA->>DB: 업체별 단가 조회 (company_products)
    DB-->>SA: custom_price / base_price 반환
    SA->>DB: INSERT quotations + quotation_items\n(unit_price 스냅샷 저장)
    SA->>PdfLib: generateQuotationBuffer(quotationData)
    Note right of PdfLib: unitPrice는 SA에서 결정 후 전달<br/>pdf-lib는 렌더링만 수행
    PdfLib-->>SA: PDF Buffer
    SA->>EmailLib: sendEmail(to: partner@company.com, pdf첨부)
    EmailLib-->>SA: 발송 완료 (Resend)
    SA-->>Admin: 견적서 발행 완료
    Admin-->>Manager: 견적번호 + PDF 다운로드 링크 표시

    Note over Partner1,DB: [협력사가 견적 확인 → 발주 생성]
    Partner1->>Portal: 이메일 수신 → /login
    Partner1->>Portal: /orders/new → 견적서 기반 발주
    Portal->>SA: createOrder(company_id, quotation_id, items[])
    SA->>DB: INSERT orders + order_items
    DB-->>SA: 완료
    SA-->>Portal: 발주 완료
    Portal-->>Partner1: 발주번호 확인 페이지
```

---

## 시나리오 4 — 역발행 발주 (협력사 주도)

> **3차 구현** | 앱: `apps/b2b-portal` | 패키지: `email-lib`

```mermaid
sequenceDiagram
    actor Partner2 as B2B 협력사 2
    actor Manager as 영업/B2B관리사원
    participant Portal as apps/b2b-portal
    participant Admin as apps/admin
    participant SA as Server Action
    participant DB as Supabase DB
    participant EmailLib as email-lib

    Note over Partner2,DB: [협력사 가입 신청]
    Partner2->>Portal: /register → 업체 정보 입력
    Portal->>SA: requestCompanyRegistration(name, contact)
    SA->>DB: INSERT companies (status:'pending')
    DB-->>SA: 완료
    SA->>EmailLib: 관리자에게 가입 승인 요청 알림 메일
    Portal-->>Partner2: 승인 대기 안내

    Manager->>Admin: /companies → pending 확인 → 승인

    Note over Partner2,DB: [협력사가 카탈로그에서 직접 발주 — 견적서 없음]
    Partner2->>Portal: /catalog 접속
    Portal->>SA: getCompanyCatalog(company_id)
    SA->>DB: SELECT company_products JOIN products\n(단가 결정 로직 적용)
    DB-->>SA: 업체별 노출 제품 + 단가
    SA-->>Portal: 카탈로그 렌더링
    Partner2->>Portal: 제품 선택 + 수량 입력
    Partner2->>Portal: /orders/new → 발주 제출
    Portal->>SA: createOrder(company_id, items[])
    SA->>DB: INSERT orders + order_items\n(단가 스냅샷 저장)
    SA->>EmailLib: 관리자에게 신규 발주 알림 메일
    DB-->>SA: 완료
    SA-->>Portal: 발주 완료
    Portal-->>Partner2: 발주 내역 확인 (/orders)

    Note over Partner2,DB: [협력사가 견적서를 역으로 요청]
    Partner2->>Portal: /quotation/new → 견적 요청
    Portal->>SA: requestQuotation(company_id, items[])
    SA->>DB: INSERT quotations (status:'draft')
    SA->>EmailLib: 관리자에게 견적 요청 알림
    Manager->>Admin: 견적 검토 → 단가 확정 → PDF 발행
```

---

## 시나리오 5 — 발주 확정 담당자: 주문 확정 & 재고 차감

> **4차 구현** | 앱: `apps/admin` | 패키지: `email-lib`, Supabase Edge Function

```mermaid
sequenceDiagram
    actor Manager as 발주확정 담당자
    participant Admin as apps/admin
    participant Edge as Supabase Edge Function
    participant DB as Supabase DB
    participant EmailLib as email-lib

    Manager->>Admin: /orders → pending 발주 목록 확인
    Manager->>Admin: 발주 선택 → 확정 버튼 클릭
    Admin->>Edge: confirmOrder(order_id)
    Note right of Edge: 복합 트랜잭션 처리<br/>(재고 차감 + CRM 기록 동시)
    Edge->>DB: UPDATE orders SET status='confirmed'
    Edge->>DB: UPDATE products.base_stock - qty (재고 차감)
    Edge->>DB: INSERT inventory_logs (type:'out')
    Edge->>DB: INSERT crm_logs (action:'order_confirmed')
    Edge->>DB: INSERT shipments (status:'pending')
    DB-->>Edge: 트랜잭션 완료
    Edge->>EmailLib: 협력사에 주문 확정 알림 메일
    EmailLib-->>Edge: 발송 완료
    Edge-->>Admin: 확정 완료
    Admin-->>Manager: 출고 지시 생성 알림
```

---

## 시나리오 6 — 물류담당직원: 출고 처리

> **4차 구현** | 앱: `apps/logistics` | 패키지: `barqr-lib`

```mermaid
sequenceDiagram
    actor Logistics as 물류담당직원
    participant App as apps/logistics
    participant SA as Server Action
    participant DB as Supabase DB
    participant Barqr as barqr-lib

    Logistics->>App: / (출고 지시 목록) 접속
    App->>SA: getPendingShipments()
    SA->>DB: SELECT shipments WHERE status='pending'
    DB-->>SA: 출고 지시 목록
    SA-->>App: 목록 렌더링
    Logistics->>App: 출고 건 선택 → /scan

    Note over Logistics,Barqr: [바코드 스캔으로 출고완료 처리]
    App->>Barqr: onScanInput(inputEl, callback)
    Logistics->>App: 제품 바코드 스캔
    Barqr-->>App: 스캔된 바코드 값
    App->>SA: processShipmentScan(shipment_id, barcode)
    SA->>DB: 바코드로 product 확인
    SA->>DB: UPDATE shipments SET status='completed'\nSET completed_at=now()
    SA->>DB: INSERT crm_logs (action:'shipment_completed')
    DB-->>SA: 완료
    SA-->>App: 출고완료
    App-->>Logistics: 완료 표시 (체크)

    Note over Logistics,Barqr: [출고 이력 확인]
    Logistics->>App: /history 접속
    App->>SA: getShipmentHistory()
    SA->>DB: SELECT shipments + order + company
    DB-->>SA: 이력 데이터
    SA-->>App: 출고 이력 표시
```

---

## 시나리오 7 — 전체 흐름 타임라인 (4차 완성 시)

```mermaid
timeline
    title ERP 전산망 전체 사용자 여정

    section 1차 (재고관리)
        재고관리사원 : 제품 등록
                     : 바코드 생성·라벨 출력
                     : BT 스캐너 입고 처리

    section 2차 (어드민·견적)
        영업관리사원 : 로그인 (Supabase Auth)
                    : 재고 현황표 관리
                    : 업체 승인·단가 설정
                    : 견적서 PDF 발행 (정발행)

    section 3차 (B2B 포털)
        B2B 협력사 1 : 포털 로그인
                    : 카탈로그 조회 (업체별 단가)
                    : 견적 수령 후 발주 생성 (정발행)
        B2B 협력사 2 : 가입 신청·승인
                    : 카탈로그 직접 발주 (역발행)
                    : 견적 역요청

    section 4차 (물류·CRM)
        발주확정 담당자 : 발주 확정
                      : 재고 차감 (Edge Function)
                      : 출고 지시 생성
        물류담당직원   : 출고 지시 확인
                      : 바코드 스캔 출고완료
                      : CRM 이력 자동 기록
```

---

## 패키지별 사용 흐름 요약

```mermaid
flowchart LR
    subgraph Packages["공유 패키지"]
        AUTH["auth-lib\nSupabase Auth + RLS\n세션·권한 관리"]
        BARQR["barqr-lib\nJsBarcode + qrcode\nBT 스캐너 입력 처리"]
        PDF["pdf-lib\n@react-pdf/renderer\n견적서 PDF 생성"]
        EMAIL["email-lib\nResend + react-email\n트랜잭션 메일 발송"]
    end

    subgraph Apps["앱"]
        ADMIN["apps/admin"]
        PORTAL["apps/b2b-portal"]
        LOGI["apps/logistics"]
    end

    AUTH --> ADMIN
    AUTH --> PORTAL
    BARQR --> ADMIN
    BARQR --> LOGI
    PDF --> ADMIN
    PDF --> PORTAL
    EMAIL --> ADMIN
    EMAIL --> PORTAL
```

---

## 핵심 제약 사항 요약

| 규칙 | 내용 |
|------|------|
| 단가 결정 | `pdf-lib`는 단가 계산 안 함. 항상 호출 측(Server Action)에서 결정 후 전달 |
| 보안 | `SUPABASE_SERVICE_ROLE_KEY` 및 `RESEND_API_KEY` 클라이언트 노출 금지 |
| 트랜잭션 | 재고 차감 + CRM 기록 복합 트랜잭션은 Supabase Edge Function에서 처리 (4차~) |
| RLS | 업체별 데이터 격리는 반드시 RLS 정책으로 처리 |
| 발주 확정 | 클라이언트에서 직접 재고 차감·발주 확정 처리 금지 |
