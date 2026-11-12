-- ============================================================================
--  168_walkin_golf_fk.sql — 당일 골프 손님(워크인)의 조·제외·홀수·전기카트가 저장되게
-- ----------------------------------------------------------------------------
--  2026-11 전체 검수에서 발견.  ⚠ 적용 전 — Min 승인 뒤 적용한다(DDL).
--
--  원인: 당일 골프 손님은 walkins 에 있고 bookings 에 없다(번호 9,900,001~, SQL 120).
--        그런데 코스 배정표가 쓰는 표의 event_seq 가 모두 bookings FK 라 그 번호를 받지 않는다:
--          golf_groups(103) · golf_skips(102) · golf_holes(106) · cart_bookings
--        → 프론트에서 당일 골프 손님을 등록하면, 그날 코스 배정표가 그 조를 저장하려다 FK 위반으로 실패한다.
--          (123 은 order_tokens 만 같은 문제를 풀었다. walkins 가 0건이라 지금까지 드러나지 않았다.)
--        화면(course.html)은 2026-11-12 부터 당일 손님 조만 화면에 남기고 나머지 조를 저장한다 — 임시 처리.
--        이 SQL 을 적용하면 당일 손님 조도 그대로 저장된다(화면 수정 불필요).
--
--  조치(order_tokens 123 과 같은 방식):
--    ① 네 표의 bookings FK 를 없앤다.
--    ② 대신 「예약 또는 당일 손님에 있는 번호만」 받는 검사 트리거를 단다(없는 번호로는 여전히 못 넣는다).
--    ③ 예약·당일 손님이 지워지면 그 번호의 행을 지우는 정리 트리거를 양쪽에 단다(종전 ON DELETE CASCADE 와 같은 결과).
--    ④ walkin_open 옛 4인자 판을 지운다 — 8인자 판(123)과 인자 이름이 겹쳐, 인자 4개만 보내면 서버가 어느 쪽인지 고르지 못한다.
--       (pos.html 은 2026-11-12 부터 8인자 판에만 있는 인자를 같이 보내 하나로 정한다.)
--    ⑤ 120 의 옛 정책 walkins_write·walkins_update(pos·settle)를 지운다 — 123 의 walkins_ins·walkins_upd
--       (pos·settle·front·golf)가 그대로 덮는 부분집합이라 권한은 달라지지 않는다(같은 일을 하는 정책이 두 벌인 것만 정리).
--
--  멱등. 권한 변경 없음(⑤ 는 겹치는 옛 정책 정리). 새 함수 둘은 트리거 전용(public·anon·authenticated 실행 권한 회수).
-- ============================================================================

-- ② 번호 검사 — 예약(bookings) 또는 당일 손님(walkins)에 있는 번호만
--    부모 행을 FOR KEY SHARE 로 잡는다(FK 와 같은 잠금 — 검사와 동시에 부모가 지워지는 틈을 막는다).
create or replace function public.golf_seq_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.event_seq is null then return new; end if;          -- NOT NULL 여부는 각 표의 제약이 본다
  perform 1 from bookings where event_seq = new.event_seq for key share;
  if found then return new; end if;
  perform 1 from walkins where event_seq = new.event_seq for key share;
  if found then return new; end if;
  raise exception '%: event_seq % 는 예약에도 당일 손님에도 없습니다', tg_table_name, new.event_seq
    using errcode = '23503';
end $$;
revoke all on function public.golf_seq_guard() from public, anon, authenticated;

-- ③ 정리 — 예약·당일 손님이 지워지면 그 번호의 골프 행을 지운다
--    조원(golf_group_members)·대여 물품(golf_lends)은 조(golf_groups) FK 로 같이 지워진다.
create or replace function public.golf_rows_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from golf_groups   where event_seq = old.event_seq;
  delete from golf_skips    where event_seq = old.event_seq;
  delete from golf_holes    where event_seq = old.event_seq;
  delete from cart_bookings where event_seq = old.event_seq;
  return old;
end $$;
revoke all on function public.golf_rows_cleanup() from public, anon, authenticated;

drop trigger if exists trg_golf_cleanup_bookings on public.bookings;
create trigger trg_golf_cleanup_bookings after delete on public.bookings
  for each row execute function public.golf_rows_cleanup();
drop trigger if exists trg_golf_cleanup_walkins on public.walkins;
create trigger trg_golf_cleanup_walkins after delete on public.walkins
  for each row execute function public.golf_rows_cleanup();

-- ① FK 제거 + 검사 트리거(표마다)
alter table public.golf_groups   drop constraint if exists golf_groups_event_seq_fkey;
alter table public.golf_skips    drop constraint if exists golf_skips_event_seq_fkey;
alter table public.golf_holes    drop constraint if exists golf_holes_event_seq_fkey;
alter table public.cart_bookings drop constraint if exists cart_bookings_event_seq_fkey;

drop trigger if exists trg_seq_guard on public.golf_groups;
create trigger trg_seq_guard before insert or update of event_seq on public.golf_groups
  for each row execute function public.golf_seq_guard();
drop trigger if exists trg_seq_guard on public.golf_skips;
create trigger trg_seq_guard before insert or update of event_seq on public.golf_skips
  for each row execute function public.golf_seq_guard();
drop trigger if exists trg_seq_guard on public.golf_holes;
create trigger trg_seq_guard before insert or update of event_seq on public.golf_holes
  for each row execute function public.golf_seq_guard();
drop trigger if exists trg_seq_guard on public.cart_bookings;
create trigger trg_seq_guard before insert or update of event_seq on public.cart_bookings
  for each row execute function public.golf_seq_guard();

-- ④ walkin_open 옛 4인자 판 삭제(8인자 판만 남긴다)
drop function if exists public.walkin_open(date, text, integer, text);

-- ⑤ 120 의 옛 워크인 쓰기 정책 삭제(123 의 walkins_ins·walkins_upd 가 같은 범위를 포함한다)
drop policy if exists walkins_write  on public.walkins;
drop policy if exists walkins_update on public.walkins;

notify pgrst, 'reload schema';

-- 확인용(읽기만):
--   select conrelid::regclass, conname from pg_constraint
--    where contype='f' and confrelid='public.bookings'::regclass
--      and conrelid in ('public.golf_groups'::regclass,'public.golf_skips'::regclass,'public.golf_holes'::regclass,'public.cart_bookings'::regclass);   -- 0행
--   select tgrelid::regclass, tgname from pg_trigger where tgname in ('trg_seq_guard','trg_golf_cleanup_bookings','trg_golf_cleanup_walkins') and not tgisinternal;   -- 6행
--   select count(*) from pg_proc where proname='walkin_open';   -- 1
--   select policyname from pg_policies where schemaname='public' and tablename='walkins' order by 1;   -- walkins_ins · walkins_read · walkins_upd 3행
--   -- 어디에도 없는 번호(고아) 0 이어야 한다:
--   select 'golf_groups', count(*) from golf_groups g where not exists(select 1 from bookings b where b.event_seq=g.event_seq) and not exists(select 1 from walkins w where w.event_seq=g.event_seq);
