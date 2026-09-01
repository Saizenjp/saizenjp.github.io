-- ============================================================================
-- 129_audit_stay_gap.sql  —  데이터 검수 ⑦ 「방배정이 예약 체류를 못 덮는 팀」
--
--  왜 필요한가: 예약이 4박인데 방배정이 3박으로 들어가 있어도 **아무 데서도 안 걸렸다**
--  (전은자·이기천 팀, 2026-08-30 시즈노야도 — 마지막 1박이 통째로 비어 있었다).
--  방배정은 예약을 자동으로 따라가지 않는다. 예약이 늘어나도, 처음 넣을 때 하루를 놓쳐도
--  그대로 남는다. 손님이 도착해서야 「잘 방이 없다」로 드러난다.
--
--  판정: 배정이 **하나라도 있는** 팀 중, 예약 마지막 밤(arr_date-1)을 덮는 방이 없는 팀.
--   · 배정이 아예 없는 팀은 제외 — 그건 「미배정」이라 방배정 화면에 이미 보인다.
--   · 지난 날짜는 제외(이미 지나간 일은 고칠 것이 없다).
--   · 콤보·장기 상품도 마지막 밤은 어딘가에서 자야 하므로 같은 기준으로 본다.
--     **앞 구간이 다른 숙소라 비어 있는 것은 정상이므로 앞부분은 보지 않는다.**
--     (실측: 류석호·권준희·김태영은 앞 구간만 비어 있어 걸리지 않는다.)
--
--  ⚠ 이 파일에는 data_audit() **전문**이 들어 있다(적용본과 동일).
--     82·121 처럼 「발췌만」 두면 파일만 보고는 재적용이 안 되고,
--     재적용하면 그 뒤에 붙은 점검이 사라진다.
--
--  ⚠ RPC 권한 함정(§119): Postgres 는 함수 EXECUTE 를 기본으로 PUBLIC 에 준다 →
--     revoke from public + grant to authenticated 를 반드시 같이 한다.
--
--  멱등(create or replace). Supabase SQL Editor 수동 실행 가능(MCP 적용 완료 2026-09).
-- ============================================================================
create or replace function public.data_audit()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  res jsonb := '[]'::jsonb;
begin
  if not coalesce(is_admin(), false) then
    raise exception 'admin only';
  end if;

  -- ① 개인번호 결번(seq_in_team 이 1..N 이 아님)
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

  -- ② 명단수 불일치(guest_members ≠ passengers)
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

  -- ③ 팀 안 태그 중복
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

  -- ④ 고아 방배정(FK 끊김)
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

  -- ⑤ 방 정원 초과(더블부킹)
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

  -- ⑥ 같은 회원이 생년만 달라 두 번 등록(이름+코드가 같으면 사실상 동일인) — 121
  res := res || jsonb_build_object(
    'key','member_dup','sev','warn',
    'count',(select count(*) from (
        select name_kr, code from member_codes
        where code is not null and name_kr is not null
        group by name_kr, code having count(*) > 1) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',0,'detail',detail)),'[]'::jsonb) from (
        select (name_kr || ' · ' || code || ' · 생년 '
                || string_agg(right(member_key,6), ' / ' order by member_key)) as detail
        from member_codes
        where code is not null and name_kr is not null
        group by name_kr, code having count(*) > 1
        order by name_kr limit 20) s)
  );

  -- ⑦ 방배정이 예약 마지막 밤을 못 덮는 팀 (전은자·이기천 사례 재발 방지) — 129
  res := res || jsonb_build_object(
    'key','stay_gap','sev','error',
    'count',(select count(*) from (
        select b.event_seq
        from bookings b
        where b.arr_date > current_date
          and b.arr_date > b.dep_date
          and exists (select 1 from rooms r where r.event_seq = b.event_seq and r.member_id is not null)
          and not exists (select 1 from rooms r
                          where r.event_seq = b.event_seq and r.member_id is not null
                            and r.check_in <= b.arr_date - 1 and r.check_out > b.arr_date - 1)) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select b.event_seq,
               (coalesce(b.rep_name,'') || ' · 예약 ' || b.dep_date || '~' || b.arr_date
                || '(' || (b.arr_date - b.dep_date) || '박) · 배정 '
                || (select min(r.check_in)::text from rooms r where r.event_seq=b.event_seq and r.member_id is not null)
                || '~'
                || (select max(r.check_out)::text from rooms r where r.event_seq=b.event_seq and r.member_id is not null)
                || ' · 마지막 '
                || (b.arr_date - (select max(r.check_out) from rooms r where r.event_seq=b.event_seq and r.member_id is not null))
                || '박 빔') as detail
        from bookings b
        where b.arr_date > current_date
          and b.arr_date > b.dep_date
          and exists (select 1 from rooms r where r.event_seq = b.event_seq and r.member_id is not null)
          and not exists (select 1 from rooms r
                          where r.event_seq = b.event_seq and r.member_id is not null
                            and r.check_in <= b.arr_date - 1 and r.check_out > b.arr_date - 1)
        order by b.dep_date limit 20) s)
  );

  return res;
end $function$;

-- RPC 권한(§119 함정): Postgres 는 EXECUTE 를 기본으로 PUBLIC 에 준다 → 미로그인도 부를 수 있다.
revoke execute on function public.data_audit() from public;
grant  execute on function public.data_audit() to authenticated;
