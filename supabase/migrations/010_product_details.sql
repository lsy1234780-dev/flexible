-- 제품 상세 정보 확장
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS width_cm numeric,           -- 가로 (cm)
  ADD COLUMN IF NOT EXISTS height_cm numeric,          -- 세로 (cm)
  ADD COLUMN IF NOT EXISTS depth_cm numeric,           -- 높이 (cm)
  ADD COLUMN IF NOT EXISTS weight_kg numeric,          -- 무게 (kg)
  ADD COLUMN IF NOT EXISTS image_url text,             -- 대표 이미지 URL
  ADD COLUMN IF NOT EXISTS description text;           -- 제품 소개/설명
