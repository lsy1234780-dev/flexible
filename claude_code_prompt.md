# Claude Code Project Prompt
## Lightweight Modular ERP SaaS Platform for Korean SMBs

---

## Project Overview

Build a **web-based modular ERP SaaS platform** targeting small-to-medium manufacturers, wholesalers/distributors, and e-commerce businesses in Korea.

### Core Concept

Most Korean SMBs manage their business with Google Sheets or Excel. They can't afford expensive ERP systems (Douzone, Youngrim), and cheap options (eCount) offer zero customization. Odoo is powerful but far too complex — it requires months of setup and expensive implementation partners.

**We sit in the gap: simple enough to use in 10 minutes, customizable enough to feel like theirs.**

- Pre-built modular ERP — customers pick what they need, use it immediately
- No implementation partner needed. Sign up → configure → done.
- Tiered pricing: basic plan = standard modules / higher plans = customization features
- Every customer shares one backend, isolated by Row Level Security (RLS)
- Subdomain per company for a "dedicated system" feel (`company-a.service.com`)

### Why We're Not Odoo

| | Odoo | Us |
|---|---|---|
| Setup time | Months | 10 minutes |
| Target | Mid-market | SMB / micro-business |
| Complexity | Hundreds of modules | Under 10 focused modules |
| Korea-specific | Incomplete | Native (KRW, tax invoice, Korean UX) |
| Customization | Code-level | Plan-based settings UI |
| Pricing | Per user + modules | Flat monthly subscription |

### Moat

1. **Simplicity** — we never sacrifice ease-of-use for power. That's the opposite of Odoo's business model.
2. **Korea-native** — KRW formatting, Korean tax invoice (세금계산서) integration, Korean business conventions (외상, 어음), full Korean UI.

---

## Pricing Model

| Plan | Price (KRW/month) | Features |
|---|---|---|
| Basic | ₩90,000 | Core modules, standard field names, up to 5 users |
| Standard | ₩190,000 | Custom field labels, module on/off toggle, up to 15 users |
| Premium | ₩390,000 | Custom workflows, priority onboarding, unlimited users |

Customization is **configuration-based, not code-based**:
- Field label renaming → stored in `company_settings` table
- Module visibility → feature flags per plan
- Workflow order → settings UI, no custom code per customer

## Industry Templates

When a company signs up, they select their industry. This auto-applies a
preset configuration — modules, field labels, and workflow defaults —
so the product feels purpose-built from day one.

### Supported Industries (at launch)

**Manufacturing (제조업)**
- Modules enabled: partners, products, orders, stock, transactions
- Extra modules: BOM (bill of materials), production orders, process tracking
- Field label defaults: 거래처→납품처, 수주→생산지시, 품목→원자재/완제품

**Wholesale & Distribution (도매/총판)**
- Modules enabled: partners, products, orders, stock, transactions
- Extra modules: channel inventory, margin calculator, delivery management
- Field label defaults: 거래처→납품처, 발주→매입발주, 수주→판매수주

**E-commerce (전자상거래)**
- Modules enabled: partners, products, orders, stock, transactions
- Extra modules: multi-channel order sync, returns/exchanges, channel settlement
- Field label defaults: 거래처→판매채널, 수주→주문, 품목→상품

### How It Works

- Industry selection happens at signup (step 2 of onboarding)
- Selection writes a preset config object into `companies.settings` JSONB
- All presets are editable post-signup (Standard plan and above)
- Adding new industry templates requires no code change — only a new
  settings preset object

---

## Architecture

### System Overview

```
[Landing Page] https://service-domain.com
      ↓ sign up / login
[Supabase Auth]
      ↓ identify company_id from profiles table
[Next.js Middleware] → parse subdomain → inject company_id into headers
      ↓
company-a.service-domain.com  ←──┐
company-b.service-domain.com  ←──┤ Same Next.js app + same Supabase
company-c.service-domain.com  ←──┘ RLS enforces data isolation
      ↓
[Supabase — PostgreSQL + RLS]
  Single project, all customers, zero cross-contamination
```

### Multi-Tenancy Strategy

