


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."cancel_order_with_stock_restore"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- confirmed 상태에서 취소 시 재고 복원
  IF v_status = 'confirmed' THEN
    UPDATE products p
       SET base_stock = p.base_stock + oi.quantity
      FROM order_items oi
     WHERE oi.order_id = p_order_id
       AND oi.product_id = p.id;
  END IF;

  -- pending 또는 confirmed만 취소 가능
  IF v_status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'INVALID_STATUS:현재 상태(%)에서는 취소할 수 없습니다', v_status;
  END IF;

  UPDATE orders SET status = 'cancelled' WHERE id = p_order_id;
END;
$$;


ALTER FUNCTION "public"."cancel_order_with_stock_restore"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_location_hierarchy"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."check_location_hierarchy"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_order_with_stock_deduction"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_status   text;
  v_item     record;
  v_stock    integer;
  v_prod_name text;
BEGIN
  -- 주문 상태 확인
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'INVALID_STATUS:현재 상태(%)에서는 확정할 수 없습니다', v_status;
  END IF;

  -- 각 품목 재고 확인 및 차감
  FOR v_item IN
    SELECT oi.product_id, oi.quantity
      FROM order_items oi
     WHERE oi.order_id = p_order_id
  LOOP
    SELECT base_stock, name
      INTO v_stock, v_prod_name
      FROM products
     WHERE id = v_item.product_id
       FOR UPDATE;

    IF v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'STOCK_ERROR:% (가용 %개, 요청 %개)',
        v_prod_name, v_stock, v_item.quantity;
    END IF;

    UPDATE products
       SET base_stock = base_stock - v_item.quantity
     WHERE id = v_item.product_id;
  END LOOP;

  -- 상태 업데이트
  UPDATE orders
     SET status = 'confirmed', confirmed_at = now()
   WHERE id = p_order_id;
END;
$$;


ALTER FUNCTION "public"."confirm_order_with_stock_deduction"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order_with_stock_deduction"("p_company_id" "uuid", "p_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_order_id uuid;
  v_item     jsonb;
  v_stock    integer;
  v_prod_name text;
BEGIN
  -- 재고 '확인만' (차감 안 함) — 차감은 확정 시 수행
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT base_stock, name
      INTO v_stock, v_prod_name
      FROM products
     WHERE id = (v_item->>'product_id')::uuid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND:%', v_item->>'product_id';
    END IF;

    IF v_stock < (v_item->>'quantity')::integer THEN
      RAISE EXCEPTION 'STOCK_ERROR:%:% (가용 %개)',
        v_prod_name, v_item->>'product_id', v_stock;
    END IF;
  END LOOP;

  -- 발주 생성 (재고 차감 없이)
  INSERT INTO orders (company_id, status)
  VALUES (p_company_id, 'pending')
  RETURNING id INTO v_order_id;

  INSERT INTO order_items (order_id, product_id, quantity, unit_price)
  SELECT v_order_id,
         (item->>'product_id')::uuid,
         (item->>'quantity')::integer,
         (item->>'unit_price')::numeric
    FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object('order_id', v_order_id);
END;
$$;


