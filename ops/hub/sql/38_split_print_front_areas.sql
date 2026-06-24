-- ============================================================================
--  38_split_print_front_areas.sql — 권한 영역 분리: room → room / print / front
-- ----------------------------------------------------------------------------
--  · print = 네임택·航空カバー·現地手配書·夕食オーダー(레스토랑 명찰) 인쇄
--  · front = 프론트 데스크 통합 화면
--  · room  = 방배정·객실 재고·키택/체크인 (그대로)
--  영역 키는 user_access.areas(text[])에 자유 문자열 → 컬럼 변경 없음.
--  여기서는 ① print_overrides 쓰기 정책에 print 추가(아소·夕食 태그/인원 수정)
--           ② 기존 room 권한자에게 print·front 자동 승계(접근 연속성)만 처리.
--  멱등. ⚠ Supabase SQL Editor 수동 실행.
-- ============================================================================

-- ① print_overrides 쓰기 = room 또는 print (읽기 정책 sel은 그대로 유지)
do $$
declare pol record;
begin
  if to_regclass('public.print_overrides') is null then return; end if;
  for pol in select policyname from pg_policies
             where schemaname='public' and tablename='print_overrides'
               and policyname in ('print_overrides_ins','print_overrides_upd','print_overrides_del') loop
    execute format('drop policy if exists %I on public.print_overrides', pol.policyname);
  end loop;
  execute format('create policy print_overrides_ins on public.print_overrides for insert to authenticated with check (has_any_area(%L))', array['room','print']);
  execute format('create policy print_overrides_upd on public.print_overrides for update to authenticated using (has_any_area(%L)) with check (has_any_area(%L))', array['room','print'], array['room','print']);
  execute format('create policy print_overrides_del on public.print_overrides for delete to authenticated using (has_any_area(%L))', array['room','print']);
end $$;

-- ② 기존 room 권한자는 print·front 자동 승계(분리 후에도 인쇄·프론트 접근 유지).
--    이후 admin이 admin.html에서 개별 회수 가능. admin/manager는 영향 없음.
update user_access
   set areas = array(select distinct unnest(areas || array['print','front']))
 where 'room' = any(areas)
   and not (areas @> array['print','front']);
