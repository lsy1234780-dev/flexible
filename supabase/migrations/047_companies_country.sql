-- 047: companies에 국가 컬럼 추가
ALTER TABLE companies ADD COLUMN country text;

-- 인덱스
CREATE INDEX idx_companies_country ON companies(country) WHERE country IS NOT NULL;
