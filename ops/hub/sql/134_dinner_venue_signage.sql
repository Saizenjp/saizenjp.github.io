-- ============================================================================
-- 134_dinner_venue_signage.sql — 석식 장소(날짜별) + 안내 모니터 RPC
--
--  Min 2026-09: 로비·2층 엘리베이터 앞 모니터에 「오늘 석식」을 띄운다(인쇄는 그대로).
--  석식 장소는 레스토랑 / 컨벤션홀 두 곳 중 하나로 매일 바뀌는데 저장 자리가 없었다.
--
--  ① dinner_venue — 날짜 → 장소·시간. 夕食オーダー 화면(dinner.html)에서 날짜별로 정한다.
--     쓰기 = print · front · kitchen 영역(석식 오더를 다루는 사람), 읽기 = 로그인 전체.
--  ② signage_dinner(p_date) — 모니터용. **로그인 없이(anon)** 호출한다.
--     · 오늘·내일(JST)만 답한다 — 그 밖의 날짜는 빈 결과(연간 명단 덤프 방지).
--     · 돌려주는 것 = 장소·시간·기본 석식(요일) + 팀 줄(태그·대표자·인원·숙소). **방번호·연락처·생년 없음.**
--     · 인원 규칙 = 夕食オーダー 와 같다: 그날 묵는 팀(dep<=d<arr, 대기 제외, 숙소 있음)
--       − 夕食除外 팀 − 조기퇴실(actual_dep<=d) · 운영팀 묶음(team_group)은 한 줄로 합산.
--  ③ data_audit ⑮ dinner_check — signage_dinner(오늘) 합계를 다른 모양의 쿼리로 재계산해 대조(§3-3).
--
--  ⚠ 함수 EXECUTE 는 PUBLIC 기본 부여 → signage_dinner 만 anon 허용, 나머지는 회수(118·119 원칙).
-- ============================================================================

create table if not exists public.dinner_venue (
  dinner_date date primary key,
  venue       text not null check (venue in ('restaurant','convention')),
  start_time  text,            -- '18:00' (자유 입력, 표시 전용)
  end_time    text,            -- '20:00'
  note        text,            -- 모니터 한 줄 안내(선택)
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.dinner_venue enable row level security;

drop policy if exists dinner_venue_sel on public.dinner_venue;
create policy dinner_venue_sel on public.dinner_venue for select to authenticated using (true);
drop policy if exists dinner_venue_ins on public.dinner_venue;
create policy dinner_venue_ins on public.dinner_venue for insert to authenticated
  with check (has_any_area(array['print','front','kitchen']));
drop policy if exists dinner_venue_upd on public.dinner_venue;
create policy dinner_venue_upd on public.dinner_venue for update to authenticated
  using (has_any_area(array['print','front','kitchen'])) with check (has_any_area(array['print','front','kitchen']));
drop policy if exists dinner_venue_del on public.dinner_venue;
create policy dinner_venue_del on public.dinner_venue for delete to authenticated
  using (has_any_area(array['print','front','kitchen']));

drop trigger if exists dinner_venue_updated on public.dinner_venue;
create trigger dinner_venue_updated before update on public.dinner_venue
  for each row execute function set_updated_at();

-- ── ② 모니터용 RPC ───────────────────────────────────────────────────────────
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
begin
  -- 오늘·내일만(공개 화면 — 명단 덤프 방지)
  if v_d < v_today or v_d > v_today + 1 then
    return jsonb_build_object('date', v_d, 'ok', false, 'reason', 'out_of_range');
  end if;

  select * into v_venue from dinner_venue where dinner_date = v_d;

  with stay as (
    select b.event_seq, b.rep_name, b.dep_date, b.arr_date,
           coalesce(b.pax, g.pax, 0) as pax, g.accom,
           po.team_group, coalesce(po.team_group_rep, false) as tg_rep,
           coalesce(po.excluded, false) as excluded,
           -- 조기퇴실: 퇴실일 아침에 떠남 → actual_dep <= 그날 이면 석식 없음
           (select count(*) from guest_members gm
             where gm.event_seq = b.event_seq and gm.actual_dep is not null and gm.actual_dep <= v_d) as gone,
           (select regexp_replace(gm.person_tag, '-([0-9]+)([A-Za-z]*)$', '-\2')
              from guest_members gm where gm.event_seq = b.event_seq and gm.person_tag is not null
              order by gm.is_rep desc, gm.seq_in_team limit 1) as ptag,
           coalesce(g.team_tag, g.group_code) as gtag
    from bookings b
    join guests g on g.event_seq = b.event_seq
    left join print_overrides po on po.event_seq = b.event_seq
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
           -- 대표 = 手配書 지정(team_group_rep) → 없으면 가장 이른 행사번호
           (array_agg(rep_name order by tg_rep desc, event_seq))[1] as rep_name,
           (array_agg(coalesce(ptag, gtag, '') order by tg_rep desc, event_seq))[1] as tag,
           (array_agg(accom order by tg_rep desc, event_seq))[1] as accom,
           (array_agg(dep_date order by tg_rep desc, event_seq))[1] as dep_date,
           sum(eat_pax)::int as pax,
           count(*)::int as n_teams
    from eat
    group by unit_key
    having sum(eat_pax) > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tag', tag, 'rep', rep_name, 'pax', pax, 'accom', accom, 'teams', n_teams,
           'day', (v_d - dep_date) + 1)
           order by dep_date, accom, tag, rep_name), '[]'::jsonb),
         coalesce(sum(pax),0)::int, count(*)::int
    into v_teams, v_total, v_cnt
  from units;

  return jsonb_build_object(
    'ok', true, 'date', v_d, 'today', v_today,
    'venue', v_venue.venue, 'start_time', v_venue.start_time, 'end_time', v_venue.end_time, 'note', v_venue.note,
    'total', v_total, 'units', v_cnt, 'teams', v_teams);
end $$;

revoke execute on function public.signage_dinner(date) from public;
grant  execute on function public.signage_dinner(date) to anon, authenticated;
