-- ============================================================================
-- 148_dinner_release_promos_lodging.sql — 석식 화면 공개 제어 + 홍보 안내 + 숙소행 출발 안내(Min 2026-10-26) — MCP 적용 2026-10-26(검증: anon secdef 12 · 석식 276/276 · lobby lodging/promos)
-- ----------------------------------------------------------------------------
--  ① _signage_dinner_live(p_date) — 석식 실시간 계산 본체(145 본문 그대로, 날짜 범위 검사만 뺌 — 로그인 전용).
--     signage_dinner(p_date)(anon) 는 signage_release(screen='dinner') 를 보고 hidden=「준비 중」 / snapshot=공개본 / 없음=실시간(released null).
--     dinner.html 「손님 화면에 공개」 가 _signage_dinner_live 결과를 payload 로 저장한다(모니터가 보는 모양 그대로).
--  ② announcements.kind('notice'|'promo') · screens(text[] lobby/wall/dinner/course) — 홍보(전기카트·특식·안주 신청 안내 등)를
--     공지 보드에서 쓰고 표시 화면을 고른다. _signage_promos(screen) 가 그 화면용 홍보를 준다(손님 공지와 같은 pin_until 창).
--  ③ lobby_departures — 숙소행(시즈노야도·간지호텔·쿠쥬 프라이빗 타운) 출발 시각. 각 사무실이 기입(front·print·shizu 영역), 로비 출발 안내에 표시.
--  ④ signage_lobby — notices 는 kind=notice 만 · dinner 요약에 released · promos(lobby)·wall_promos(wall)·lodging(오늘·내일) 추가(텍스트 치환, 135/145 본문 그대로).
--  ⑤ signage_course — 146 본문 + promos(course). ⑥ data_audit ⑮ dinner_check 는 공개본이 아니라 실시간(_signage_dinner_live)을 재계산과 대조.
--  anon 실행 함수 12개 그대로(새 함수 2개는 authenticated 전용·내부 호출은 definer 권한). 멱등.
-- ============================================================================

-- ── ① 석식 실시간 본체 ──────────────────────────────────────────────────────────
create or replace function public._signage_dinner_live(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_d date := coalesce(p_date, v_today);
  v_venue record;
  v_teams jsonb;
  v_total int;
  v_cnt int;
  v_by jsonb;
begin
  select * into v_venue from dinner_venue where dinner_date = v_d;

  with stay as (
    select b.event_seq, b.rep_name, b.dep_date, b.arr_date,
           coalesce(b.pax, g.pax, 0) as pax, g.accom,
           po.team_group, coalesce(po.team_group_rep, false) as tg_rep,
           coalesce(po.excluded, false) as excluded,
           tv.venue as tvenue,
           (select count(*) from guest_members gm
             where gm.event_seq = b.event_seq and gm.actual_dep is not null and gm.actual_dep <= v_d) as gone,
           (select regexp_replace(gm.person_tag, '-([0-9]+)([A-Za-z]*)$', '-\2')
              from guest_members gm where gm.event_seq = b.event_seq and gm.person_tag is not null
              order by gm.is_rep desc, gm.seq_in_team limit 1) as ptag,
           coalesce(g.team_tag, g.group_code) as gtag
    from bookings b
    join guests g on g.event_seq = b.event_seq
    left join print_overrides po on po.event_seq = b.event_seq
    left join dinner_team_venue tv on tv.event_seq = b.event_seq and tv.dinner_date = v_d
    where b.dep_date <= v_d and b.arr_date > v_d
      and coalesce(b.status,'') <> '대기'
      and coalesce(g.accom,'') <> ''
  ),
  eat as (
    select *, greatest(pax - gone, 0) as eat_pax,
           coalesce(nullif(team_group,''), 'solo:' || event_seq) as unit_key
    from stay where not excluded
  ),
  units as (
    select unit_key,
           (array_agg(rep_name order by tg_rep desc, event_seq))[1] as rep_name,
           (array_agg(coalesce(ptag, gtag, '') order by tg_rep desc, event_seq))[1] as tag,
           (array_agg(accom order by tg_rep desc, event_seq))[1] as accom,
           (array_agg(dep_date order by tg_rep desc, event_seq))[1] as dep_date,
           -- 팀별 장소 = 묶음 중 지정된 팀(대표 우선) → 없으면 그날 장소(없으면 null)
           coalesce((array_agg(tvenue order by tg_rep desc, event_seq) filter (where tvenue is not null))[1], v_venue.venue) as venue,
           sum(eat_pax)::int as pax,
           count(*)::int as n_teams
    from eat
    group by unit_key
    having sum(eat_pax) > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tag', tag, 'rep', rep_name, 'pax', pax, 'accom', accom, 'teams', n_teams,
           'day', (v_d - dep_date) + 1, 'venue', venue)
           order by dep_date, accom, tag, rep_name), '[]'::jsonb),
         coalesce(sum(pax),0)::int, count(*)::int,
         jsonb_build_object(
           'restaurant', jsonb_build_object('units', count(*) filter (where venue = 'restaurant'), 'pax', coalesce(sum(pax) filter (where venue = 'restaurant'), 0)),
           'convention', jsonb_build_object('units', count(*) filter (where venue = 'convention'), 'pax', coalesce(sum(pax) filter (where venue = 'convention'), 0)),
           'none',       jsonb_build_object('units', count(*) filter (where venue is null),         'pax', coalesce(sum(pax) filter (where venue is null), 0)))
    into v_teams, v_total, v_cnt, v_by
  from units;

  return jsonb_build_object(
    'ok', true, 'date', v_d, 'today', v_today,
    'venue', v_venue.venue, 'start_time', v_venue.start_time, 'end_time', v_venue.end_time, 'note', v_venue.note,
    'total', v_total, 'units', v_cnt, 'teams', v_teams,
    'by_venue', v_by,
    'split', (coalesce((v_by->'restaurant'->>'units')::int,0) > 0 and coalesce((v_by->'convention'->>'units')::int,0) > 0));
