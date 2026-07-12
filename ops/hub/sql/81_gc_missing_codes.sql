-- ============================================================================
--  81_gc_missing_codes.sql — 코드 미보유 회원 검출 RPC (회원마스터 업로드 폐지 대체)
-- ----------------------------------------------------------------------------
--  엠클릭 「직위」(태그코드)를 더 이상 안 채우고 「회원권구분」만 등록하는 방침 →
--  step1로 들어온 passengers 중 회원신호(고객등급T/회원권구분V/회원구분U)는 있으나
--  member_codes에 태그코드(code)가 없는 사람(전체 기간)을 검출해 groupcodes에서 검수·배정.
--  회원 판정 = 3컬럼 OR(공란/'일반'/'비회원' 제외). member_key = 이름+생년6.
--  admin 전용(passengers PII). 멱등. ⚠ 수동/MCP 적용(적용 완료).
-- ============================================================================

create or replace function public.gc_missing_codes()
returns table(member_key text, name_kr text, grade text, mem_class text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'admin only' using errcode='42501';
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