- **Single Supabase project** for all customers — no per-customer projects
- **Row Level Security (RLS)** enforces company-level data isolation at the DB layer
- Every table has a `company_id UUID` column — this is the tenancy key
- Subdomain routing is UX separation; RLS is data separation — both needed, both simple
- Schema changes and bug fixes deploy once, apply to all customers instantly

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Subdomain middleware, SSR, API routes in one |
| Language | TypeScript (strict) | Type safety across full stack |
| UI | Tailwind CSS + shadcn/ui | Fast, clean, consistent |
| Backend | Next.js API Routes | Serverless, co-located with frontend |
| Database | Supabase (PostgreSQL) | RLS, Auth, realtime, generous free tier |
| Auth | Supabase Auth | JWT with company_id claim |
| Deployment | Vercel | Subdomain wildcard support, zero-config |

---

## Database Schema

### Design Principles

- Every table has `company_id UUID NOT NULL` — no exceptions
- RLS policy on every table: `company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())`
- Soft delete via `deleted_at TIMESTAMPTZ` — never hard delete business data
- Snapshot critical fields at transaction time (e.g. `product_name` on order items)
- Korean currency: `NUMERIC(15,2)` for all monetary values

### Schema

```sql
-- Companies (one row per customer)
CREATE TABLE companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,         -- subdomain identifier e.g. "acme-korea"
  plan        TEXT NOT NULL DEFAULT 'basic', -- basic / standard / premium
  settings    JSONB DEFAULT '{}',           -- field label overrides, module toggles
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- User profiles (linked to Supabase auth.users)
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT,
  role        TEXT NOT NULL DEFAULT 'member', -- owner / admin / member
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Partners (customers & suppliers)
CREATE TABLE partners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  name          TEXT NOT NULL,
  type          TEXT NOT NULL, -- supplier / customer / both
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address       TEXT,
  business_reg_no TEXT,        -- 사업자등록번호
  memo          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- Products / SKUs
CREATE TABLE products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  name              TEXT NOT NULL,
  sku               TEXT,
  category          TEXT,
  unit              TEXT DEFAULT '개',
  purchase_price    NUMERIC(15,2) DEFAULT 0,
  sale_price        NUMERIC(15,2) DEFAULT 0,
  stock_quantity    NUMERIC(15,2) DEFAULT 0,
  stock_alert_qty   NUMERIC(15,2) DEFAULT 0,  -- low stock threshold
  memo              TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- Orders (purchase orders & sales orders)
CREATE TABLE orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  order_type    TEXT NOT NULL,               -- purchase / sale
  order_number  TEXT NOT NULL,               -- auto-generated e.g. PO-20240101-001
  partner_id    UUID REFERENCES partners(id),
  status        TEXT NOT NULL DEFAULT 'draft', -- draft / confirmed / shipped / completed / cancelled
  order_date    DATE DEFAULT CURRENT_DATE,
  expected_date DATE,
  total_amount  NUMERIC(15,2) DEFAULT 0,
  memo          TEXT,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- Order line items
CREATE TABLE order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id),
  product_name  TEXT NOT NULL,               -- snapshot at order time
  quantity      NUMERIC(15,2) NOT NULL DEFAULT 0,
  unit_price    NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_price   NUMERIC(15,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  memo          TEXT
);

-- Stock movement log
CREATE TABLE stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  movement_type   TEXT NOT NULL,   -- in / out / adjust
  quantity        NUMERIC(15,2) NOT NULL,
  before_quantity NUMERIC(15,2),
  after_quantity  NUMERIC(15,2),
  reference_type  TEXT,            -- order / manual
  reference_id    UUID,
  memo            TEXT,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions (receivables & payables)
CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  transaction_type  TEXT NOT NULL,              -- income / expense
  partner_id        UUID REFERENCES partners(id),
  order_id          UUID REFERENCES orders(id),
  amount            NUMERIC(15,2) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'unpaid', -- unpaid / partial / paid
  transaction_date  DATE DEFAULT CURRENT_DATE,
  due_date          DATE,
  memo              TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
```

### RLS Policy Pattern (apply to every table)

```sql
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON partners
  USING (
    company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );
```

---

## Feature Flags (Plan-based)

Store in `companies.settings` JSONB:

