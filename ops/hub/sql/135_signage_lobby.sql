-- ============================================================================
-- 135_signage_lobby.sql — 안내 모니터 ② 로비 화면 (환영판·출발 안내·석식·공지)
--
--  Min 2026-09 「이어서 진행」: 로비 TV 에 20~30초씩 돌아가는 화면.
--   · 환영판   = 오늘 체크인 팀(태그·대표·인원·숙소·출발공항·도착편 시각)
--   · 출발 안내 = 오늘·내일 귀국 팀을 便(항공편·시각)별로 묶고, 송영표 배차(transfer_dispatch)의
--                호텔 출발시각·차량을 붙인다 — 송영표에서 배차를 넣으면 로비에 그대로 뜬다.
--   · 석식     = signage_dinner(오늘) 요약(장소·시간·인원)
--   · 공지     = announcements 중 **손님 모니터 표시(for_guests)** 로 올린 것만(고정 기간 지나면 제외)
--  날씨는 화면이 Open-Meteo 를 직접 받는다(홈과 같은 좌표).
--
--  ⚠ 공개 장소 화면 — 방번호·연락처·생년은 어떤 항목에도 넣지 않는다. anon 허용, 오늘·내일 한정.
-- ============================================================================

alter table public.announcements add column if not exists for_guests boolean not null default false;

