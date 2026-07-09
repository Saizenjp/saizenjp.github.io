-- ============================================================================
--  70_shizu_closures.sql — 시즈노야도 예약표 객실 폐쇄를 shizu 영역도 가능하게
-- ----------------------------------------------------------------------------
--  room_closures(33) 쓰기가 room 전용이라, 시즈 담당자가 시즈 객실을 폐쇄할 수
--  있도록 시설 범위 한정으로 shizu 영역 허용(다른 시설은 여전히 room 전용).
--  읽기(sel=true)는 그대로. 멱등. ⚠ 수동/MCP 적용.
-- ============================================================================

do $$
declare pol record;
begin
  if to_regclass('public.room_closures') is null then return; end if;
  for pol in select policyname from pg_policies where schemaname='public' and tablename='room_closures'
             and policyname in ('room_closures_ins','room_closures_upd','room_closures_del') loop
    execute format('drop policy if exists %I on public.room_closures', pol.policyname);
  end loop;
  execute $p$create policy room_closures_ins on public.room_closures for insert to authenticated
    with check ( has_any_area(array['room'])
      or ( has_any_area(array['shizu']) and exists(select 1 from room_inventory i where i.id = room_closures.inventory_id and i.facility='시즈노야도 료칸') ) )$p$;
  execute $p$create policy room_closures_upd on public.room_closures for update to authenticated
    using ( has_any_area(array['room'])
      or ( has_any_area(array['shizu']) and exists(select 1 from room_inventory i where i.id = room_closures.inventory_id and i.facility='시즈노야도 료칸') ) )$p$;
  execute $p$create policy room_closures_del on public.room_closures for delete to authenticated
    using ( has_any_area(array['room'])
      or ( has_any_area(array['shizu']) and exists(select 1 from room_inventory i where i.id = room_closures.inventory_id and i.facility='시즈노야도 료칸') ) )$p$;
end $$;
