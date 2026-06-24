-- ============================================================================
--  42_board_pin_sort.sql — 공지 고정 기간 + 순서 정렬
-- ----------------------------------------------------------------------------
--  · pin_until  : 고정 만료 시각(null=무기한). 이 시각이 지나면 '고정'에서 자동 제외
--                 (DB의 pinned 플래그는 유지, 화면·띠가 pin_until로 판정).
--  · sort_order : 수동 정렬값(작을수록 위). 드래그(≡)로 재배치 시 갱신.
--  멱등. RLS 변경 불요(21의 announcements 정책 그대로). ⚠ Supabase 수동 실행.
-- ============================================================================

alter table announcements add column if not exists pin_until  timestamptz;
alter table announcements add column if not exists sort_order int not null default 0;
create index if not exists idx_announcements_sort on announcements(sort_order);