ALTER FUNCTION "public"."create_order_with_stock_deduction"("p_company_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order_with_stock_deduction"("p_company_id" "uuid", "p_items" "jsonb", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_order_id uuid;
  v_item     jsonb;
  v_stock    integer;
  v_prod_name text;
BEGIN
  -- 재고 확인 (차감은 확정 시 수행)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT base_stock, name
      INTO v_stock, v_prod_name
      FROM products
     WHERE id = (v_item->>'product_id')::uuid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND:%', v_item->>'product_id';
    END IF;

    IF v_stock < (v_item->>'quantity')::integer THEN
      RAISE EXCEPTION 'STOCK_ERROR:%:% (가용 %개)',
        v_prod_name, v_item->>'product_id', v_stock;
    END IF;
  END LOOP;

  -- 발주 생성
  INSERT INTO orders (company_id, status, notes)
  VALUES (p_company_id, 'pending', p_notes)
  RETURNING id INTO v_order_id;

  INSERT INTO order_items (order_id, product_id, quantity, unit_price)
  SELECT v_order_id,
         (item->>'product_id')::uuid,
         (item->>'quantity')::integer,
         (item->>'unit_price')::numeric
    FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object('order_id', v_order_id);
END;
$$;


ALTER FUNCTION "public"."create_order_with_stock_deduction"("p_company_id" "uuid", "p_items" "jsonb", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_inventory_items"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid" DEFAULT NULL::"uuid", "p_lot_id" "uuid" DEFAULT NULL::"uuid", "p_generate_unit_barcode" boolean DEFAULT true) RETURNS TABLE("item_id" "uuid", "unit_barcode" "text", "serial_number" integer)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_base_barcode text;
  v_serial_mode text;
  v_next_serial integer;
  v_i integer;
  v_unit_barcode text;
  v_item_id uuid;
BEGIN
  -- 제품 바코드 및 serial_mode 조회
  SELECT barcode, serial_mode INTO v_base_barcode, v_serial_mode
  FROM products WHERE id = p_product_id;

  IF v_base_barcode IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND: 제품을 찾을 수 없습니다';
  END IF;

  -- serial_mode='none': serial_number 없이 생성
  IF v_serial_mode = 'none' THEN
    FOR v_i IN 1..p_quantity LOOP
      v_item_id := gen_random_uuid();

      INSERT INTO inventory_items (id, product_id, serial_number, unit_barcode, receiving_item_id, lot_id, status)
      VALUES (v_item_id, p_product_id, NULL, NULL, p_receiving_item_id, p_lot_id, 'in_stock');

      item_id := v_item_id;
      unit_barcode := NULL;
      serial_number := NULL;
      RETURN NEXT;
    END LOOP;
    RETURN;
  END IF;

  -- pool/strict: 기존 로직 (serial_number 자동 채번)
  SELECT COALESCE(MAX(sub.serial_number), 0)
  INTO v_next_serial
  FROM (
    SELECT ii.serial_number
    FROM inventory_items ii
    WHERE ii.product_id = p_product_id
      AND ii.serial_number IS NOT NULL
    FOR UPDATE
  ) sub;

  FOR v_i IN 1..p_quantity LOOP
    v_next_serial := v_next_serial + 1;

    IF p_generate_unit_barcode THEN
      v_unit_barcode := v_base_barcode || '-' || LPAD(v_next_serial::text, 4, '0');
    ELSE
      v_unit_barcode := NULL;
    END IF;

    v_item_id := gen_random_uuid();

    INSERT INTO inventory_items (id, product_id, serial_number, unit_barcode, receiving_item_id, lot_id, status)
    VALUES (v_item_id, p_product_id, v_next_serial, v_unit_barcode, p_receiving_item_id, p_lot_id, 'in_stock');

    item_id := v_item_id;
    unit_barcode := v_unit_barcode;
    serial_number := v_next_serial;
    RETURN NEXT;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."generate_inventory_items"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid", "p_lot_id" "uuid", "p_generate_unit_barcode" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_order_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_date text;
  v_seq  integer;
BEGIN
  IF NEW.order_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_date := to_char(now(), 'YYMMDD');

  SELECT count(*) + 1 INTO v_seq
  FROM orders
  WHERE order_number LIKE 'ORD-' || v_date || '-%';

  NEW.order_number := 'ORD-' || v_date || '-' || lpad(v_seq::text, 3, '0');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_order_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_product_serials"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid") RETURNS TABLE("serial_id" "uuid", "serial_barcode" "text", "serial_number" integer)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_base_barcode text;
  v_next_serial integer;
  v_i integer;
  v_serial_barcode text;
  v_serial_id uuid;
BEGIN
  -- 제품 바코드 조회
  SELECT barcode INTO v_base_barcode
  FROM products WHERE id = p_product_id;

  IF v_base_barcode IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND: 제품을 찾을 수 없습니다';
  END IF;

  -- 현재 최대 일련번호 조회 (서브쿼리로 FOR UPDATE 동시성 제어)
  SELECT COALESCE(MAX(sub.serial_number), 0)
  INTO v_next_serial
  FROM (
    SELECT ps.serial_number
    FROM product_serials ps
    WHERE ps.product_id = p_product_id
    FOR UPDATE
  ) sub;

  -- 수량만큼 시리얼 생성
  FOR v_i IN 1..p_quantity LOOP
    v_next_serial := v_next_serial + 1;
    v_serial_barcode := v_base_barcode || '-' || LPAD(v_next_serial::text, 4, '0');
    v_serial_id := gen_random_uuid();

    INSERT INTO product_serials (id, product_id, serial_number, serial_barcode, receiving_item_id, status)
    VALUES (v_serial_id, p_product_id, v_next_serial, v_serial_barcode, p_receiving_item_id, 'in_stock');

    serial_id := v_serial_id;
    serial_barcode := v_serial_barcode;
    serial_number := v_next_serial;
    RETURN NEXT;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."generate_product_serials"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_product_serials"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid" DEFAULT NULL::"uuid", "p_lot_id" "uuid" DEFAULT NULL::"uuid", "p_generate_unit_barcode" boolean DEFAULT true) RETURNS TABLE("serial_id" "uuid", "unit_barcode" "text", "serial_number" integer)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT gi.item_id AS serial_id, gi.unit_barcode, gi.serial_number
  FROM generate_inventory_items(p_product_id, p_quantity, p_receiving_item_id, p_lot_id, p_generate_unit_barcode) gi;
END;
$$;


ALTER FUNCTION "public"."generate_product_serials"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid", "p_lot_id" "uuid", "p_generate_unit_barcode" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_order_stock"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE products p
     SET base_stock = p.base_stock + oi.quantity
    FROM order_items oi
   WHERE oi.order_id = p_order_id
     AND oi.product_id = p.id;
END;
$$;


ALTER FUNCTION "public"."restore_order_stock"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_as_requests_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_as_requests_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_location_full_path"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."update_location_full_path"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."access_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."access_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."as_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "as_request_id" "uuid",
    "status" "text" NOT NULL,
    "content" "text",
    "created_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."as_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."as_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "number" "text" NOT NULL,
    "company_id" "uuid",
    "customer_name" "text",
    "customer_phone" "text",
    "product_name" "text" NOT NULL,
    "product_id" "uuid",
    "serial_number" "text",
    "symptom" "text" NOT NULL,
    "defective_parts" "text"[] DEFAULT '{}'::"text"[],
    "repair_content" "text",
    "status" "text" DEFAULT 'received'::"text",
    "assigned_to" "text",
    "estimated_completion_at" "date",
    "completed_at" timestamp with time zone,
    "repair_cost" numeric,
    "memo" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "inspection_content" "text",
    CONSTRAINT "as_requests_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'inspecting'::"text", 'repairing'::"text", 'completed'::"text", 'returned'::"text"])))
);


ALTER TABLE "public"."as_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "parent_id" "uuid",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auth_user_id" "uuid",
    "contact_name" "text",
    "contact_phone" "text",
    "contact_email" "text",
    "contact_position" "text",
    "is_supplier" boolean DEFAULT false NOT NULL,
    "is_customer" boolean DEFAULT false NOT NULL,
    "country" "text",
    CONSTRAINT "companies_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


COMMENT ON COLUMN "public"."companies"."auth_user_id" IS 'B2B 포털 로그인 계정 (auth.users.id)';



CREATE TABLE IF NOT EXISTS "public"."company_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "custom_price" numeric,
    "visible_stock" integer,
    "is_visible" boolean DEFAULT true NOT NULL,
    "stock_ratio" integer,
    "max_visible_stock" integer,
    CONSTRAINT "company_products_custom_price_check" CHECK (("custom_price" >= (0)::numeric)),
    CONSTRAINT "company_products_max_visible_stock_check" CHECK (("max_visible_stock" >= 0)),
    CONSTRAINT "company_products_stock_ratio_check" CHECK ((("stock_ratio" >= 1) AND ("stock_ratio" <= 100)))
);


