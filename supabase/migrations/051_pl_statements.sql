-- 051: 수기 손익계산서
CREATE TABLE pl_statements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  period_from date NOT NULL,
  period_to   date NOT NULL,
  memo        text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- category: 'revenue' | 'cogs' | 'sga' | 'non_op_income' | 'non_op_expense' | 'tax'
CREATE TABLE pl_statement_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES pl_statements(id) ON DELETE CASCADE,
  category     text NOT NULL CHECK (category IN ('revenue','cogs','sga','non_op_income','non_op_expense','tax')),
  label        text NOT NULL,
  amount       numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  sort_order   integer NOT NULL DEFAULT 0,
  memo         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pl_statement_items_statement ON pl_statement_items(statement_id, category, sort_order);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_pl_statement_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE pl_statements SET updated_at = now() WHERE id = NEW.statement_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pl_items_updated
  AFTER INSERT OR UPDATE OR DELETE ON pl_statement_items
  FOR EACH ROW EXECUTE FUNCTION update_pl_statement_timestamp();
