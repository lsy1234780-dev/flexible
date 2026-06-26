-- ============================================
-- 048: 창고 관리 (WMS 기반)
-- ============================================

-- 1. 창고 테이블
CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  address text,
  total_area numeric,
  usable_area numeric,
  warehouse_type text DEFAULT 'general',
  manager_name text,
  manager_contact text,
  is_active boolean NOT NULL DEFAULT true,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_warehouses_is_active ON warehouses(is_active);

-- 2. 창고 로케이션 (자기참조 트리: zone → aisle → rack → level → bin)
CREATE TABLE warehouse_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES warehouse_locations(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('zone', 'aisle', 'rack', 'level', 'bin')),
  name text NOT NULL,
  code text NOT NULL,
  full_path text,
  depth integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

);

-- parent_id가 NULL일 때도 유니크 제약이 동작하도록 두 개의 unique index 사용
CREATE UNIQUE INDEX idx_wl_unique_with_parent
  ON warehouse_locations(warehouse_id, parent_id, code)
  WHERE parent_id IS NOT NULL;

CREATE UNIQUE INDEX idx_wl_unique_root
  ON warehouse_locations(warehouse_id, code)
  WHERE parent_id IS NULL;

CREATE INDEX idx_warehouse_locations_warehouse ON warehouse_locations(warehouse_id);
CREATE INDEX idx_warehouse_locations_parent ON warehouse_locations(parent_id);
CREATE INDEX idx_warehouse_locations_type ON warehouse_locations(type);

-- 3. 계층 순서 강제 트리거
--    parent가 없으면 zone만 허용
--    zone → aisle → rack → level → bin 순서 강제
CREATE OR REPLACE FUNCTION check_location_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
  parent_type text;
  expected_type text;
  expected_depth integer;
BEGIN
  IF NEW.parent_id IS NULL THEN
    IF NEW.type != 'zone' THEN
      RAISE EXCEPTION '최상위 로케이션은 zone이어야 합니다 (현재: %)', NEW.type;
    END IF;
    NEW.depth := 1;
  ELSE
    SELECT type INTO parent_type FROM warehouse_locations WHERE id = NEW.parent_id;
    IF parent_type IS NULL THEN
      RAISE EXCEPTION '부모 로케이션을 찾을 수 없습니다';
    END IF;

    expected_type := CASE parent_type
      WHEN 'zone' THEN 'aisle'
      WHEN 'aisle' THEN 'rack'
      WHEN 'rack' THEN 'level'
      WHEN 'level' THEN 'bin'
      ELSE NULL
    END;

    IF expected_type IS NULL THEN
      RAISE EXCEPTION 'bin 하위에는 로케이션을 추가할 수 없습니다';
    END IF;

    IF NEW.type != expected_type THEN
      RAISE EXCEPTION '% 하위에는 %만 추가할 수 있습니다 (현재: %)', parent_type, expected_type, NEW.type;
    END IF;

    SELECT depth + 1 INTO expected_depth FROM warehouse_locations WHERE id = NEW.parent_id;
    NEW.depth := expected_depth;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_location_hierarchy
  BEFORE INSERT OR UPDATE ON warehouse_locations
  FOR EACH ROW EXECUTE FUNCTION check_location_hierarchy();

-- 4. full_path 자동 생성 트리거
CREATE OR REPLACE FUNCTION update_location_full_path()
RETURNS TRIGGER AS $$
DECLARE
  parent_path text;
  wh_code text;
BEGIN
  SELECT code INTO wh_code FROM warehouses WHERE id = NEW.warehouse_id;

  IF NEW.parent_id IS NULL THEN
    NEW.full_path := wh_code || ' > ' || NEW.code;
  ELSE
    SELECT full_path INTO parent_path FROM warehouse_locations WHERE id = NEW.parent_id;
    NEW.full_path := parent_path || ' > ' || NEW.code;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_location_full_path
  BEFORE INSERT OR UPDATE ON warehouse_locations
  FOR EACH ROW EXECUTE FUNCTION update_location_full_path();

-- 5. inventory_items에 창고/로케이션 FK 추가
ALTER TABLE inventory_items
  ADD COLUMN warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL,
  ADD COLUMN location_id uuid REFERENCES warehouse_locations(id) ON DELETE SET NULL;

CREATE INDEX idx_inventory_items_warehouse ON inventory_items(warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX idx_inventory_items_location_id ON inventory_items(location_id) WHERE location_id IS NOT NULL;

-- 6. RLS
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouses_all" ON warehouses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "warehouse_locations_all" ON warehouse_locations FOR ALL USING (true) WITH CHECK (true);