ALTER TABLE "public"."company_products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."company_products"."stock_ratio" IS '전체 재고 대비 노출 비율 (1~100%). null이면 미적용';



COMMENT ON COLUMN "public"."company_products"."max_visible_stock" IS '노출 재고 최대 상한. null이면 무제한';



CREATE TABLE IF NOT EXISTS "public"."crm_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "action" "text" NOT NULL,
    "memo" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."crm_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inbound_shipment_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shipment_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "from_stage" "text",
    "to_stage" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inbound_shipment_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inbound_shipment_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shipment_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "unit_cost" numeric,
    "memo" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inbound_shipment_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inbound_shipments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "stage" "text" DEFAULT 'ordered'::"text" NOT NULL,
    "bl_number" "text",
    "container_number" "text",
    "origin_country" "text",
    "carrier" "text",
    "tracking_number" "text",
    "estimated_arrival" "date",
    "actual_arrival" "date",
    "receiving_order_id" "uuid",
    "memo" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "purchase_order_id" "uuid",
    "shipping_type" "text",
    "customs_status" "text" DEFAULT 'pending'::"text",
    "customs_amount" numeric,
    "customs_cleared_at" "date",
    "vehicle_number" "text"
);


ALTER TABLE "public"."inbound_shipments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "serial_number" integer,
    "unit_barcode" "text",
    "receiving_item_id" "uuid",
    "status" "text" DEFAULT 'in_stock'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "receiving_staging_id" "uuid",
    "lot_id" "uuid",
    "manufacturer_serial" "text",
    "location" "text",
    "warehouse_id" "uuid",
    "location_id" "uuid",
    CONSTRAINT "inventory_items_status_check" CHECK (("status" = ANY (ARRAY['receiving'::"text", 'in_stock'::"text", 'reserved'::"text", 'shipped'::"text", 'sold'::"text", 'disposed'::"text"])))
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "type" "text" NOT NULL,
    "scanned_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "memo" "text",
    CONSTRAINT "inventory_logs_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "inventory_logs_type_check" CHECK (("type" = ANY (ARRAY['in'::"text", 'out'::"text"])))
);


ALTER TABLE "public"."inventory_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventory_item_id" "uuid",
    "product_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text",
    "from_location" "text",
    "to_location" "text",
    "quantity" integer DEFAULT 1 NOT NULL,
    "reason" "text",
    "memo" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_access_rules" (
    "menu_href" "text" NOT NULL,
    "allowed_departments" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "allowed_positions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."menu_access_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "unit_price" numeric NOT NULL,
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "order_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "order_number" "text",
    "notes" "text",
    "confirmed_by" "text",
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'shipped'::"text", 'packed'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."positions" (
    "id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "level" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_lots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "lot_number" "text" NOT NULL,
    "manufactured_at" "date" NOT NULL,
    "received_at" "date",
    "quantity" integer DEFAULT 0 NOT NULL,
    "memo" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_lots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "barcode" "text" NOT NULL,
    "base_price" numeric NOT NULL,
    "base_stock" integer DEFAULT 0 NOT NULL,
    "is_visible_default" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "width_cm" numeric,
    "height_cm" numeric,
    "depth_cm" numeric,
    "weight_kg" numeric,
    "image_url" "text",
    "description" "text",
    "category_id" "uuid",
    "is_temporary" boolean DEFAULT false NOT NULL,
    "serial_mode" "text" DEFAULT 'pool'::"text" NOT NULL,
    CONSTRAINT "products_base_price_check" CHECK (("base_price" >= (0)::numeric)),
    CONSTRAINT "products_base_stock_check" CHECK (("base_stock" >= 0)),
    CONSTRAINT "products_serial_mode_check" CHECK (("serial_mode" = ANY (ARRAY['none'::"text", 'pool'::"text", 'strict'::"text"])))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "unit_cost" numeric,
    "memo" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'KRW'::"text",
    "method" "text",
    "paid_at" "date" NOT NULL,
    "label" "text",
    "memo" "text",
    "attachment_url" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."purchase_order_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "po_number" "text",
    "title" "text" NOT NULL,
    "supplier" "text",
    "supplier_contact" "text",
    "total_amount" numeric,
    "currency" "text" DEFAULT 'KRW'::"text",
    "exchange_rate" numeric,
    "vat_amount" numeric,
    "payment_status" "text" DEFAULT 'unpaid'::"text",
    "memo" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "supplier_id" "uuid"
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotation_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "quantity" integer NOT NULL,
    "unit_price" numeric NOT NULL,
    "label" "text",
    "is_taxable" boolean DEFAULT true NOT NULL,
    CONSTRAINT "quotation_items_has_identity" CHECK ((("product_id" IS NOT NULL) OR ("label" IS NOT NULL))),
    CONSTRAINT "quotation_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."quotation_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "number" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "order_id" "uuid",
    "issued_by" "text",
    CONSTRAINT "quotations_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'confirmed'::"text"])))
);


ALTER TABLE "public"."quotations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receiving_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "receiving_order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "expected_quantity" integer DEFAULT 0 NOT NULL,
    "received_quantity" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."receiving_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receiving_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid",
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "memo" "text",
    "received_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "title" "text",
    "created_by" "uuid",
    "confirmed_at" timestamp with time zone,
    CONSTRAINT "receiving_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'awaiting_confirmation'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."receiving_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receiving_staging" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "scanned_barcode" "text" NOT NULL,
    "memo" "text",
    "matched_receiving_item_id" "uuid",
    "matched_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."receiving_staging" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "allowed_menus" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."role_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipment_serials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shipment_id" "uuid" NOT NULL,
    "inventory_item_id" "uuid",
    "product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "assigned_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shipment_serials_assigned_by_check" CHECK (("assigned_by" = ANY (ARRAY['admin'::"text", 'logistics'::"text", 'auto'::"text"])))
);


