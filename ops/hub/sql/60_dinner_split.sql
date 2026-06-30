-- ============================================================================
--  60_dinner_split.sql — 夕食 명패 '석식 분리'(운영팀 합석에서 제외)
-- ----------------------------------------------------------------------------
--  배경: レストラン名札을 운영팀(print_overrides.team_group) 단위로 자동 합석하도록 변경.
--    같은 운영팀이라도 석식만 따로 빼고 싶은 팀이 있어 per-team 플래그 추가.
--    · dinner_split=true → 그 팀은 운영팀 합석에서 빠져 자기 명패로 단독 출력(夕食オーダー).
--    · 기존 dining_group 컬럼은 더 이상 명패 묶음에 쓰지 않음(데이터는 보존, graceful).
--  RLS: print_overrides 기존 정책 그대로(읽기 로그인·쓰기 room/print 영역).
--  멱등. ⚠ Supabase SQL Editor 수동 실행(또는 MCP). 59 이후.
-- ============================================================================

alter table public.print_overrides add column if not exists dinner_split boolean not null default false;
