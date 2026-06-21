-- ============================================================================
--  SaiZen Hub — 21 부서 공지(announcements) + 오늘 자동요약 RPC
-- ----------------------------------------------------------------------------
--  · announcements: 부서 공지사항. 읽기=로그인 전체 / 쓰기=admin·manager.
--  · today_summary(): 오늘(JST) 체크인·체크아웃·주문·매출 집계(security definer
--    → 일반 담당자도 원본(돈/PII) 노출 없이 집계 숫자만 받음).
--  실행: Supabase SQL Editor. 09·18 이후. 멱등.
-- ============================================================================

create table if not exists announcements (
  id         bigserial   primary key,
  title      text        not null,
  body       text        not null default '',
  pinned     boolean     not null default false,
  author     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table announcements enable row level security;

-- 읽기: 로그인 사용자 전체
drop policy if exists ann_read on announcements;
create policy ann_read on announcements for select to authenticated using (true);
-- 쓰기(작성·수정·삭제): admin·manager만
drop policy if exists ann_write on announcements;
create policy ann_write on announcements for all to authenticated
  using   (exists(select 1 from user_access where user_id=auth.uid() and role in ('admin','manager')))
  with check (exists(select 1 from user_access where user_id=auth.uid() and role in ('admin','manager')));

-- ── 오늘(JST) 자동요약 — 집계만 반환(원본 미노출) ──
create or replace function today_summary()
returns json language sql security definer set search_path = public stable as $$
  with d as (select (timezone('Asia/Tokyo', now()))::date as today)
  select json_build_object(
    'date',           (select today from d),
    'checkin_teams',  (select count(*)                       from bookings, d where dep_date = today),
    'checkin_pax',    (select coalesce(sum(pax),0)::int      from bookings, d where dep_date = today),
    'checkout_teams', (select count(*)                       from bookings, d where arr_date = today),
    'orders',         (select count(*)                       from charges, d  where charged_at::date = today and not voided),
    'sales',          (select coalesce(sum(amount+tax+service_charge),0)::bigint
                         from charges, d where charged_at::date = today and not voided)
  );
$$;
grant execute on function today_summary() to authenticated;

-- ============================================================================
--  끝.
-- ============================================================================
