-- 82_data_audit.sql — 데이터 검수(정합성 이상징후 집계) RPC
--   목적: 실사용 전/인쇄 전에 데이터 이상(개인번호 결번·명단 불일치·중복·고아·정원초과)을
--         한 번에 스캔해 사전에 잡는다. admin(마스터) 전용(is_admin 가드).
--   반환: jsonb 배열 [{key, sev, count, samples:[{event_seq, detail}]}, ...]  (samples 최대 20)
--   멱등: create or replace.

create or replace function data_audit()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  res jsonb := '[]'::jsonb;
begin
  if not coalesce(is_admin(), false) then
    raise exception 'admin only';
  end if;

  -- ① 개인번호 결번 (guest_members.seq_in_team 이 팀별 1..N 연속이 아님)
  res := res || jsonb_build_object(
    'key','seq_gap','sev','warn',
    'count',(select count(*) from (
        select event_seq from guest_members
        group by event_seq having max(seq_in_team) <> count(*) or min(seq_in_team) <> 1) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select event_seq,
               coalesce(string_agg(distinct regexp_replace(person_tag,'-[0-9]+[A-Za-z]*$',''),','),'')
                 || ' · seq ' || string_agg(seq_in_team::text, ',' order by seq_in_team) as detail
        from guest_members
        group by event_seq having max(seq_in_team) <> count(*) or min(seq_in_team) <> 1
        order by event_seq limit 20) s)
  );

  -- ② 명단 수 불일치 (guest_members 인원 ≠ passengers 인원)
  res := res || jsonb_build_object(
    'key','count_mismatch','sev','warn',
    'count',(select count(*) from (
        select g.event_seq from (select event_seq, count(*) n from guest_members group by event_seq) g
        join (select event_seq, count(*) n from passengers group by event_seq) p using(event_seq)
        where g.n <> p.n) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select g.event_seq, ('명단 gm=' || g.n || ' / pax=' || p.n) as detail
        from (select event_seq, count(*) n from guest_members group by event_seq) g
        join (select event_seq, count(*) n from passengers group by event_seq) p using(event_seq)
        where g.n <> p.n
        order by g.event_seq limit 20) s)
  );

  -- ③ 팀 내 개인태그 중복 (같은 팀에 person_tag 값이 겹침)
  res := res || jsonb_build_object(
    'key','dup_tag','sev','warn',
    'count',(select count(*) from (
        select event_seq from guest_members
        group by event_seq
        having count(*) filter (where person_tag is not null) <> count(distinct person_tag)) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select event_seq, string_agg(person_tag, ',' order by person_tag) as detail
        from (
          select event_seq, person_tag
          from guest_members
          where person_tag is not null
          group by event_seq, person_tag having count(*) > 1) d
        group by event_seq
        order by event_seq limit 20) s)
  );

  -- ④ 고아 방배정 (rooms.member_id 가 guest_members 에 없음 = FK 끊김)
  res := res || jsonb_build_object(
    'key','orphan_room','sev','error',
    'count',(select count(*) from rooms r
        left join guest_members m on m.id = r.member_id
        where r.member_id is not null and m.id is null),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select r.event_seq, ('room ' || coalesce(r.room_no,'?') || ' · member_id=' || r.member_id) as detail
        from rooms r left join guest_members m on m.id = r.member_id
        where r.member_id is not null and m.id is null
        order by r.event_seq limit 20) s)
  );

  -- ⑤ 방 정원 초과(더블부킹) — 같은 객실·겹치는 밤의 배정 인원 합이 정원 초과(근사 스캔)
  res := res || jsonb_build_object(
    'key','room_over','sev','error',
    'count',(select count(*) from (
        select a.id
        from rooms a join room_inventory i on i.id = a.inventory_id
        where a.member_id is not null
          and (select coalesce(sum(b.assigned_pax),0) from rooms b
               where b.inventory_id = a.inventory_id and b.member_id is not null
                 and b.check_in < a.check_out and b.check_out > a.check_in) > i.max_capacity) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select a.event_seq,
               ('room ' || coalesce(i.room_no,'?') || ' · ' || a.check_in || '~' || a.check_out
                || ' · ' || (select coalesce(sum(b.assigned_pax),0) from rooms b
                     where b.inventory_id = a.inventory_id and b.member_id is not null
                       and b.check_in < a.check_out and b.check_out > a.check_in)
                || '/' || i.max_capacity || '名') as detail
        from rooms a join room_inventory i on i.id = a.inventory_id
        where a.member_id is not null
          and (select coalesce(sum(b.assigned_pax),0) from rooms b
               where b.inventory_id = a.inventory_id and b.member_id is not null
                 and b.check_in < a.check_out and b.check_out > a.check_in) > i.max_capacity
        order by a.event_seq limit 20) s)
  );

  return res;
end $$;

revoke all on function data_audit() from anon;
grant execute on function data_audit() to authenticated;
