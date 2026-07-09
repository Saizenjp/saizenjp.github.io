-- ============================================================================
--  74_golf_area.sql — 골프 조편성 RLS를 'golf' 영역으로 강화
-- ----------------------------------------------------------------------------
--  26_golf.sql 은 개발단계로 authenticated 전체허용이었음 → 운영용으로 강화:
--    · 읽기 = 로그인 전체(조편성표 열람은 넓게)
--    · 쓰기 = golf 영역(+admin). golf_courses(마스터)는 쓰기도 golf 영역.
--  golf 영역은 admin.html AREA_KEYS·랜딩 카드 data-area 로 부여.
--  멱등. ⚠ 수동/MCP 적용.
-- ============================================================================

do $$
declare pol record; tbl text;
begin
  foreach tbl in array array['golf_courses','golf_groups','golf_group_members'] loop
    if to_regclass('public.'||tbl) is null then continue; end if;
    execute format('alter table public.%I enable row level security', tbl);
    for pol in select policyname from pg_policies where schemaname='public' and tablename=tbl loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (true)', tbl||'_sel', tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (has_any_area(%L))', tbl||'_ins', tbl, array['golf']);
    execute format('create policy %I on public.%I for update to authenticated using (has_any_area(%L)) with check (has_any_area(%L))', tbl||'_upd', tbl, array['golf'], array['golf']);
    execute format('create policy %I on public.%I for delete to authenticated using (has_any_area(%L))', tbl||'_del', tbl, array['golf']);
  end loop;
end $$;
