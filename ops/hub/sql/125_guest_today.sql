-- ============================================================================
--  125_guest_today.sql — 손님 QR 화면에 「오늘 라운딩」 (Min 2026-08)
-- ----------------------------------------------------------------------------
--  손님이 체크인 때 받은 QR 카드 하나로 청구 내역만이 아니라 그날 일정도
--  확인할 수 있게 한다. 첫 항목 = 골프(손님이 제일 자주 묻는 것 — 몇 시,
--  어느 코스, 몇 번 카트, 누구와).
--
--  guest_bill(121) 과 같은 구조 — 토큰 하나로 그 팀 것만. 체크아웃하면 만료.
--  ⚠ 토큰은 팀 단위다. 다른 팀 일정은 절대 나가지 않는다(조가 섞인 경우
--    같은 조에 든 사람 이름만 나간다 — 어차피 같은 카트로 함께 도는 사람).
--
--  홀수(9/18/27)는 담당자가 지정(golf_holes)했을 때만 넣는다. 규칙 계산은
--  SZCore.golfRows 가 단일 진실원이라 SQL 에 복제하지 않고, 화면이 dep/arr/
--  accom/origin 으로 직접 계산한다.
--
--  멱등. Supabase SQL Editor 또는 MCP apply_migration.
-- ============================================================================

create or replace function guest_today(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with t as (          -- 토큰 → 팀
    select ot.event_seq,
           b.arr_date, b.dep_date, b.rep_name, b.origin,
           coalesce(g.check_status,'')                  as cs,
           g.accom,
           coalesce(nullif(g.team_tag,''), g.group_code) as tag
    from order_tokens ot
    join bookings b on b.event_seq = ot.event_seq
    left join guests g on g.event_seq = ot.event_seq
    where ot.token = p_token
  ),
  v as (               -- 유효 토큰만(guest_bill 과 같은 만료 규칙)
    select * from t
    where cs <> '체크아웃'
      and (arr_date is null or current_date <= (arr_date + 7))
  ),
  d as (               -- 오늘·내일 = JST 기준
    select (now() at time zone 'Asia/Tokyo')::date as d0
  ),
  fl as (              -- 출발 항공편(첫 승객) → 화면이 SZCore.isPus 로 PUS/ICN 판정
    select p.origin as p_origin, p.dep_flight
    from passengers p
    where p.event_seq in (select event_seq from v)
    order by p.seq_in_team nulls last
    limit 1
  ),
  grp as (             -- 그 팀이 든 조(오늘·내일). 주 팀이거나 팀원이 들어 있으면 그 조.
    select gg.id, gg.play_date, gg.course_code, gg.tee_time, gg.slot_no, gg.cart_no
    from golf_groups gg
    where gg.play_date between (select d0 from d) and ((select d0 from d) + 1)
      and ( gg.event_seq in (select event_seq from v)
            or exists (select 1 from golf_group_members m
                       where m.group_id = gg.id
                         and m.event_seq in (select event_seq from v)) )
  ),
  mem as (             -- 같은 조 사람(이름·자기 팀인지·불참인지)
    select m.group_id,
           jsonb_agg(jsonb_build_object(
             'name', coalesce(nullif(gm.name_kr,''), gm.name_en, ''),
             'own',  (m.event_seq in (select event_seq from v)),
             'absent', exists (select 1 from golf_absentees ab
                               where ab.member_id = m.member_id
                                 and ab.play_date = g2.play_date)
           ) order by m.seq nulls last) as members
    from golf_group_members m
    join grp g2 on g2.id = m.group_id
    left join guest_members gm on gm.id = m.member_id
    group by m.group_id
  ),
  rounds as (
    select g.play_date,
           jsonb_agg(jsonb_build_object(
             'course_code', g.course_code,
             'course_ko',   gc.name_ko,
             'course_ja',   gc.name_ja,
             'tee_time',    g.tee_time,
             'slot_no',     g.slot_no,
             'cart_no',     g.cart_no,
             'members',     coalesce(mem.members, '[]'::jsonb)
           ) order by g.tee_time nulls last, g.slot_no) as rows
    from grp g
    left join golf_courses gc on gc.code = g.course_code
    left join mem on mem.group_id = g.id
    group by g.play_date
  ),
  days as (            -- 오늘·내일 두 칸을 항상 만든다(조가 없어도 '미확정'을 보여야 함)
    select jsonb_agg(jsonb_build_object(
             'date',  dd.dt,
             'skip',  exists (select 1 from golf_skips sk
                              where sk.play_date = dd.dt
                                and sk.event_seq in (select event_seq from v)),
             'holes', (select gh.holes from golf_holes gh
                       where gh.play_date = dd.dt
                         and gh.event_seq in (select event_seq from v) limit 1),
             'rounds', coalesce((select r.rows from rounds r where r.play_date = dd.dt), '[]'::jsonb)
           ) order by dd.dt) as list
    from (select (select d0 from d) as dt union all select (select d0 from d) + 1) dd
  )
  select case
    when not exists(select 1 from t) then jsonb_build_object('ok', false)
    when not exists(select 1 from v) then jsonb_build_object('ok', false, 'expired', true)
    else jsonb_build_object(
      'ok', true,
      'rep_name',  (select rep_name from v),
      'tag',       (select tag from v),
      'accom',     (select accom from v),
      'dep_date',  (select dep_date from v),
      'arr_date',  (select arr_date from v),
      'origin',    coalesce((select p_origin from fl), (select origin from v)),
      'dep_flight',(select dep_flight from fl),
      'today',     (select d0 from d),
      'days',      (select list from days)
    ) end;
$$;

--  ⚠ 함수 EXECUTE 는 기본이 PUBLIC 이다(118·119) — revoke from public 이 먼저다.
revoke execute on function guest_today(text) from public;
grant  execute on function guest_today(text) to anon, authenticated;

-- 확인:
--   select guest_today('<체류중 팀 토큰>')->'days';
