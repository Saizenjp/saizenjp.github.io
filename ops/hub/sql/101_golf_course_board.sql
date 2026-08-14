-- 101_golf_course_board.sql — 골프 코스 배정표(조 단위) 지원
--  ① golf_groups.cart_no 누락 보강
--     golf.html(조편성)이 cart_no 를 select/insert 하는데 DB에 컬럼이 없어
--     조 로드가 조용히 빈 값으로 떨어지고 저장은 실패했다(try/catch 로 가려짐).
--  ② 코스 배정표(course.html)가 쓰는 조회 인덱스.
-- 멱등. Supabase SQL Editor 또는 MCP apply_migration 으로 실행.

alter table if exists public.golf_groups add column if not exists cart_no text;

comment on column public.golf_groups.cart_no is '배정 카트 번호(수기, 예 "12,13")';

create index if not exists golf_groups_play_date_idx on public.golf_groups(play_date);
create index if not exists golf_groups_event_seq_idx on public.golf_groups(event_seq);
