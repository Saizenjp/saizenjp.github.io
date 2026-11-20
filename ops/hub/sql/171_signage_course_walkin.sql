-- 171_signage_course_walkin.sql — 손님용 코스 화면(실시간)에 당일 골프 손님의 이름을 낸다 + 전기카트 대수 식 정정
--
-- ⚠ 파일만 — 적용 전. Min 승인 뒤 적용한다(MCP apply_migration 또는 SQL Editor). 다시 실행해도 같은 결과(create or replace).
--
-- 왜
--   ① SQL 168(2026-11-13 적용) 뒤로 당일 골프 손님(walkins) 조가 golf_groups 에 저장된다. 그런데 손님용 코스 화면의
--      실시간 본체 `_signage_course_live` 는 대표 이름을 bookings 에서만 읽고, 당일 손님 여부를 `event_seq is null` 로 본다
--      (golf_groups.event_seq 는 NOT NULL 이라 늘 false). 그래서 당일 손님 조는 이름 없이 저장한 직원 화면 언어의
--      라벨(「当日」「당일」「Day」)로만 나온다 — 두 팀이면 어느 줄이 누구인지 알 수 없다.
--      코스 배정표에서 「공개(스냅샷)」한 날은 「○○様チーム」로 나오므로 두 방식의 표시가 달랐다.
--      → walkins 를 붙여 rep = coalesce(예약 대표, 당일 손님 이름), walkin = 「walkins 에 있는 번호」.
--        접수 때 이름을 받지 않은 당일 손님은 종전처럼 라벨로 나온다. 화면(signage.html) 수정은 필요 없다.
--   ② 전기카트 대수 `ev_qty` 가 `qty - cancelled` 였다. cart_bookings.qty 는 취소분을 이미 뺀 「남은 신청 대수」다
--      (SQL 95·100 머리말) — 한 번 더 빼면 부분 취소한 팀의 대수가 적게 나온다. → `qty` 그대로.
--      (취소가 기록된 신청은 지금 0건이라 표시가 달라지는 팀은 없다. 전체 검수 8차에서 넘긴 항목.)
--
-- 바꾸는 것: 함수 `_signage_course_live(date)` 본문 4곳뿐(147 의 본문 = 2026-11-20 운영 DB 본문과 md5 일치 확인).
-- 바꾸지 않는 것: 래퍼 `signage_course`(148) · 권한(로그인 전용, anon 실행 함수 수 15 그대로) · 표·정책.
-- 적용 뒤 확인: 00_VERIFY 171 행.

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
           coalesce(b.rep_name, w.name) as rep_name, (w.event_seq is not null) as is_walkin,
           coalesce(
             (select regexp_replace(gm.person_tag, '-([0-9]+)([A-Za-z]*)$', '-\2')
                from guest_members gm where gm.event_seq = gg.event_seq and gm.person_tag is not null
                order by gm.is_rep desc, gm.seq_in_team limit 1),
             gs.team_tag, gs.group_code, gg.label, '') as tag,
           (select count(*) from golf_group_members m
              where m.group_id = gg.id
                and not exists (select 1 from golf_absentees a where a.play_date = gg.play_date and a.member_id = m.member_id)) as mem_n,
           coalesce((select sum(coalesce(cb.qty,0)) from cart_bookings cb
                      where cb.play_date = gg.play_date and cb.event_seq = gg.event_seq and cb.cart_code = 'electric'), 0) as ev_qty
    from golf_groups gg
    left join bookings b on b.event_seq = gg.event_seq
    left join walkins w on w.event_seq = gg.event_seq
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
           'pax', pax, 'gno', gno, 'walkin', is_walkin,
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
