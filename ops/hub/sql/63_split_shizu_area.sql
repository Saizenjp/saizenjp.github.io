-- ============================================================================
--  63_split_shizu_area.sql — 권한 영역 분리: print → print / shizu(志津の宿)
-- ----------------------------------------------------------------------------
--  志津の宿 予約表(shizu.html)를 print(인쇄) 영역에서 떼어 독립 영역 shizu로.
--    · shizu = 志津の宿 客室予約表 + 別棟温泉 事前申請(shizu_onsen)
--    · print = 네임택·航空カバー·現地手配書·夕食オーダー·주문QR (그대로)
--  영역 키는 user_access.areas/read_areas(text[])에 자유 문자열 → 컬럼 변경 없음.
--  여기서는 ① shizu_onsen 쓰기 정책을 room·shizu 로 교체(기존 room 유지, print 제거)
--           ② 기존 print 권한자에게 shizu 자동 승계(접근 연속성)만 처리.
--  멱등. ⚠ Supabase SQL Editor 수동 실행 / MCP 적용.
-- ============================================================================

-- ① shizu_onsen 쓰기 = room 또는 shizu (읽기 sel=로그인 전체 그대로 유지)
do $$
declare pol record;
begin
  if to_regclass('public.shizu_onsen') is null then return; end if;
  for pol in select policyname from pg_policies
             where schemaname='public' and tablename='shizu_onsen'
               and policyname in ('shizu_onsen_ins','shizu_onsen_upd','shizu_onsen_del') loop
    execute format('drop policy if exists %I on public.shizu_onsen', pol.policyname);
  end loop;
  execute format('create policy shizu_onsen_ins on public.shizu_onsen for insert to authenticated with check (has_any_area(%L))', array['room','shizu']);
  execute format('create policy shizu_onsen_upd on public.shizu_onsen for update to authenticated using (has_any_area(%L)) with check (has_any_area(%L))', array['room','shizu'], array['room','shizu']);
  execute format('create policy shizu_onsen_del on public.shizu_onsen for delete to authenticated using (has_any_area(%L))', array['room','shizu']);
end $$;

-- ② 기존 print 권한자는 shizu 자동 승계(분리 후에도 志津の宿 접근 유지).
--    이후 admin이 admin.html에서 개별 회수 가능. admin/manager는 페이지 가드 규칙대로.
update user_access
   set areas = array(select distinct unnest(areas || array['shizu']))
 where 'print' = any(areas) and not ('shizu' = any(areas));

update user_access
   set read_areas = array(select distinct unnest(coalesce(read_areas,'{}') || array['shizu']))
 where 'print' = any(coalesce(read_areas,'{}')) and not ('shizu' = any(coalesce(read_areas,'{}')));