end $$;
revoke execute on function public._signage_dinner_live(date) from public, anon;
grant  execute on function public._signage_dinner_live(date) to authenticated;

-- ── ② 홍보 안내(announcements.kind / screens) ───────────────────────────────────
alter table public.announcements add column if not exists kind text not null default 'notice';
alter table public.announcements add column if not exists screens text[] not null default array['lobby'];
do $$ begin
  if not exists (select 1 from pg_constraint where conname='announcements_kind_chk') then
    alter table public.announcements add constraint announcements_kind_chk check (kind in ('notice','promo'));
  end if;
end $$;

create or replace function public._signage_promos(p_screen text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'body', a.body, 'pinned', a.pinned)
           order by a.pinned desc, a.sort_order, a.created_at desc), '[]'::jsonb)
  from (select * from announcements
         where for_guests and kind = 'promo' and screens @> array[p_screen]
           and (pin_until is null or pin_until > now())
         order by pinned desc, sort_order, created_at desc limit 6) a;
$$;
revoke execute on function public._signage_promos(text) from public, anon;
grant  execute on function public._signage_promos(text) to authenticated;

-- ── ③ 숙소행 출발 시각(로비 출발 안내) ─────────────────────────────────────────
create table if not exists public.lobby_departures (
  id          uuid primary key default gen_random_uuid(),
  dep_date    date not null,
  dest        text not null check (dest in ('shizu','ganji','kuju')),
  depart_time time not null,
  note        text,
  updated_by  text,
  updated_at  timestamptz not null default now()
);
create unique index if not exists uq_lobby_departures on public.lobby_departures(dep_date, dest, depart_time);
alter table public.lobby_departures enable row level security;
drop policy if exists lobby_departures_sel on public.lobby_departures;
create policy lobby_departures_sel on public.lobby_departures for select to authenticated using (true);
drop policy if exists lobby_departures_wr on public.lobby_departures;
create policy lobby_departures_wr on public.lobby_departures for all to authenticated
  using (has_any_area(array['front','print','shizu'])) with check (has_any_area(array['front','print','shizu']));

