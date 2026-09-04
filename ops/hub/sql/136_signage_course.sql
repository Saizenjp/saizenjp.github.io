-- ============================================================================
-- 136_signage_course.sql — 안내 모니터 ③ 코스 배정표 (signage.html?screen=course)
--
--  Min 2026-09 「코스 배정표 화면도 만들어줘」: 코스 입구·클럽하우스 TV 에 그날 組合せ表를 로그인 없이 띄운다.
--  기존 course.html?tv=1 은 로그인·golf 권한이 있어야 열려 무인 모니터에 맞지 않았다.
--   · signage_course(p_date) = 그날 golf_groups 를 코스×자리로 돌려준다(anon 허용, 오늘·내일 한정).
--     조마다 태그·대표자·인원(조원 수 − 불참, 조원 없으면 정원)·자리번호·티오프(tee_time 우선)·팀 내 조 번호(8명 팀 = 1組目/2組目).
--     그날 라운딩 안 하는 팀(golf_skips)·대기 예약은 뺀다. 당일 손님(event_seq 없음)은 label 로 나온다.
--   · data_audit ⑰ course_check = 모니터 인원 합계를 다른 모양의 쿼리로 재계산·대조(§3-3).
--  ⚠ 공개 화면 — 이름은 대표자만(組合せ表와 같은 수준), 방번호·연락처 없음.
-- ============================================================================

create or replace function public.signage_course(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_d date := coalesce(p_date, v_today);
  v_groups jsonb; v_total int; v_n int;
begin
  if v_d < v_today or v_d > v_today + 1 then
    return jsonb_build_object('date', v_d, 'ok', false, 'reason', 'out_of_range');
  end if;

  with g as (
    select gg.id, gg.course_code, gg.slot_no, gg.tee_time, gg.capacity, gg.label, gg.event_seq, gg.cart_no,
           b.rep_name,
           coalesce(
             (select regexp_replace(gm.person_tag, '-([0-9]+)([A-Za-z]*)$', '-\2')
                from guest_members gm where gm.event_seq = gg.event_seq and gm.person_tag is not null
                order by gm.is_rep desc, gm.seq_in_team limit 1),
             gs.team_tag, gs.group_code, gg.label, '') as tag,
           (select count(*) from golf_group_members m
              where m.group_id = gg.id
                and not exists (select 1 from golf_absentees a where a.play_date = gg.play_date and a.member_id = m.member_id)) as mem_n
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
           'pax', pax, 'gno', gno, 'walkin', event_seq is null)
           order by slot_no, course_code), '[]'::jsonb),
         coalesce(sum(pax),0)::int, count(*)::int
    into v_groups, v_total, v_n
  from g2;

  return jsonb_build_object('ok', true, 'date', v_d, 'today', v_today,
                            'groups', v_groups, 'total', v_total, 'n', v_n);
end $$;

revoke execute on function public.signage_course(date) from public;
grant  execute on function public.signage_course(date) to anon, authenticated;

-- ── data_audit ⑰ course_check (§3-3 검산 짝) — 함수 본문은 Supabase 적용본이 정본(135 의 ⑯ 뒤에 붙는다) ──
--   모니터 인원 합계 = Σ 조별(조원 수 − 불참, 없으면 정원) where play_date=오늘 · skip·대기 제외
