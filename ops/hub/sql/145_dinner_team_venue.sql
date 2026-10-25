-- ============================================================================
-- 145_dinner_team_venue.sql — 석식 팀별 장소(2단계, Min 2026-10-25 「그대로 진행해」)
-- ----------------------------------------------------------------------------
--  석식은 레스토랑 / 컨벤션홀 두 곳으로 **팀별로** 나눠 배정된다(8명 같은 단체는 컨벤션이 많다 — Min).
--  날짜 기본 장소(dinner_venue, 134) 위에 팀별 예외를 둔다.
--  ① dinner_team_venue — (날짜, 행사번호) → 장소. 「기본」으로 되돌리면 행 삭제. 쓰기 = print·front·kitchen(134 와 동일).
--  ② signage_dinner — 팀 줄마다 venue(팀별 지정 → 없으면 날짜 장소) + by_venue(장소별 팀·인원) + split.
--     묶음(team_group)은 대표 팀의 지정을 따른다(화면은 묶음 전체에 같은 값을 쓴다).
--  ③ signage_lobby — dinner 요약에 by_venue 를 같이 넘긴다(로비 석식 요약이 두 장소를 표시).
--  ④ data_audit ⑮ dinner_check — 장소별 합계도 다른 모양의 쿼리로 재계산·대조(§3-3).
--  anon 실행 함수는 그대로 12개(signage_dinner·signage_lobby 는 이미 anon). 멱등. MCP 적용 2026-10-25.
-- ============================================================================
create table if not exists public.dinner_team_venue (
  dinner_date date   not null,
  event_seq   bigint not null references public.bookings(event_seq) on delete cascade,
  venue       text   not null check (venue in ('restaurant','convention')),
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (dinner_date, event_seq)
);
create index if not exists idx_dinner_team_venue_day on public.dinner_team_venue(dinner_date);
alter table public.dinner_team_venue enable row level security;
drop policy if exists dinner_team_venue_sel on public.dinner_team_venue;
create policy dinner_team_venue_sel on public.dinner_team_venue for select to authenticated using (true);
drop policy if exists dinner_team_venue_ins on public.dinner_team_venue;
create policy dinner_team_venue_ins on public.dinner_team_venue for insert to authenticated
  with check (has_any_area(array['print','front','kitchen']));
drop policy if exists dinner_team_venue_upd on public.dinner_team_venue;
create policy dinner_team_venue_upd on public.dinner_team_venue for update to authenticated
  using (has_any_area(array['print','front','kitchen'])) with check (has_any_area(array['print','front','kitchen']));
drop policy if exists dinner_team_venue_del on public.dinner_team_venue;
create policy dinner_team_venue_del on public.dinner_team_venue for delete to authenticated
  using (has_any_area(array['print','front','kitchen']));
drop trigger if exists dinner_team_venue_updated on public.dinner_team_venue;
create trigger dinner_team_venue_updated before update on public.dinner_team_venue
  for each row execute function set_updated_at();

-- ── ② 모니터용 RPC(134 본문 + 팀별 장소) ─────────────────────────────────────
create or replace function public.signage_dinner(p_date date default null)
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
  if v_d < v_today or v_d > v_today + 1 then
    return jsonb_build_object('date', v_d, 'ok', false, 'reason', 'out_of_range');
  end if;

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

revoke execute on function public.signage_dinner(date) from public;
grant  execute on function public.signage_dinner(date) to anon, authenticated;

-- ── ③ 로비 석식 요약에 by_venue 동봉(135 본문은 그대로, 한 줄만 바꾼다) ─────────────
do $do$
declare v_src text;
begin
  select pg_get_functiondef('public.signage_lobby(date)'::regprocedure) into v_src;
  if position($o$'units', v_dinner->'units')$o$ in v_src) = 0 then
    raise exception 'signage_lobby: anchor not found (135 body changed?)';
  end if;
  if position('by_venue' in v_src) = 0 then
    v_src := replace(v_src, $o$'units', v_dinner->'units')$o$, $n$'units', v_dinner->'units', 'by_venue', v_dinner->'by_venue')$n$);
    execute v_src;
  end if;
end $do$;
revoke execute on function public.signage_lobby(date) from public;
grant  execute on function public.signage_lobby(date) to anon, authenticated;

-- ── ④ data_audit ⑮ dinner_check — 장소별 합계 대조 추가 ─────────────────────
do $do$
declare v_src text; v_old text; v_new text;
begin
  select pg_get_functiondef('public.data_audit()'::regprocedure) into v_src;
  if position('장소별 · 레스토랑' in v_src) > 0 then return; end if;   -- 이미 적용
  v_old := $o$    res := res || jsonb_build_object(
      'key','dinner_check','sev','error',
      'count', case when v_sg = v_re then 0 else 1 end,
      'samples', jsonb_build_array(jsonb_build_object('event_seq',0,
          'detail', v_today||' · 모니터 '||v_sg||'명 / 재계산 '||v_re||'명 · '||case when v_sg=v_re then '일치' else '불일치' end)));$o$;
  v_new := $n$    -- 145: 장소별(레스토랑/컨벤션) 합계도 대조 — 팀별 장소(dinner_team_venue) 우선, 없으면 날짜 장소
    declare v_js jsonb; v_sr int; v_sc int; v_rr int; v_rc int;
    begin
      v_js := signage_dinner(v_today);
      v_sr := coalesce((v_js->'by_venue'->'restaurant'->>'pax')::int,0);
      v_sc := coalesce((v_js->'by_venue'->'convention'->>'pax')::int,0);
      select coalesce(sum(case when coalesce(tv.venue,dv.venue)='restaurant' then s.e else 0 end),0)::int,
             coalesce(sum(case when coalesce(tv.venue,dv.venue)='convention' then s.e else 0 end),0)::int
        into v_rr, v_rc
        from (select b.event_seq,
                     greatest(coalesce(b.pax,g.pax,0) - (select count(*) from guest_members gm where gm.event_seq=b.event_seq and gm.actual_dep<=v_today),0) as e
                from bookings b join guests g using(event_seq) left join print_overrides po using(event_seq)
               where b.dep_date<=v_today and b.arr_date>v_today and coalesce(b.status,'')<>'대기'
                 and coalesce(g.accom,'')<>'' and not coalesce(po.excluded,false)) s
        left join dinner_team_venue tv on tv.event_seq=s.event_seq and tv.dinner_date=v_today
        left join dinner_venue dv on dv.dinner_date=v_today;
      res := res || jsonb_build_object(
        'key','dinner_check','sev','error',
        'count', (case when v_sg = v_re then 0 else 1 end) + (case when v_sr=v_rr and v_sc=v_rc then 0 else 1 end),
        'samples', jsonb_build_array(
          jsonb_build_object('event_seq',0,'detail', v_today||' · 모니터 '||v_sg||'명 / 재계산 '||v_re||'명 · '||case when v_sg=v_re then '일치' else '불일치' end),
          jsonb_build_object('event_seq',0,'detail', '장소별 · 레스토랑 '||v_sr||'/'||v_rr||' · 컨벤션 '||v_sc||'/'||v_rc||' · '||case when v_sr=v_rr and v_sc=v_rc then '일치' else '불일치' end)));
    end;$n$;
  if position(v_old in v_src) = 0 then
    raise exception 'data_audit: dinner_check anchor not found (134 body changed?)';
  end if;
  v_src := replace(v_src, v_old, v_new);
  execute v_src;
end $do$;
revoke execute on function public.data_audit() from public, anon;
grant  execute on function public.data_audit() to authenticated;