```json
{
  "modules": {
    "partners": true,
    "products": true,
    "orders": true,
    "transactions": true,
    "reports": false
  },
  "customization": {
    "field_labels": {
      "partners.name": "거래처명",
      "products.sku": "품목코드"
    }
  }
}
```

Check plan before rendering features:

```typescript
// lib/plan.ts
export const PLAN_FEATURES = {
  basic: {
    custom_field_labels: false,
    module_toggle: false,
    custom_workflow: false,
    max_users: 5,
  },
  standard: {
    custom_field_labels: true,
    module_toggle: true,
    custom_workflow: false,
    max_users: 15,
  },
  premium: {
    custom_field_labels: true,
    module_toggle: true,
    custom_workflow: true,
    max_users: Infinity,
  },
}
```

---

## Page Structure

### Landing Domain (`service-domain.com`)
- `/` — Landing page (value prop, pricing, CTA)
- `/login` — Login
- `/signup` — Sign up (creates company + owner profile)

### Company Dashboard (`[slug].service-domain.com`)
- `/dashboard` — KPI summary (revenue, receivables, low stock alerts, recent orders)
- `/partners` — Partner management (list, create, edit, detail + transaction history)
- `/products` — Product & inventory management (list, create, edit, stock adjustment)
- `/orders` — Order management (purchase & sales, status pipeline)
- `/transactions` — Receivables & payables
- `/settings` — Company settings, user management, plan & billing, field label customization (Standard+)

---

## Middleware Logic

```typescript
// middleware.ts — subdomain routing
// 1. Parse hostname → extract subdomain
// 2. If subdomain exists → rewrite to /dashboard routes, inject company slug in header
// 3. If no subdomain → serve landing routes
// 4. Check Supabase session → redirect to /login if unauthenticated
// 5. Validate company slug matches authenticated user's company
```

---

## Directory Structure

```
/
├── app/
│   ├── (landing)/
│   │   ├── page.tsx
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx
│   │   ├── partners/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── products/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── orders/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── transactions/page.tsx
│   │   └── settings/page.tsx
│   └── api/
│       ├── partners/route.ts
│       ├── products/route.ts
│       ├── orders/route.ts
│       ├── stock/route.ts
│       └── transactions/route.ts
├── components/
│   ├── ui/              # shadcn components
│   ├── layout/          # Sidebar, Header, Shell
│   └── modules/         # Feature-specific components
├── lib/
│   ├── supabase/
│   │   ├── client.ts    # browser client
│   │   ├── server.ts    # server client
│   │   └── admin.ts     # service role client
│   ├── plan.ts          # feature flag helpers
│   ├── format.ts        # KRW formatting, date formatting
│   └── types.ts         # shared TypeScript types
├── middleware.ts
└── supabase/
    └── migrations/      # all SQL migration files
```

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_ROOT_DOMAIN=service-domain.com
```

---

## Development Phases

### Phase 1 — MVP (build this first)
1. Supabase project setup + full schema migration + RLS on all tables
2. Auth flow: sign up (with company creation) → login → logout
3. Subdomain middleware routing
4. Partners CRUD
5. Products CRUD + manual stock adjustment
6. Orders: create, list, status transitions, auto stock movement on confirm
7. Dashboard KPIs: monthly revenue, unpaid receivables, low stock count, recent orders

### Phase 2
8. Transactions: auto-create on order completion, mark as paid
9. Stock movement history log view
10. Monthly revenue chart (recharts)
11. User invite + role management
12. Settings: field label customization (Standard plan gate)

### Phase 3
13. Excel import/export
14. Low stock email alerts
15. Mobile optimization
16. Tax invoice integration (홈택스 연동)

---

## Coding Standards

- TypeScript strict mode — no `any`
- RLS must be enabled on every single table — no exceptions
- All API responses: `{ data: T | null, error: string | null }`
- All monetary values rendered with KRW format: `₩1,234,000`
- All dates: `YYYY-MM-DD` (Korean convention)
- Soft delete everywhere — never `DELETE FROM` on business data
- No `console.log` left in committed code
- All UI text in Korean
- Comments in English
- Complete Phase 1 fully before starting Phase 2. Confirm with user after each phase.
