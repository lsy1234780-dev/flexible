-- 카테고리 (중첩 가능)
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 제품에 카테고리 연결
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_read_all" ON categories
  FOR SELECT USING (true);

CREATE POLICY "categories_admin_all" ON categories
  FOR ALL USING (true);