ALTER TABLE "public"."shipment_serials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "shipped_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "packed_at" timestamp with time zone,
    "notified_at" timestamp with time zone,
    "serial_level" "text" DEFAULT 'L0'::"text" NOT NULL,
    "memo" "text",
    "serial_source" "text",
    CONSTRAINT "shipments_serial_level_check" CHECK (("serial_level" = ANY (ARRAY['L0'::"text", 'L1'::"text", 'L2'::"text", 'L3'::"text"]))),
    CONSTRAINT "shipments_serial_source_check" CHECK (("serial_source" = ANY (ARRAY['admin'::"text", 'logistics'::"text"]))),
    CONSTRAINT "shipments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'packed'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."shipments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."shipments"."serial_source" IS 'DEPRECATED: L0~L3 레벨이 역할을 포함. 향후 제거 예정.';



CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_role_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_group_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_role_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouse_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "full_path" "text",
    "depth" integer DEFAULT 1 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "warehouse_locations_type_check" CHECK (("type" = ANY (ARRAY['zone'::"text", 'aisle'::"text", 'rack'::"text", 'level'::"text", 'bin'::"text"])))
);


ALTER TABLE "public"."warehouse_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "address" "text",
    "total_area" numeric,
    "usable_area" numeric,
    "warehouse_type" "text" DEFAULT 'general'::"text",
    "manager_name" "text",
    "manager_contact" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "memo" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."warehouses" OWNER TO "postgres";


ALTER TABLE ONLY "public"."access_logs"
    ADD CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."as_logs"
    ADD CONSTRAINT "as_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."as_requests"
    ADD CONSTRAINT "as_requests_number_key" UNIQUE ("number");



ALTER TABLE ONLY "public"."as_requests"
    ADD CONSTRAINT "as_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_products"
    ADD CONSTRAINT "company_products_company_id_product_id_key" UNIQUE ("company_id", "product_id");



ALTER TABLE ONLY "public"."company_products"
    ADD CONSTRAINT "company_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_logs"
    ADD CONSTRAINT "crm_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inbound_shipment_events"
    ADD CONSTRAINT "inbound_shipment_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inbound_shipment_items"
    ADD CONSTRAINT "inbound_shipment_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inbound_shipments"
    ADD CONSTRAINT "inbound_shipments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_access_rules"
    ADD CONSTRAINT "menu_access_rules_pkey" PRIMARY KEY ("menu_href");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_lots"
    ADD CONSTRAINT "product_lots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "product_serials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_barcode_key" UNIQUE ("barcode");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_payments"
    ADD CONSTRAINT "purchase_order_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_number_key" UNIQUE ("number");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receiving_items"
    ADD CONSTRAINT "receiving_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receiving_items"
    ADD CONSTRAINT "receiving_items_receiving_order_id_product_id_key" UNIQUE ("receiving_order_id", "product_id");



ALTER TABLE ONLY "public"."receiving_orders"
    ADD CONSTRAINT "receiving_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receiving_staging"
    ADD CONSTRAINT "receiving_staging_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_groups"
    ADD CONSTRAINT "role_groups_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."role_groups"
    ADD CONSTRAINT "role_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipment_serials"
    ADD CONSTRAINT "shipment_serials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."user_role_groups"
    ADD CONSTRAINT "user_role_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_role_groups"
    ADD CONSTRAINT "user_role_groups_user_id_role_group_id_key" UNIQUE ("user_id", "role_group_id");



ALTER TABLE ONLY "public"."warehouse_locations"
    ADD CONSTRAINT "warehouse_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouse_locations"
    ADD CONSTRAINT "warehouse_locations_warehouse_id_parent_id_code_key" UNIQUE ("warehouse_id", "parent_id", "code");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "companies_auth_user_id_idx" ON "public"."companies" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE INDEX "idx_companies_country" ON "public"."companies" USING "btree" ("country") WHERE ("country" IS NOT NULL);



CREATE INDEX "idx_companies_is_customer" ON "public"."companies" USING "btree" ("is_customer") WHERE ("is_customer" = true);



CREATE INDEX "idx_companies_is_supplier" ON "public"."companies" USING "btree" ("is_supplier") WHERE ("is_supplier" = true);



CREATE INDEX "idx_company_products_company" ON "public"."company_products" USING "btree" ("company_id");



CREATE INDEX "idx_inbound_shipment_events_shipment" ON "public"."inbound_shipment_events" USING "btree" ("shipment_id");



CREATE INDEX "idx_inbound_shipment_items_shipment" ON "public"."inbound_shipment_items" USING "btree" ("shipment_id");



CREATE INDEX "idx_inbound_shipments_created" ON "public"."inbound_shipments" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_inbound_shipments_po" ON "public"."inbound_shipments" USING "btree" ("purchase_order_id");



CREATE INDEX "idx_inbound_shipments_stage" ON "public"."inbound_shipments" USING "btree" ("stage");



CREATE INDEX "idx_inventory_items_barcode" ON "public"."inventory_items" USING "btree" ("unit_barcode");



CREATE INDEX "idx_inventory_items_location" ON "public"."inventory_items" USING "btree" ("location") WHERE ("location" IS NOT NULL);



CREATE INDEX "idx_inventory_items_location_id" ON "public"."inventory_items" USING "btree" ("location_id") WHERE ("location_id" IS NOT NULL);



CREATE INDEX "idx_inventory_items_lot" ON "public"."inventory_items" USING "btree" ("lot_id");



CREATE INDEX "idx_inventory_items_manufacturer" ON "public"."inventory_items" USING "btree" ("manufacturer_serial") WHERE ("manufacturer_serial" IS NOT NULL);



