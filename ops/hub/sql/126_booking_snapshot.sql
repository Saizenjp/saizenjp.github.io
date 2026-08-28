-- ============================================================================
--  126_booking_snapshot.sql — 예약 추이(일별 스냅샷) (Min 2026-08)
-- ----------------------------------------------------------------------------
--  「9월 예약이 지난주보다 늘었나」를 추정 없이 답하려면 그때 숫자가 남아 있어야 한다.
--  bookings 에는 변경 이력이 없어(감사 트리거 미부착) 지금은 역산밖에 못 한다.
--  → 매일 자정(JST) 월별·구분별·숙소별 팀/인원을 한 줄씩 찍어 둔다.
--
--  · 하루 30줄 안팎(월 6 × 구분 3 × 숙소 4 미만) — 1년 쌓아도 만 줄 남짓.
--  · 과거는 소급되지 않는다. 오늘부터 쌓인다.
--  · 「무엇이 바뀌었나」(신규·취소 팀 목록)는 import_log 를 그대로 읽는다(이미 남아 있다).
--
--  멱등. Supabase SQL Editor 또는 MCP apply_migration.
-- ============================================================================

create table if not exists public.booking_snapshots (
  snap_date date not null,          -- 찍은 날(JST)
  dep_ym    text not null,          -- 출발 월 'YYYY-MM'
  status    text not null,          -- 견적 / 대기 / 확정 / 정산 / (없음)
  accom     text not null,          -- 숙소 · (미지정)
  teams     int  not null default 0,
  pax       int  not null default 0,
  primary key (snap_date, dep_ym, status, accom)
);
create index if not exists idx_bsnap_ym on public.booking_snapshots(dep_ym, snap_date);

alter table public.booking_snapshots enable row level security;
--  읽기는 경영 통계와 같은 기준(admin 또는 stats), 쓰기는 함수(security definer)만.
drop policy if exists bsnap_read on public.booking_snapshots;
create policy bsnap_read on public.booking_snapshots for select to authenticated
  using ( is_admin() or has_any_area(array['stats']) );

--  그날의 숫자를 찍는다. 같은 날 다시 부르면 덮어쓴다(여러 번 돌아도 안전).
--   과거 달까지 매일 다시 찍을 필요는 없다 → 지난달 1일 이후 출발건만.
create or replace function public.take_booking_snapshot(p_date date default null)
returns int
language plpgsql security definer set search_path = public as $$
declare d date; n int;
begin
  d := coalesce(p_date, (now() at time zone 'Asia/Tokyo')::date);
  insert into booking_snapshots(snap_date, dep_ym, status, accom, teams, pax)
  select d,
         to_char(b.dep_date,'YYYY-MM'),
         coalesce(nullif(btrim(b.status),''),'(없음)'),
         coalesce(nullif(btrim(g.accom),''),'(미지정)'),
         count(*), coalesce(sum(coalesce(b.pax,0)),0)
  from bookings b left join guests g on g.event_seq = b.event_seq
  where b.dep_date >= (date_trunc('month', d) - interval '1 month')::date
  group by 1,2,3,4
  on conflict (snap_date, dep_ym, status, accom)
    do update set teams = excluded.teams, pax = excluded.pax;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.take_booking_snapshot(date) from public;
grant  execute on function public.take_booking_snapshot(date) to authenticated;

--  화면용 — 월별 「지금 vs N일 전」 + 그 달의 일별 추이 + 그 사이 바뀐 팀 목록.
--   기준일에 스냅샷이 없으면 그 이전 가장 가까운 날을 쓴다(하루 걸러도 답이 나오게).
create or replace function public.booking_trend(p_ym text default null, p_days int default 7)
returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare
  v_role text; v_areas text[]; d0 date; d1 date; ym text; res jsonb;
