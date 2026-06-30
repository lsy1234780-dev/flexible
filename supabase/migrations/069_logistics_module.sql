-- 물류관리 모듈(logistics) 추가
-- 기존에 inventory/serials/receiving 모듈로 분산돼 있던 물류관리 그룹 아이템들을
-- logistics 단일 모듈로 통합 게이팅.
-- 기존 워크스페이스가 inventory 또는 receiving 모듈을 켜고 있으면 logistics도 자동 ON.

INSERT INTO workspace_modules (workspace_id, module_key, enabled)
SELECT DISTINCT workspace_id, 'logistics', true
FROM workspace_modules
WHERE module_key IN ('inventory', 'receiving', 'serials')
  AND enabled = true
ON CONFLICT (workspace_id, module_key) DO NOTHING;