CREATE INDEX "idx_inventory_items_product" ON "public"."inventory_items" USING "btree" ("product_id");



CREATE INDEX "idx_inventory_items_staging" ON "public"."inventory_items" USING "btree" ("receiving_staging_id");



CREATE INDEX "idx_inventory_items_status" ON "public"."inventory_items" USING "btree" ("status");



CREATE INDEX "idx_inventory_items_warehouse" ON "public"."inventory_items" USING "btree" ("warehouse_id") WHERE ("warehouse_id" IS NOT NULL);



CREATE INDEX "idx_inventory_logs_created_at" ON "public"."inventory_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_inventory_logs_product_id" ON "public"."inventory_logs" USING "btree" ("product_id");



CREATE INDEX "idx_inventory_movements_created" ON "public"."inventory_movements" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_inventory_movements_item" ON "public"."inventory_movements" USING "btree" ("inventory_item_id");



CREATE INDEX "idx_inventory_movements_product" ON "public"."inventory_movements" USING "btree" ("product_id");



CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_orders_company" ON "public"."orders" USING "btree" ("company_id");



CREATE INDEX "idx_product_lots_lot_number" ON "public"."product_lots" USING "btree" ("lot_number");



CREATE INDEX "idx_product_lots_product" ON "public"."product_lots" USING "btree" ("product_id");



CREATE INDEX "idx_product_lots_received_at" ON "public"."product_lots" USING "btree" ("received_at");



CREATE INDEX "idx_products_barcode" ON "public"."products" USING "btree" ("barcode");



CREATE INDEX "idx_purchase_order_items_po" ON "public"."purchase_order_items" USING "btree" ("purchase_order_id");



CREATE INDEX "idx_purchase_order_payments_po" ON "public"."purchase_order_payments" USING "btree" ("purchase_order_id");



CREATE INDEX "idx_purchase_orders_created" ON "public"."purchase_orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_purchase_orders_supplier" ON "public"."purchase_orders" USING "btree" ("supplier_id");



CREATE INDEX "idx_quotation_items_quotation" ON "public"."quotation_items" USING "btree" ("quotation_id");



CREATE INDEX "idx_quotations_company" ON "public"."quotations" USING "btree" ("company_id");



CREATE INDEX "idx_quotations_order" ON "public"."quotations" USING "btree" ("order_id") WHERE ("order_id" IS NOT NULL);



CREATE INDEX "idx_receiving_items_order" ON "public"."receiving_items" USING "btree" ("receiving_order_id");



CREATE INDEX "idx_receiving_orders_status" ON "public"."receiving_orders" USING "btree" ("status");



CREATE INDEX "idx_receiving_staging_matched" ON "public"."receiving_staging" USING "btree" ("matched_receiving_item_id");



CREATE INDEX "idx_receiving_staging_product" ON "public"."receiving_staging" USING "btree" ("product_id");



CREATE INDEX "idx_receiving_staging_unmatched" ON "public"."receiving_staging" USING "btree" ("matched_receiving_item_id") WHERE ("matched_receiving_item_id" IS NULL);



CREATE INDEX "idx_shipment_serials_inventory_item" ON "public"."shipment_serials" USING "btree" ("inventory_item_id") WHERE ("inventory_item_id" IS NOT NULL);



CREATE INDEX "idx_shipment_serials_product" ON "public"."shipment_serials" USING "btree" ("product_id");



CREATE INDEX "idx_shipment_serials_shipment" ON "public"."shipment_serials" USING "btree" ("shipment_id");



CREATE INDEX "idx_user_role_groups_group" ON "public"."user_role_groups" USING "btree" ("role_group_id");



CREATE INDEX "idx_user_role_groups_user" ON "public"."user_role_groups" USING "btree" ("user_id");



CREATE INDEX "idx_warehouse_locations_parent" ON "public"."warehouse_locations" USING "btree" ("parent_id");



CREATE INDEX "idx_warehouse_locations_type" ON "public"."warehouse_locations" USING "btree" ("type");



CREATE INDEX "idx_warehouse_locations_warehouse" ON "public"."warehouse_locations" USING "btree" ("warehouse_id");



CREATE INDEX "idx_warehouses_is_active" ON "public"."warehouses" USING "btree" ("is_active");



CREATE UNIQUE INDEX "inventory_items_product_serial_unique" ON "public"."inventory_items" USING "btree" ("product_id", "serial_number") WHERE ("serial_number" IS NOT NULL);



CREATE UNIQUE INDEX "inventory_items_unit_barcode_unique" ON "public"."inventory_items" USING "btree" ("unit_barcode") WHERE ("unit_barcode" IS NOT NULL);



