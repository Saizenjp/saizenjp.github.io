-- ============================================================================
--  87_gc_missing_codes_area.sql — gc_missing_codes 권한을 admin 전용 → groupcodes 영역 허용
-- ----------------------------------------------------------------------------
--  기존 81은 게이트가 is_admin() 하드코딩이라 groupcodes 영역만 가진 담당자는
--  "코드 미보유 회원" 패널에서 "admin only" 에러가 났다.
--  groupcodes 페이지·랜딩·member_codes RLS(65)는 이미 groupcodes 영역 기반이므로,
--  이 RPC도 admin 또는 groupcodes '보기' 권한자면 통과하도록 맞춘다.
--    · 게이트 = is_admin() OR has_any_read_area(['groupcodes'])
--    · 실제 코드 배정(쓰기)은 member_codes RLS(65, has_any_area=쓰기영역)가 별도로 막는다.
--  멱등(create or replace). 반환·본문은 81과 동일, 게이트만 변경.
--  ⚠ Supabase 대시보드 SQL Editor에서 수동 실행(또는 MCP apply_migration).
-- ============================================================================

create or replace function public.gc_missing_codes()
returns table(member_key text, name_kr text, grade text, mem_class text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not (coalesce(public.is_admin(), false)
          or public.has_any_read_area(array['groupcodes'])) then
    raise exception 'groupcodes area required' using errcode='42501';
  end if;
  return query
  with mem_pax as (
    select distinct
      (trim(p.name_kr)||coalesce(p.birth_yymmdd,'')) as mkey,
      trim(p.name_kr) as nm,
      nullif(trim(coalesce(p.member_class,'')),'') as mclass,
      nullif(trim(coalesce(p.member_grade,'')),'') as mgrade
    from passengers p
    where trim(coalesce(p.name_kr,''))<>'' and coalesce(p.birth_yymmdd,'')<>''
      and (
        (coalesce(p.member_grade,'')<>'' and p.member_grade !~ '일반|비회원')
        or (coalesce(p.member_class,'')<>'' and p.member_class !~ '일반|비회원')
        or (coalesce(p.member_div,'')<>''   and p.member_div   !~ '일반|비회원')
      )
  )
  select mp.mkey, mp.nm, coalesce(mp.mclass, mp.mgrade), mp.mclass
  from mem_pax mp
  where not exists (select 1 from member_codes mc where mc.member_key=mp.mkey and mc.code is not null)
  order by mp.nm;
end;
$$;
revoke all on function public.gc_missing_codes() from public, anon;
grant execute on function public.gc_missing_codes() to authenticated;
