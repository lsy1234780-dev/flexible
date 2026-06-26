-- ============================================
-- 3차: 발주 (B2B 포털 연동)
-- ============================================

CREATE TABLE IF NOT EXISTS orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id),
  status       text NOT NULL CHECK (status IN ('pending', 'confirmed', 'shipped', 'completed')) DEFAULT 'pending',
  confirmed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity   integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_company ON orders(company_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- 어드민: 전체 접근
CREATE POLICY "어드민 orders 전체 접근" ON orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "어드민 order_items 전체 접근" ON order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
