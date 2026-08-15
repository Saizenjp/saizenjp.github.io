-- ============================================================================
--  103_golf_groups_cascade.sql — 예약이 지워지면 그 조도 같이 지운다
-- ----------------------------------------------------------------------------
--  Min 2026-08: 「데이터 등록을 새로 했는데 왜 저 팀이 나오지」
--
--  원인: golf_groups.event_seq 의 FK 가 **ON DELETE SET NULL** 이라
--        예약(bookings)이 지워져도 조 행은 살아남아 event_seq=null 이 된다.
--        코스 배정표는 팀을 못 찾으면 저장된 label(예 'FBロ-G')로 표시하므로
--        **없는 팀이 표에 계속 나온다**(실측 84건, 8/12~8/18).
--        step1 월 동기화가 「파일에 없는 팀」을 정리할 때마다 유령이 쌓인다.
--
--  조치: FK 를 ON DELETE CASCADE 로 바꾸고, 남아 있는 고아 행을 정리한다.
--
--  실행: Supabase SQL Editor 또는 MCP apply_migration (멱등).
-- ============================================================================

-- ① 이미 생긴 고아 조·조원 정리
delete from public.golf_group_members
 where group_id in (select id from public.golf_groups where event_seq is null);
delete from public.golf_groups where event_seq is null;

-- ② FK 를 CASCADE 로 교체
alter table public.golf_groups drop constraint if exists golf_groups_event_seq_fkey;
alter table public.golf_groups
  add constraint golf_groups_event_seq_fkey
  foreign key (event_seq) references public.bookings(event_seq) on delete cascade;

-- ③ 앞으로 event_seq 없이 만들어지지 않게(코스 배정표는 항상 팀을 물고 만든다)
alter table public.golf_groups alter column event_seq set not null;

-- 확인용
--   select count(*) from golf_groups where event_seq is null;   -- 0 이어야 한다
