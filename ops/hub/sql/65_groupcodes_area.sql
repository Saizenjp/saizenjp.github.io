-- ============================================================================
--  65_groupcodes_area.sql — 그룹코드/회원마스터 권한 영역화(admin→groupcodes)
-- ----------------------------------------------------------------------------
--  member_codes(회원 마스터·PII)를 admin 전용에서 'groupcodes' 영역 기반으로.
--    · 읽기 = has_any_read_area(['groupcodes'])  (admin 자동통과)
--    · 쓰기 = has_any_area(['groupcodes'])       (admin 자동통과)
--  ⚠ PII(성명·생년) 테이블 → admin.html에서 신뢰 담당자에게만 groupcodes 부여.
--  멱등. ⚠ Supabase SQL Editor 수동 실행 / MCP 적용.
-- ============================================================================

do $$
declare pol record;
begin
  if to_regclass('public.member_codes') is null then return; end if;
  for pol in select policyname from pg_policies
             where schemaname='public' and tablename='member_codes'
               and policyname in ('member_codes_sel','member_codes_ins','member_codes_upd','member_codes_del') loop
    execute format('drop policy if exists %I on public.member_codes', pol.policyname);
  end loop;
  execute format('create policy member_codes_sel on public.member_codes for select to authenticated using (has_any_read_area(%L))', array['groupcodes']);
  execute format('create policy member_codes_ins on public.member_codes for insert to authenticated with check (has_any_area(%L))', array['groupcodes']);
  execute format('create policy member_codes_upd on public.member_codes for update to authenticated using (has_any_area(%L)) with check (has_any_area(%L))', array['groupcodes'], array['groupcodes']);
  execute format('create policy member_codes_del on public.member_codes for delete to authenticated using (has_any_area(%L))', array['groupcodes']);
end $$;