CREATE UNIQUE INDEX "orders_order_number_idx" ON "public"."orders" USING "btree" ("order_number") WHERE ("order_number" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trg_as_requests_updated_at" BEFORE UPDATE ON "public"."as_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_as_requests_updated_at"();



CREATE OR REPLACE TRIGGER "trg_check_location_hierarchy" BEFORE INSERT OR UPDATE ON "public"."warehouse_locations" FOR EACH ROW EXECUTE FUNCTION "public"."check_location_hierarchy"();



CREATE OR REPLACE TRIGGER "trg_generate_order_number" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."generate_order_number"();



CREATE OR REPLACE TRIGGER "trg_update_location_full_path" BEFORE INSERT OR UPDATE ON "public"."warehouse_locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_location_full_path"();



ALTER TABLE ONLY "public"."access_logs"
    ADD CONSTRAINT "access_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."as_logs"
    ADD CONSTRAINT "as_logs_as_request_id_fkey" FOREIGN KEY ("as_request_id") REFERENCES "public"."as_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_requests"
    ADD CONSTRAINT "as_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."as_requests"
    ADD CONSTRAINT "as_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_products"
    ADD CONSTRAINT "company_products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_products"
    ADD CONSTRAINT "company_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_logs"
    ADD CONSTRAINT "crm_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."crm_logs"
    ADD CONSTRAINT "crm_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."crm_logs"
    ADD CONSTRAINT "crm_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."inbound_shipment_events"
    ADD CONSTRAINT "inbound_shipment_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inbound_shipment_events"
    ADD CONSTRAINT "inbound_shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "public"."inbound_shipments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inbound_shipment_items"
    ADD CONSTRAINT "inbound_shipment_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."inbound_shipment_items"
    ADD CONSTRAINT "inbound_shipment_items_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "public"."inbound_shipments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inbound_shipments"
    ADD CONSTRAINT "inbound_shipments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inbound_shipments"
    ADD CONSTRAINT "inbound_shipments_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inbound_shipments"
    ADD CONSTRAINT "inbound_shipments_receiving_order_id_fkey" FOREIGN KEY ("receiving_order_id") REFERENCES "public"."receiving_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_scanned_by_fkey" FOREIGN KEY ("scanned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."product_lots"
    ADD CONSTRAINT "product_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "product_serials_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."product_lots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "product_serials_receiving_item_id_fkey" FOREIGN KEY ("receiving_item_id") REFERENCES "public"."receiving_items"("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "product_serials_receiving_staging_id_fkey" FOREIGN KEY ("receiving_staging_id") REFERENCES "public"."receiving_staging"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_order_payments"
    ADD CONSTRAINT "purchase_order_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."purchase_order_payments"
    ADD CONSTRAINT "purchase_order_payments_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receiving_items"
    ADD CONSTRAINT "receiving_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."receiving_items"
    ADD CONSTRAINT "receiving_items_receiving_order_id_fkey" FOREIGN KEY ("receiving_order_id") REFERENCES "public"."receiving_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receiving_orders"
    ADD CONSTRAINT "receiving_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."receiving_orders"
    ADD CONSTRAINT "receiving_orders_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."receiving_staging"
    ADD CONSTRAINT "receiving_staging_matched_receiving_item_id_fkey" FOREIGN KEY ("matched_receiving_item_id") REFERENCES "public"."receiving_items"("id");



ALTER TABLE ONLY "public"."receiving_staging"
    ADD CONSTRAINT "receiving_staging_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."shipment_serials"
    ADD CONSTRAINT "shipment_serials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."shipment_serials"
    ADD CONSTRAINT "shipment_serials_serial_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id");



ALTER TABLE ONLY "public"."shipment_serials"
    ADD CONSTRAINT "shipment_serials_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."user_role_groups"
    ADD CONSTRAINT "user_role_groups_role_group_id_fkey" FOREIGN KEY ("role_group_id") REFERENCES "public"."role_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_role_groups"
    ADD CONSTRAINT "user_role_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_locations"
    ADD CONSTRAINT "warehouse_locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_locations"
    ADD CONSTRAINT "warehouse_locations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE CASCADE;



ALTER TABLE "public"."access_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_delete_departments" ON "public"."departments" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "admin_delete_menu_access" ON "public"."menu_access_rules" FOR DELETE TO "authenticated" USING (( SELECT (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'department'::"text") = 'management'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'position'::"text") = 'director'::"text"))));



CREATE POLICY "admin_delete_positions" ON "public"."positions" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "admin_delete_role_groups" ON "public"."role_groups" FOR DELETE TO "authenticated" USING (( SELECT (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'department'::"text") = 'management'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'position'::"text") = 'director'::"text"))));



CREATE POLICY "admin_delete_settings" ON "public"."system_settings" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "admin_delete_user_role_groups" ON "public"."user_role_groups" FOR DELETE TO "authenticated" USING (( SELECT (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'department'::"text") = 'management'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'position'::"text") = 'director'::"text"))));



CREATE POLICY "admin_insert_departments" ON "public"."departments" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "admin_insert_menu_access" ON "public"."menu_access_rules" FOR INSERT TO "authenticated" WITH CHECK (( SELECT (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'department'::"text") = 'management'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'position'::"text") = 'director'::"text"))));



CREATE POLICY "admin_insert_positions" ON "public"."positions" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "admin_insert_role_groups" ON "public"."role_groups" FOR INSERT TO "authenticated" WITH CHECK (( SELECT (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'department'::"text") = 'management'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'position'::"text") = 'director'::"text"))));



CREATE POLICY "admin_insert_user_role_groups" ON "public"."user_role_groups" FOR INSERT TO "authenticated" WITH CHECK (( SELECT (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'department'::"text") = 'management'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'position'::"text") = 'director'::"text"))));



CREATE POLICY "admin_read_role_groups" ON "public"."role_groups" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "admin_read_user_role_groups" ON "public"."user_role_groups" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "admin_update_departments" ON "public"."departments" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "admin_update_menu_access" ON "public"."menu_access_rules" FOR UPDATE TO "authenticated" USING (( SELECT (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'department'::"text") = 'management'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'position'::"text") = 'director'::"text")))) WITH CHECK (( SELECT (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'department'::"text") = 'management'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'position'::"text") = 'director'::"text"))));



CREATE POLICY "admin_update_positions" ON "public"."positions" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "admin_update_role_groups" ON "public"."role_groups" FOR UPDATE TO "authenticated" USING (( SELECT (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'department'::"text") = 'management'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'position'::"text") = 'director'::"text")))) WITH CHECK (( SELECT (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'department'::"text") = 'management'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'position'::"text") = 'director'::"text"))));



CREATE POLICY "admin_update_settings" ON "public"."system_settings" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "admin_update_user_role_groups" ON "public"."user_role_groups" FOR UPDATE TO "authenticated" USING (( SELECT (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'department'::"text") = 'management'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'position'::"text") = 'director'::"text")))) WITH CHECK (( SELECT (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'department'::"text") = 'management'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'position'::"text") = 'director'::"text"))));



CREATE POLICY "admin_write_settings" ON "public"."system_settings" FOR INSERT TO "authenticated" WITH CHECK (false);