-- ── ① 석식 anon 래퍼(공개 제어 + 홍보) ───────────────────────────────────────────
create or replace function public.signage_dinner(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_d date := coalesce(p_date, v_today);
  v_rel record;
  v_venue record;
  v_pr jsonb;
begin
  if v_d < v_today or v_d > v_today + 1 then
    return jsonb_build_object('date', v_d, 'ok', false, 'reason', 'out_of_range');
  end if;
  v_pr := jsonb_build_object('promos', _signage_promos('dinner'));
  select * into v_rel from signage_release where play_date = v_d and screen = 'dinner';
  if v_rel.mode = 'hidden' then
    select * into v_venue from dinner_venue where dinner_date = v_d;
    return jsonb_build_object('ok', true, 'date', v_d, 'today', v_today, 'released', false,
                              'venue', v_venue.venue, 'start_time', v_venue.start_time, 'end_time', v_venue.end_time, 'note', v_venue.note,
                              'total', 0, 'units', 0, 'teams', '[]'::jsonb, 'split', false,
                              'by_venue', jsonb_build_object('restaurant', jsonb_build_object('units',0,'pax',0), 'convention', jsonb_build_object('units',0,'pax',0), 'none', jsonb_build_object('units',0,'pax',0))) || v_pr;
  end if;
  if v_rel.mode = 'snapshot' and v_rel.payload is not null then
    return v_rel.payload || jsonb_build_object('today', v_today, 'released', true, 'released_at', v_rel.released_at) || v_pr;
  end if;
  return _signage_dinner_live(v_d) || jsonb_build_object('released', null) || v_pr;
end $$;
revoke execute on function public.signage_dinner(date) from public;
grant  execute on function public.signage_dinner(date) to anon, authenticated;

-- ── ⑤ 코스 anon 래퍼(146 그대로 + 홍보) ──────────────────────────────────────────
create or replace function public.signage_course(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_d date := coalesce(p_date, v_today);
  v_rel record;
  v_pr jsonb;
begin
  if v_d < v_today or v_d > v_today + 1 then
    return jsonb_build_object('date', v_d, 'ok', false, 'reason', 'out_of_range');
  end if;
  v_pr := jsonb_build_object('promos', _signage_promos('course'));
  select * into v_rel from signage_release where play_date = v_d and screen = 'course';
  if v_rel.mode = 'hidden' then
    return jsonb_build_object('ok', true, 'date', v_d, 'today', v_today, 'released', false,
                              'groups', '[]'::jsonb, 'total', 0, 'n', 0) || v_pr;
  end if;
  if v_rel.mode = 'snapshot' and v_rel.payload is not null then
    return v_rel.payload || jsonb_build_object('today', v_today, 'released', true, 'released_at', v_rel.released_at) || v_pr;
  end if;
  return _signage_course_live(v_d) || jsonb_build_object('released', null) || v_pr;
end $$;
revoke execute on function public.signage_course(date) from public;
grant  execute on function public.signage_course(date) to anon, authenticated;

-- ── ④ 로비 RPC 텍스트 치환(135/145 본문 그대로, 세 군데) ─────────────────────────
do $do$
declare v_src text;
begin
  select pg_get_functiondef('public.signage_lobby(date)'::regprocedure) into v_src;
  if position('lobby_departures' in v_src) > 0 then return; end if;   -- 이미 적용
  if position($a$where for_guests and (pin_until is null or pin_until > now())$a$ in v_src) = 0
     or position($a$'units', v_dinner->'units', 'by_venue', v_dinner->'by_venue')$a$ in v_src) = 0
     or position($a$'notices', v_notices);$a$ in v_src) = 0 then
    raise exception 'signage_lobby: anchor not found (135/145 body changed?)';
  end if;
  v_src := replace(v_src, $a$where for_guests and (pin_until is null or pin_until > now())$a$,
                          $a$where for_guests and coalesce(kind,'notice') = 'notice' and (pin_until is null or pin_until > now())$a$);
  v_src := replace(v_src, $a$'units', v_dinner->'units', 'by_venue', v_dinner->'by_venue')$a$,
                          $a$'units', v_dinner->'units', 'by_venue', v_dinner->'by_venue', 'released', v_dinner->'released', 'released_at', v_dinner->'released_at')$a$);
  v_src := replace(v_src, $a$'notices', v_notices);$a$,
                          $a$'notices', v_notices,
    'promos', _signage_promos('lobby'), 'wall_promos', _signage_promos('wall'),
    'lodging', (select coalesce(jsonb_agg(jsonb_build_object('date', ld.dep_date, 'dest', ld.dest, 'time', to_char(ld.depart_time, 'HH24:MI'), 'note', ld.note)
                                order by ld.dep_date, ld.depart_time, ld.dest), '[]'::jsonb)
                  from lobby_departures ld where ld.dep_date between v_d and v_d + 1));$a$);
  execute v_src;
end $do$;
revoke execute on function public.signage_lobby(date) from public;
grant  execute on function public.signage_lobby(date) to anon, authenticated;

-- ── ⑥ data_audit ⑮ — 공개본이 아닌 실시간을 재계산과 대조 ──────────────────────
do $do$
declare v_src text;
begin
  select pg_get_functiondef('public.data_audit()'::regprocedure) into v_src;
  if position('_signage_dinner_live(' in v_src) > 0 then return; end if;   -- 이미 적용
  if position('signage_dinner(' in v_src) = 0 then raise exception 'data_audit: signage_dinner anchor not found'; end if;
  v_src := replace(v_src, 'signage_dinner(', '_signage_dinner_live(');
  execute v_src;
end $do$;
revoke execute on function public.data_audit() from public, anon;
grant  execute on function public.data_audit() to authenticated;
