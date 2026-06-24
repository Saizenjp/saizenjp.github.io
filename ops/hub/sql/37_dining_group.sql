-- 37_dining_group.sql — 팀 묶기(레스토랑 명패 병합)
-- print_overrides 재사용. 같은 dining_group 값을 가진 팀들은 명패 인쇄 시
-- 한 장으로 묶여 대표자·태그코드 모두 표기 + 인원 합산.
-- 식수 집계에는 영향 없음(각 팀 pax 그대로 유지 → 합계 불변).
-- 멱등. RLS는 print_overrides(32) 정책 그대로(읽기 로그인 전체 · 쓰기 room 영역).

alter table print_overrides add column if not exists dining_group text;
create index if not exists idx_print_overrides_dining_group on print_overrides(dining_group);