create or replace function public.signage_lobby(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_d date := coalesce(p_date, v_today);
  v_welcome jsonb; v_dep jsonb; v_notices jsonb; v_dinner jsonb;
  v_wpax int; v_wteams int;
begin
  if v_d < v_today or v_d > v_today + 1 then
    return jsonb_build_object('date', v_d, 'ok', false, 'reason', 'out_of_range');
  end if;

  -- ── 환영판: 그날 체크인 팀 ──────────────────────────────────────────────
  with tm as (
    select b.event_seq, b.rep_name, coalesce(b.pax, g.pax, 0) as pax, g.accom,
           coalesce(
             (select regexp_replace(gm.person_tag, '-([0-9]+)([A-Za-z]*)$', '-\2')
                from guest_members gm where gm.event_seq = b.event_seq and gm.person_tag is not null
                order by gm.is_rep desc, gm.seq_in_team limit 1),
             g.team_tag, g.group_code, '') as tag,
           (select p.dep_flight from passengers p where p.event_seq = b.event_seq and coalesce(p.dep_flight,'')<>'' order by p.id limit 1) as flight,
           (select p.loc_arr_time from passengers p where p.event_seq = b.event_seq and coalesce(p.loc_arr_time,'')<>'' order by p.id limit 1) as arr_time,
           b.origin, b.airline
    from bookings b join guests g on g.event_seq = b.event_seq
    where b.dep_date = v_d and coalesce(b.status,'') <> '대기' and coalesce(g.accom,'') <> ''
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tag', tag, 'rep', rep_name, 'pax', pax, 'accom', accom,
           'port', case when coalesce(flight,'') ilike 'ZE%' or coalesce(airline,'') ilike 'ZE%' then 'PUS'
                        when coalesce(flight,'') ilike 'TW%' or coalesce(airline,'') ilike 'TW%' then 'ICN'
                        when coalesce(origin,'') ~* '부산|김해|PUS|BUS|PNS' then 'PUS' else 'ICN' end,
           'flight', flight, 'time', arr_time)
           order by coalesce(arr_time,''), accom, tag, rep_name), '[]'::jsonb),
         coalesce(sum(pax),0)::int, count(*)::int
    into v_welcome, v_wpax, v_wteams
  from tm;

  -- ── 출발 안내: 그날 + 다음날 귀국 팀을 便별로 (송영표 groupByFlight 와 같은 키) ──
  with bk as (
    select b.event_seq, b.rep_name, b.arr_date, coalesce(b.pax, g.pax, 0) as pax, g.accom,
           coalesce(
             (select regexp_replace(gm.person_tag, '-([0-9]+)([A-Za-z]*)$', '-\2')
                from guest_members gm where gm.event_seq = b.event_seq and gm.person_tag is not null
                order by gm.is_rep desc, gm.seq_in_team limit 1),
             g.team_tag, g.group_code, '') as tag
    from bookings b join guests g on g.event_seq = b.event_seq
    where b.arr_date in (v_d, v_d + 1) and coalesce(b.status,'') <> '대기' and coalesce(g.accom,'') <> ''
  ),
  tf as (   -- 팀 × 便 (명단이 있으면 항공편별 인원, 없으면 예약 인원 한 줄)
    select bk.arr_date, bk.event_seq, bk.rep_name, bk.accom, bk.tag,
           coalesce(p.ret_flight,'') as flight, coalesce(p.ret_dep_time,'') as tm,
           coalesce(p.dest,'') as fr, coalesce(p.origin,'') as "to",
           case when count(p.id) > 0 then count(p.id) else max(bk.pax) end as pax
    from bk left join passengers p on p.event_seq = bk.event_seq
    group by bk.arr_date, bk.event_seq, bk.rep_name, bk.accom, bk.tag,
             coalesce(p.ret_flight,''), coalesce(p.ret_dep_time,''), coalesce(p.dest,''), coalesce(p.origin,'')
  ),
  fl as (
    select arr_date, flight, tm, fr, "to",
           jsonb_agg(jsonb_build_object('tag', tag, 'rep', rep_name, 'pax', pax, 'accom', accom) order by accom, tag) as teams,
           sum(pax)::int as pax, count(*)::int as teams_n
    from tf group by arr_date, flight, tm, fr, "to"
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', arr_date, 'flight', flight, 'time', tm, 'from', fr, 'to', "to",
           'pax', pax, 'teams_n', teams_n, 'teams', teams,
           'dispatch', (select coalesce(jsonb_agg(jsonb_build_object('vehicle', d.vehicle, 'depart', d.depart, 'dest', d.dest) order by d.depart, d.vehicle), '[]'::jsonb)
                          from transfer_dispatch d
                         where d.work_date = fl.arr_date and d.leg = 'out'
                           and d.grp_key = (case when fl.flight = '' then '-' else fl.flight end) || '|' || fl.tm))
           order by arr_date, tm, flight), '[]'::jsonb)
    into v_dep
  from fl;

  -- ── 손님 공지 ──────────────────────────────────────────────────────────
  select coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'body', a.body, 'pinned', a.pinned)
           order by a.pinned desc, a.sort_order, a.created_at desc), '[]'::jsonb)
    into v_notices
  from (select * from announcements
         where for_guests and (pin_until is null or pin_until > now())
         order by pinned desc, sort_order, created_at desc limit 8) a;

  v_dinner := signage_dinner(v_d);

  return jsonb_build_object(
    'ok', true, 'date', v_d, 'today', v_today,
    'welcome', v_welcome, 'welcome_pax', v_wpax, 'welcome_teams', v_wteams,
    'departures', v_dep,
    'dinner', jsonb_build_object('venue', v_dinner->'venue', 'start_time', v_dinner->'start_time', 'end_time', v_dinner->'end_time',
                                 'note', v_dinner->'note', 'total', v_dinner->'total', 'units', v_dinner->'units'),
    'notices', v_notices);
end $$;

revoke execute on function public.signage_lobby(date) from public;
grant  execute on function public.signage_lobby(date) to anon, authenticated;

-- ── data_audit ⑯ lobby_check (§3-3 검산 짝) — 함수 본문은 Supabase 적용본이 정본(134 의 ⑮ 뒤에 붙는다) ──
--   환영판 인원 = sum(bookings.pax) where dep_date=오늘 · 대기 제외 · 숙소 있음
--   출발 인원   = 팀별 passengers 행수(없으면 예약 인원) where arr_date in (오늘, 내일)
--   적용 시 실측: 9/6 환영판 19팀 73명 · 9/9~10 출발 220명 — RPC 와 재계산 일치.
