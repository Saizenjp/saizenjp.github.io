-- ============================================================================
-- 137_signage_office.sql — 안내 모니터 ④ 직원용 운영 현황 (signage.html?screen=office)
--
--  Min 2026-09 「계속 진행해 순차적으로」: 손님용 3화면(석식·로비·코스) 다음 = 사무실·프론트 뒤 TV 용 직원 화면.
--   · signage_office(p_date) = 오늘 하루의 진행 상황을 **숫자와 팀 태그만**으로 돌려준다(anon 허용, 오늘만).
--     체크인(도착 확인 n/m·미도착 태그) · 체크아웃(완료 n/m·미완료 태그) · 재실 · 오늘 도착인데 방 미배정 ·
--     주방 티켓(대기/조리중/완료) · 송영 승차 확인(in/out) · 석식(장소·인원) · 코스(조·인원·티오프 목록).
--   · 이름·방번호·금액·부서 공지 본문은 넣지 않는다 — 무인 TV 주소만 알면 누구나 볼 수 있기 때문(태그는 손님용 화면과 같은 수준).
--   · data_audit ⑱ office_check = 체크인·재실 인원을 다른 모양으로 재계산해 대조(§3-3).
-- ============================================================================

create or replace function public.signage_office(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_d date := coalesce(p_date, v_today);
  v_ci jsonb; v_co jsonb; v_stay jsonb; v_un jsonb; v_kt jsonb; v_tr jsonb; v_dn jsonb; v_cs jsonb;
begin
  if v_d <> v_today then
    return jsonb_build_object('date', v_d, 'ok', false, 'reason', 'today_only');
  end if;

  -- 체크인(오늘 도착) — 도착 확인 = guests.check_status 체크인/체크아웃
  with t as (
    select b.event_seq, coalesce(b.pax,g.pax,0) pax, g.check_status,
           coalesce((select regexp_replace(gm.person_tag,'-([0-9]+)([A-Za-z]*)$','-\2') from guest_members gm where gm.event_seq=b.event_seq and gm.person_tag is not null order by gm.is_rep desc, gm.seq_in_team limit 1), g.team_tag, g.group_code, '') tag
    from bookings b join guests g on g.event_seq=b.event_seq
    where b.dep_date=v_d and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>'')
  select jsonb_build_object('teams', count(*), 'pax', coalesce(sum(pax),0),
           'arrived', count(*) filter (where check_status in ('체크인','체크아웃')),
           'pending_tags', coalesce((select jsonb_agg(tag order by tag) from (select tag from t where check_status is null or check_status='체크인전' order by tag limit 40) x), '[]'::jsonb))
    into v_ci from t;

  -- 체크아웃(오늘 귀국)
  with t as (
    select b.event_seq, coalesce(b.pax,g.pax,0) pax, g.check_status,
           coalesce((select regexp_replace(gm.person_tag,'-([0-9]+)([A-Za-z]*)$','-\2') from guest_members gm where gm.event_seq=b.event_seq and gm.person_tag is not null order by gm.is_rep desc, gm.seq_in_team limit 1), g.team_tag, g.group_code, '') tag
    from bookings b join guests g on g.event_seq=b.event_seq
    where b.arr_date=v_d and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>'')
  select jsonb_build_object('teams', count(*), 'pax', coalesce(sum(pax),0),
           'done', count(*) filter (where check_status='체크아웃'),
           'pending_tags', coalesce((select jsonb_agg(tag order by tag) from (select tag from t where check_status is distinct from '체크아웃' order by tag limit 40) x), '[]'::jsonb))
    into v_co from t;

  -- 재실(오늘 밤 묵는 팀)
  select jsonb_build_object('teams', count(*), 'pax', coalesce(sum(coalesce(b.pax,g.pax,0)),0))
    into v_stay
    from bookings b join guests g on g.event_seq=b.event_seq
    where b.dep_date<=v_d and b.arr_date>v_d and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>'';

  -- 오늘 도착인데 오늘 밤 방이 없는 팀(야마나미·쿠주 등 방배정 대상 숙소만: rooms 가 관리하는 시설)
  with t as (
    select b.event_seq,
           coalesce((select regexp_replace(gm.person_tag,'-([0-9]+)([A-Za-z]*)$','-\2') from guest_members gm where gm.event_seq=b.event_seq and gm.person_tag is not null order by gm.is_rep desc, gm.seq_in_team limit 1), g.team_tag, g.group_code, '') tag
    from bookings b join guests g on g.event_seq=b.event_seq
    where b.dep_date=v_d and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>''
      and not exists (select 1 from rooms r where r.event_seq=b.event_seq and r.member_id is not null and r.check_in<=v_d and r.check_out>v_d))
  select jsonb_build_object('n', count(*), 'tags', coalesce(jsonb_agg(tag order by tag), '[]'::jsonb)) into v_un from t;

  -- 주방 티켓(오늘 JST)
  select jsonb_build_object('new', count(*) filter (where status='new'), 'accepted', count(*) filter (where status='accepted'), 'done', count(*) filter (where status='done'))
    into v_kt from kitchen_tickets where (created_at at time zone 'Asia/Tokyo')::date = v_d;

  -- 송영 승차 확인(팀 단위) — in=오늘 도착 팀, out=오늘 출발 팀
  select jsonb_build_object(
      'in_teams',  (select count(*) from bookings b join guests g using(event_seq) where b.dep_date=v_d and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>''),
      'in_done',   (select count(distinct ref) from transfer_checks where work_date=v_d and leg='in' and kind='team'),
      'out_teams', (select count(*) from bookings b join guests g using(event_seq) where b.arr_date=v_d and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>''),
      'out_done',  (select count(distinct ref) from transfer_checks where work_date=v_d and leg='out' and kind='team'))
    into v_tr;

  v_dn := signage_dinner(v_d);
  v_cs := signage_course(v_d);

  return jsonb_build_object('ok', true, 'date', v_d, 'today', v_today,
    'checkin', v_ci, 'checkout', v_co, 'staying', v_stay, 'unassigned', v_un, 'kitchen', v_kt, 'transfer', v_tr,
    'dinner', jsonb_build_object('venue', v_dn->'venue', 'start_time', v_dn->'start_time', 'end_time', v_dn->'end_time', 'total', v_dn->'total', 'units', v_dn->'units'),
    'course', jsonb_build_object('n', v_cs->'n', 'total', v_cs->'total',
                'tees', (select coalesce(jsonb_agg(distinct coalesce(x->>'tee', '')), '[]'::jsonb) from jsonb_array_elements(coalesce(v_cs->'groups','[]'::jsonb)) x),
                'slots', (select coalesce(jsonb_agg(distinct (x->>'slot')::int), '[]'::jsonb) from jsonb_array_elements(coalesce(v_cs->'groups','[]'::jsonb)) x)));
end $$;

revoke execute on function public.signage_office(date) from public;
grant  execute on function public.signage_office(date) to anon, authenticated;

-- ── data_audit ⑱ office_check (§3-3 검산 짝) — 함수 본문은 Supabase 적용본이 정본(136 의 ⑰ 뒤에 붙는다) ──
--   체크인 인원 = sum(bookings.pax) where dep_date=오늘 · 재실 인원 = 펼침(generate_series 없이 오늘 1일) 재계산
