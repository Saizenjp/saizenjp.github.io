-- ============================================================================
--  64_remark_ja.sql — 비고/현지비고 일본어 번역 캐시 컬럼(bookings)
-- ----------------------------------------------------------------------------
--  DeepL(엣지 함수 translate-remarks)가 번역해 저장하는 캐시.
--    · remark_ja        = 비고(remark) 일본어
--    · remark_local_ja  = 현지 비고(remark_local) 일본어
--  번역은 엣지 함수가 service_role로 기록(클라이언트 쓰기 없음). 읽기는 기존
--  bookings_sel(로그인 전체) 정책으로 커버 → 별도 RLS 불요.
--  멱등. ⚠ Supabase SQL Editor 수동 실행 / MCP 적용.
-- ============================================================================

alter table public.bookings add column if not exists remark_ja text;
alter table public.bookings add column if not exists remark_local_ja text;
