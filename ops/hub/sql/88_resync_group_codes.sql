-- ============================================================================
--  88_resync_group_codes.sql — 저장된 예약 태그를 member_codes 최신 회원코드로 재동기화
-- ----------------------------------------------------------------------------
--  문제: 그룹코드/태그(guests.group_code·team_tag, guest_members.person_tag)는
--        step1 임포트 시점에 계산·저장되어 고정된다. 이후 member_codes(회원코드)를
--        고쳐도 이미 임포트된 예약엔 소급 반영되지 않아, 회원인데 F풀 태그가 남는다.
--  해결: 대표(booking.rep_name + 대표 birth6)의 member_key가 member_codes(code not null)에
--        있고 현재 group_code와 다르면, 최신 회원코드로 태그를 다시 찍는다.
--        태그 규칙(step1 동일): team_tag=code-accomPfx / person_tag=code-{seq}accomPfx.
--  게이트: admin 또는 groupcodes 영역. security definer(guests/guest_members RLS 우회, 게이트 보호).
--  호출: 클라이언트(로그인 사용자)에서 supabase.rpc('resync_group_codes',{p_ym:null}).
--        groupcodes.html이 진입 1회 + 회원코드 배정/변경 직후 자동 호출(버튼 없음).
--  ⚠ MCP apply_migration으로 적용 완료. 멱등(create or replace).
-- ============================================================================
create or replace function public.resync_group_codes(p_ym text default null)
returns integer
language plpgsql security definer set search_path=public as $$
declare n_teams int := 0;
begin
  if not (coalesce(public.is_admin(),false) or public.has_any_area(array['groupcodes'])) then
    raise exception 'groupcodes area required' using errcode='42501';
  end if;

  drop table if exists _rs;
  create temp table _rs on commit drop as
  with rep as (
    select b.event_seq, btrim(b.rep_name) as rep_name, g.accom_prefix, g.group_code as cur_code,
      (select p.birth_yymmdd from passengers p
         where p.event_seq=b.event_seq and btrim(p.name_kr)=btrim(b.rep_name)
         order by p.seq_in_team limit 1) as birth6
    from bookings b join guests g on g.event_seq=b.event_seq
    where (p_ym is null or g.session_ym=p_ym)
  )
  select r.event_seq, r.accom_prefix, r.cur_code, mc.code as new_code
  from rep r
  join member_codes mc
    on mc.member_key = (r.rep_name || coalesce(r.birth6,'')) and mc.code is not null
  where coalesce(r.birth6,'')<>'' and mc.code is distinct from r.cur_code;

  select count(*) into n_teams from _rs;

  update guests g
     set group_code=r.new_code, team_tag=r.new_code||'-'||r.accom_prefix
  from _rs r where g.event_seq=r.event_seq;

  update guest_members gm
     set person_tag=r.new_code||'-'||sub.num||r.accom_prefix
  from _rs r
  join (select event_seq, id, row_number() over(partition by event_seq order by seq_in_team) as num
          from guest_members) sub on sub.event_seq=r.event_seq
  where gm.id=sub.id;

  return n_teams;
end $$;
revoke all on function public.resync_group_codes(text) from public, anon;
grant execute on function public.resync_group_codes(text) to authenticated;