begin
  select role, areas into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or 'stats' = any(coalesce(v_areas,'{}'))) then
    raise exception '권한 없음(예약 추이 — 관리자 또는 stats 권한자 전용)';
  end if;
  d0 := (now() at time zone 'Asia/Tokyo')::date;
  d1 := d0 - greatest(coalesce(p_days,7),1);
  ym := coalesce(nullif(p_ym,''), to_char(d0,'YYYY-MM'));

  with now_m as (      -- 지금 = 스냅샷이 아니라 실제 예약(오늘치가 아직 안 찍혔어도 맞게)
    select to_char(b.dep_date,'YYYY-MM') dep_ym,
           coalesce(nullif(btrim(b.status),''),'(없음)') status,
           coalesce(nullif(btrim(g.accom),''),'(미지정)') accom,
           count(*) teams, coalesce(sum(coalesce(b.pax,0)),0) pax
    from bookings b left join guests g on g.event_seq = b.event_seq
    where b.dep_date >= date_trunc('month', d0)::date
    group by 1,2,3
  ),
  base_day as (        -- 비교 시점 = d1 이하 가장 가까운 스냅샷 날짜
    select max(snap_date) sd from booking_snapshots where snap_date <= d1
  ),
  prev_m as (
    select dep_ym, status, accom, teams, pax
    from booking_snapshots where snap_date = (select sd from base_day)
  ),
  months as (
    select dep_ym from now_m union select dep_ym from prev_m
  ),
  m_now as ( select dep_ym, sum(teams) t, sum(pax) p from now_m group by 1 ),
  m_prev as ( select dep_ym, sum(teams) t, sum(pax) p from prev_m group by 1 ),
  m_join as (
    select mo.dep_ym ym,
           coalesce(n.t,0) teams, coalesce(n.p,0) pax,
           coalesce(v.t,0) prev_teams, coalesce(v.p,0) prev_pax
    from months mo left join m_now n using(dep_ym) left join m_prev v using(dep_ym)
    order by mo.dep_ym
  ),
  series as (          -- 고른 달의 일별 추이(최근 90일)
    select snap_date sd, sum(teams) t, sum(pax) p
    from booking_snapshots
    where dep_ym = ym and snap_date >= d0 - 90
    group by 1 order by 1
  ),
  st_now as ( select status, sum(teams) t, sum(pax) p from now_m where dep_ym = ym group by 1 ),
  st_prev as ( select status, sum(teams) t, sum(pax) p from prev_m where dep_ym = ym group by 1 ),
  st as (
    select coalesce(a.status,b.status) status,
           coalesce(a.t,0) teams, coalesce(a.p,0) pax,
           coalesce(b.t,0) prev_teams, coalesce(b.p,0) prev_pax
    from st_now a full join st_prev b using(status)
  ),
  ac_now as ( select accom, sum(teams) t, sum(pax) p from now_m where dep_ym = ym group by 1 ),
  ac_prev as ( select accom, sum(teams) t, sum(pax) p from prev_m where dep_ym = ym group by 1 ),
  ac as (
    select coalesce(a.accom,b.accom) accom,
           coalesce(a.t,0) teams, coalesce(a.p,0) pax,
           coalesce(b.t,0) prev_teams, coalesce(b.p,0) prev_pax
    from ac_now a full join ac_prev b using(accom)
  ),
  imp as (             -- 그 사이 등록 로그에서 실제로 바뀐 팀
    select changes from import_log
    where uploaded_at >= (d1::timestamptz) and changes is not null
  ),
  ev as (
    select 'added' k, (e->>'no') no, (e->>'rep') rep, (e->>'n') n
      from imp, jsonb_array_elements(coalesce(changes->'teams_added','[]')) e
    union all
    select 'removed', (e->>'no'), (e->>'rep'), (e->>'n')
      from imp, jsonb_array_elements(coalesce(changes->'teams_removed','[]')) e
    union all
    select 'cancelled', (e->>'no'), (e->>'rep'), null
      from imp, jsonb_array_elements(coalesce(changes->'teams_cancelled','[]')) e
  ),
  ev1 as (             -- 고른 달(출발일 YYMMDD 앞 4자리)만, 팀별 1건
    select distinct on (k, no) k, no, rep, n from ev
    where no like (substr(ym,3,2) || substr(ym,6,2) || '%')
    order by k, no
  )
  select jsonb_build_object(
    'ym', ym,
    'today', d0,
    'base_date', (select sd from base_day),
    'days', greatest(coalesce(p_days,7),1),
    'months', coalesce((select jsonb_agg(to_jsonb(x)) from m_join x),'[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object('d',sd,'teams',t,'pax',p) order by sd) from series),'[]'::jsonb),
    'by_status', coalesce((select jsonb_agg(to_jsonb(x)) from st x),'[]'::jsonb),
    'by_accom',  coalesce((select jsonb_agg(to_jsonb(x)) from ac x),'[]'::jsonb),
    'changes',   coalesce((select jsonb_agg(to_jsonb(x)) from ev1 x),'[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke execute on function public.booking_trend(text,int) from public;
grant  execute on function public.booking_trend(text,int) to authenticated;

--  매일 자정(JST) = UTC 15:00 에 한 번. pg_cron 이 필요하다.
create extension if not exists pg_cron;
select cron.unschedule('booking_snapshot_daily')
  where exists (select 1 from cron.job where jobname = 'booking_snapshot_daily');
select cron.schedule('booking_snapshot_daily', '0 15 * * *', $$select public.take_booking_snapshot()$$);

--  오늘 것부터 바로 한 줄 남긴다(빈 화면 방지)
select public.take_booking_snapshot();

-- 확인:
--   select snap_date, count(*) from booking_snapshots group by 1 order by 1 desc limit 5;
--   select jobname, schedule, active from cron.job where jobname='booking_snapshot_daily';
