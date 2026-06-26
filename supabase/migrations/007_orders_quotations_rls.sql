-- ============================================
-- 7차: orders / quotations RLS 보안 강화
-- ============================================
-- 기존 "전체 authenticated 허용" 정책 제거 → B2B 본인 업체 것만 접근
-- 어드민은 service role key 로 RLS bypass 처리

-- [ orders ] ---------------------------------------------------------
DROP POLICY IF EXISTS "어드민 orders 전체 접근" ON orders;
DROP POLICY IF EXISTS "어드민 order_items 전체 접근" ON order_items;

-- B2B 사용자: 자신의 업체 발주만 읽기/쓰기
CREATE POLICY "b2b_orders_own" ON orders
  FOR ALL USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "b2b_order_items_own" ON order_items
  FOR ALL USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN companies c ON c.id = o.company_id
      WHERE c.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN companies c ON c.id = o.company_id
      WHERE c.auth_user_id = auth.uid()
    )
  );

-- [ quotations ] -----------------------------------------------------
-- 기존 broad 정책은 유지 (어드민 createClient 호환) + B2B 본인 업체 정책 추가
-- B2B 사용자: 자신의 업체 견적서만 읽기/생성
CREATE POLICY "b2b_quotations_own" ON quotations
  FOR ALL USING (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "b2b_quotation_items_own" ON quotation_items
  FOR ALL USING (
    quotation_id IN (
      SELECT q.id FROM quotations q
      JOIN companies c ON c.id = q.company_id
      WHERE c.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    quotation_id IN (
      SELECT q.id FROM quotations q
      JOIN companies c ON c.id = q.company_id
      WHERE c.auth_user_id = auth.uid()
    )
  );
