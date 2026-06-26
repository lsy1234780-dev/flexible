-- 견적서 발행인 / 발주 확정자 (이메일) 추가
ALTER TABLE quotations ADD COLUMN issued_by text;
ALTER TABLE orders ADD COLUMN confirmed_by text;