ALTER TABLE "public"."as_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."as_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated read as_logs" ON "public"."as_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated read as_requests" ON "public"."as_requests" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated write as_logs" ON "public"."as_logs" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated write as_requests" ON "public"."as_requests" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_read_departments" ON "public"."departments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_read_menu_access" ON "public"."menu_access_rules" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_read_positions" ON "public"."positions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_read_settings" ON "public"."system_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "b2b_order_items_own" ON "public"."order_items" USING (("order_id" IN ( SELECT "o"."id"
   FROM ("public"."orders" "o"
     JOIN "public"."companies" "c" ON (("c"."id" = "o"."company_id")))
  WHERE ("c"."auth_user_id" = "auth"."uid"())))) WITH CHECK (("order_id" IN ( SELECT "o"."id"
   FROM ("public"."orders" "o"
     JOIN "public"."companies" "c" ON (("c"."id" = "o"."company_id")))
  WHERE ("c"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "b2b_orders_own" ON "public"."orders" USING (("company_id" IN ( SELECT "companies"."id"
   FROM "public"."companies"
  WHERE ("companies"."auth_user_id" = "auth"."uid"())))) WITH CHECK (("company_id" IN ( SELECT "companies"."id"
   FROM "public"."companies"
  WHERE ("companies"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "b2b_quotation_items_own" ON "public"."quotation_items" USING (("quotation_id" IN ( SELECT "q"."id"
   FROM ("public"."quotations" "q"
     JOIN "public"."companies" "c" ON (("c"."id" = "q"."company_id")))
  WHERE ("c"."auth_user_id" = "auth"."uid"())))) WITH CHECK (("quotation_id" IN ( SELECT "q"."id"
   FROM ("public"."quotations" "q"
     JOIN "public"."companies" "c" ON (("c"."id" = "q"."company_id")))
  WHERE ("c"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "b2b_quotations_own" ON "public"."quotations" USING (("company_id" IN ( SELECT "companies"."id"
   FROM "public"."companies"
  WHERE ("companies"."auth_user_id" = "auth"."uid"())))) WITH CHECK (("company_id" IN ( SELECT "companies"."id"
   FROM "public"."companies"
  WHERE ("companies"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "b2b_update_own_contact" ON "public"."companies" FOR UPDATE USING (("auth_user_id" = "auth"."uid"())) WITH CHECK (("auth_user_id" = "auth"."uid"()));



CREATE POLICY "b2b_user_select_own_company" ON "public"."companies" FOR SELECT USING ((("auth_user_id" = "auth"."uid"()) OR ("is_customer" = false)));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_admin_all" ON "public"."categories" USING (true);



CREATE POLICY "categories_read_all" ON "public"."categories" FOR SELECT USING (true);



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crm_logs_admin_all" ON "public"."crm_logs" USING (true);



CREATE POLICY "crm_logs_read_all" ON "public"."crm_logs" FOR SELECT USING (true);



ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inbound_shipment_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inbound_shipment_events_all" ON "public"."inbound_shipment_events" USING (true) WITH CHECK (true);



ALTER TABLE "public"."inbound_shipment_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inbound_shipment_items_all" ON "public"."inbound_shipment_items" USING (true) WITH CHECK (true);



ALTER TABLE "public"."inbound_shipments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inbound_shipments_all" ON "public"."inbound_shipments" USING (true) WITH CHECK (true);



ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_items_all" ON "public"."inventory_items" USING (true) WITH CHECK (true);



ALTER TABLE "public"."inventory_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_movements_all" ON "public"."inventory_movements" USING (true) WITH CHECK (true);



ALTER TABLE "public"."menu_access_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "no_direct_access_logs" ON "public"."access_logs" USING (false);



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_lots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_lots_delete" ON "public"."product_lots" FOR DELETE USING (true);



CREATE POLICY "product_lots_insert" ON "public"."product_lots" FOR INSERT WITH CHECK (true);



CREATE POLICY "product_lots_select" ON "public"."product_lots" FOR SELECT USING (true);



CREATE POLICY "product_lots_update" ON "public"."product_lots" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_order_items_all" ON "public"."purchase_order_items" USING (true) WITH CHECK (true);



ALTER TABLE "public"."purchase_order_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_order_payments_all" ON "public"."purchase_order_payments" USING (true) WITH CHECK (true);



ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_orders_all" ON "public"."purchase_orders" USING (true) WITH CHECK (true);



ALTER TABLE "public"."quotation_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quotations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receiving_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receiving_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receiving_staging" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_all" ON "public"."receiving_items" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_all" ON "public"."receiving_orders" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_all" ON "public"."receiving_staging" USING (true) WITH CHECK (true);



ALTER TABLE "public"."shipment_serials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shipment_serials_admin_all" ON "public"."shipment_serials" USING (true);



CREATE POLICY "shipment_serials_read_all" ON "public"."shipment_serials" FOR SELECT USING (true);



ALTER TABLE "public"."shipments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shipments_admin_all" ON "public"."shipments" USING (true);



CREATE POLICY "shipments_read_all" ON "public"."shipments" FOR SELECT USING (true);



ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_role_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouse_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warehouse_locations_all" ON "public"."warehouse_locations" USING (true) WITH CHECK (true);



ALTER TABLE "public"."warehouses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warehouses_all" ON "public"."warehouses" USING (true) WITH CHECK (true);



CREATE POLICY "인증된 사용자만 companies 접근" ON "public"."companies" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "인증된 사용자만 company_products 접근" ON "public"."company_products" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "인증된 사용자만 inventory_logs 조회" ON "public"."inventory_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "인증된 사용자만 inventory_logs 추가" ON "public"."inventory_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "인증된 사용자만 products 수정" ON "public"."products" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "인증된 사용자만 products 조회" ON "public"."products" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "인증된 사용자만 quotation_items 접근" ON "public"."quotation_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "인증된 사용자만 quotations 접근" ON "public"."quotations" TO "authenticated" USING (true) WITH CHECK (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_order_with_stock_restore"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_order_with_stock_restore"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_order_with_stock_restore"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_location_hierarchy"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_location_hierarchy"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_location_hierarchy"() TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_order_with_stock_deduction"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_order_with_stock_deduction"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_order_with_stock_deduction"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_order_with_stock_deduction"("p_company_id" "uuid", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_order_with_stock_deduction"("p_company_id" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order_with_stock_deduction"("p_company_id" "uuid", "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_order_with_stock_deduction"("p_company_id" "uuid", "p_items" "jsonb", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_order_with_stock_deduction"("p_company_id" "uuid", "p_items" "jsonb", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order_with_stock_deduction"("p_company_id" "uuid", "p_items" "jsonb", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_inventory_items"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid", "p_lot_id" "uuid", "p_generate_unit_barcode" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_inventory_items"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid", "p_lot_id" "uuid", "p_generate_unit_barcode" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_inventory_items"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid", "p_lot_id" "uuid", "p_generate_unit_barcode" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_product_serials"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_product_serials"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_product_serials"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_product_serials"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid", "p_lot_id" "uuid", "p_generate_unit_barcode" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_product_serials"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid", "p_lot_id" "uuid", "p_generate_unit_barcode" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_product_serials"("p_product_id" "uuid", "p_quantity" integer, "p_receiving_item_id" "uuid", "p_lot_id" "uuid", "p_generate_unit_barcode" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_order_stock"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."restore_order_stock"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_order_stock"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_as_requests_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_as_requests_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_as_requests_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_location_full_path"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_location_full_path"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_location_full_path"() TO "service_role";



GRANT ALL ON TABLE "public"."access_logs" TO "anon";
GRANT ALL ON TABLE "public"."access_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."access_logs" TO "service_role";



GRANT ALL ON TABLE "public"."as_logs" TO "anon";
GRANT ALL ON TABLE "public"."as_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."as_logs" TO "service_role";



GRANT ALL ON TABLE "public"."as_requests" TO "anon";
GRANT ALL ON TABLE "public"."as_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."as_requests" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."company_products" TO "anon";
GRANT ALL ON TABLE "public"."company_products" TO "authenticated";
GRANT ALL ON TABLE "public"."company_products" TO "service_role";



GRANT ALL ON TABLE "public"."crm_logs" TO "anon";
GRANT ALL ON TABLE "public"."crm_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_logs" TO "service_role";



GRANT ALL ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT ALL ON TABLE "public"."departments" TO "service_role";



GRANT ALL ON TABLE "public"."inbound_shipment_events" TO "anon";
GRANT ALL ON TABLE "public"."inbound_shipment_events" TO "authenticated";
GRANT ALL ON TABLE "public"."inbound_shipment_events" TO "service_role";



GRANT ALL ON TABLE "public"."inbound_shipment_items" TO "anon";
GRANT ALL ON TABLE "public"."inbound_shipment_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inbound_shipment_items" TO "service_role";



GRANT ALL ON TABLE "public"."inbound_shipments" TO "anon";
GRANT ALL ON TABLE "public"."inbound_shipments" TO "authenticated";
GRANT ALL ON TABLE "public"."inbound_shipments" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_logs" TO "anon";
GRANT ALL ON TABLE "public"."inventory_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_logs" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."menu_access_rules" TO "anon";
GRANT ALL ON TABLE "public"."menu_access_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_access_rules" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."positions" TO "anon";
GRANT ALL ON TABLE "public"."positions" TO "authenticated";
GRANT ALL ON TABLE "public"."positions" TO "service_role";



GRANT ALL ON TABLE "public"."product_lots" TO "anon";
GRANT ALL ON TABLE "public"."product_lots" TO "authenticated";
GRANT ALL ON TABLE "public"."product_lots" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_payments" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_payments" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."quotation_items" TO "anon";
GRANT ALL ON TABLE "public"."quotation_items" TO "authenticated";
GRANT ALL ON TABLE "public"."quotation_items" TO "service_role";



GRANT ALL ON TABLE "public"."quotations" TO "anon";
GRANT ALL ON TABLE "public"."quotations" TO "authenticated";
GRANT ALL ON TABLE "public"."quotations" TO "service_role";



GRANT ALL ON TABLE "public"."receiving_items" TO "anon";
GRANT ALL ON TABLE "public"."receiving_items" TO "authenticated";
GRANT ALL ON TABLE "public"."receiving_items" TO "service_role";



GRANT ALL ON TABLE "public"."receiving_orders" TO "anon";
GRANT ALL ON TABLE "public"."receiving_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."receiving_orders" TO "service_role";



GRANT ALL ON TABLE "public"."receiving_staging" TO "anon";
GRANT ALL ON TABLE "public"."receiving_staging" TO "authenticated";
GRANT ALL ON TABLE "public"."receiving_staging" TO "service_role";



GRANT ALL ON TABLE "public"."role_groups" TO "anon";
GRANT ALL ON TABLE "public"."role_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."role_groups" TO "service_role";



GRANT ALL ON TABLE "public"."shipment_serials" TO "anon";
GRANT ALL ON TABLE "public"."shipment_serials" TO "authenticated";
GRANT ALL ON TABLE "public"."shipment_serials" TO "service_role";



GRANT ALL ON TABLE "public"."shipments" TO "anon";
GRANT ALL ON TABLE "public"."shipments" TO "authenticated";
GRANT ALL ON TABLE "public"."shipments" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_role_groups" TO "anon";
GRANT ALL ON TABLE "public"."user_role_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."user_role_groups" TO "service_role";



GRANT ALL ON TABLE "public"."warehouse_locations" TO "anon";
GRANT ALL ON TABLE "public"."warehouse_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouse_locations" TO "service_role";



GRANT ALL ON TABLE "public"."warehouses" TO "anon";
GRANT ALL ON TABLE "public"."warehouses" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouses" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







