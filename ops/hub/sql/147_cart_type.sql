-- ============================================================================
-- 147_cart_type.sql — 카트 배정표 취합(Min 2026-10-26 「조당 카트 1대 · 전기 신청 팀=전기 · 그 외 4인승 · 2명=2인승 · 번호는 조별 하나로 통일」) — MCP 적용 2026-10-26(검증: cart_type 컬럼·live RPC cart_type·anon secdef 12)
-- ----------------------------------------------------------------------------
--  ① golf_groups.cart_type — 그 조에 배정한 카트 종류(electric | gas2 | gas4). 번호는 기존 cart_no(숫자 — 마샬 Ai 명단이 숫자만 쓴다).
--     번호의 단일 진실원 = golf_groups.cart_no(조별). 카트 관리표(cart.html)는 이 값을 읽어 보여 준다(임시 1..N 배분 폐지).
--     카트 번호 레지스트리 = cart_units(94, 종류별 번호·사용 가능 여부) — 실제 번호는 관리표 「카트 번호 등록」에서 입력(아직 미등록=1..N 자리표).
--  ② _signage_course_live — cart_type 을 같이 주고, ev 는 「전기 신청 있음 또는 배정 카트가 전기」로.
--  anon 실행 함수 12개 그대로(signage_course 본문 불변 — live 본체만 교체). 멱등.
-- ============================================================================
alter table public.golf_groups add column if not exists cart_type text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='golf_groups_cart_type_chk') then
    alter table public.golf_groups add constraint golf_groups_cart_type_chk check (cart_type is null or cart_type in ('electric','gas2','gas4'));
  end if;
end $$;

create or replace function public._signage_course_live(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_d date := coalesce(p_date, v_today);
  v_groups jsonb; v_total int; v_n int; v_ds record;
begin
  select * into v_ds from golf_day_settings where play_date = v_d;
  with g as (
    select gg.id, gg.course_code, gg.slot_no, gg.tee_time, gg.capacity, gg.label, gg.event_seq, gg.cart_no, gg.cart_type,
           gg.start_hole, gg.pm_tee, gg.pm_course, gg.lunch_after,
           b.rep_name,
           coalesce(
             (select regexp_replace(gm.person_tag, '-([0-9]+)([A-Za-z]*)$', '-\2')
                from guest_members gm where gm.event_seq = gg.event_seq and gm.person_tag is not null
                order by gm.is_rep desc, gm.seq_in_team limit 1),
             gs.team_tag, gs.group_code, gg.label, '') as tag,
           (select count(*) from golf_group_members m
              where m.group_id = gg.id
                and not exists (select 1 from golf_absentees a where a.play_date = gg.play_date and a.member_id = m.member_id)) as mem_n,
           coalesce((select sum(coalesce(cb.qty,0) - coalesce(cb.cancelled,0)) from cart_bookings cb
                      where cb.play_date = gg.play_date and cb.event_seq = gg.event_seq and cb.cart_code = 'electric'), 0) as ev_qty
    from golf_groups gg
    left join bookings b on b.event_seq = gg.event_seq
    left join guests gs on gs.event_seq = gg.event_seq
    where gg.play_date = v_d
      and gg.course_code is not null and gg.slot_no is not null
      and (gg.event_seq is not null or coalesce(gg.label,'') <> '')
      and coalesce(b.status,'') <> '대기'
      and not exists (select 1 from golf_skips sk where sk.play_date = gg.play_date and sk.event_seq = gg.event_seq)
  ),
  g2 as (
    select *, case when mem_n > 0 then mem_n else coalesce(capacity,0) end as pax,
           case when event_seq is null then 0
                when count(*) over (partition by event_seq) < 2 then 0
                else row_number() over (partition by event_seq order by slot_no, course_code) end as gno
    from g
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'course', course_code, 'slot', slot_no, 'tee', tee_time, 'tag', tag, 'rep', rep_name,
           'pax', pax, 'gno', gno, 'walkin', event_seq is null,
           'hole', start_hole, 'cart', cart_no, 'cart_type', cart_type,
           'ev', (ev_qty > 0 or cart_type = 'electric'), 'ev_qty', ev_qty,
           'pm_tee', pm_tee, 'pm_course', pm_course, 'lunch', lunch_after)
           order by slot_no, course_code), '[]'::jsonb),
         coalesce(sum(pax),0)::int, count(*)::int
    into v_groups, v_total, v_n
  from g2;

  return jsonb_build_object('ok', true, 'date', v_d, 'today', v_today,
                            'groups', v_groups, 'total', v_total, 'n', v_n,
                            'shotgun', coalesce(v_ds.shotgun, false), 'shotgun_time', v_ds.shotgun_time);
end $$;
revoke execute on function public._signage_course_live(date) from public, anon;
grant  execute on function public._signage_course_live(date) to authenticated;
