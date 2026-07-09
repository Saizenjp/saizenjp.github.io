-- ============================================================================
--  69_shizu_assign.sql — 시즈노야도 예약표 자동배정(rooms INSERT) RPC
-- ----------------------------------------------------------------------------
--  시즈 담당자는 room.html 미접근 → 予約表에서 미배정 인원을 本館 객실에 자동배정.
--  rooms INSERT는 room 영역 전용이라 security definer RPC로 처리(area+시설 검증).
--    · 클라이언트가 배정안(member_id·inventory_id·room_no·기간)을 계산 → RPC가 삽입.
--    · 정원가드(40)는 그대로 적용 → 더블부킹은 삽입 단계에서 자동 차단(롤백).
--  멱등(create or replace). ⚠ 수동/MCP 적용.
-- ============================================================================

create or replace function shizu_assign_rooms(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_role text; v_areas text[]; r jsonb; n int := 0;
        v_fac text; v_rtype text; v_seq guest_members.event_seq%type;
begin
  select role, areas into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or coalesce(v_areas,'{}') && array['room','shizu']) then
    raise exception '권한 없음(시즈 자동배정 — room 또는 shizu 영역)';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    select facility, room_type into v_fac, v_rtype from room_inventory where id = (r->>'inventory_id')::uuid;
    if v_fac is distinct from '시즈노야도 료칸' then raise exception '시즈노야도 객실만 배정할 수 있습니다'; end if;
    select event_seq into v_seq from guest_members where id = (r->>'member_id')::uuid;
    insert into rooms(member_id, event_seq, inventory_id, facility, room_type, room_no, check_in, check_out, assigned_pax, assign_source)
      values((r->>'member_id')::uuid, v_seq, (r->>'inventory_id')::uuid, v_fac, v_rtype, r->>'room_no',
             (r->>'check_in')::date, (r->>'check_out')::date, 1, 'auto');
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function shizu_assign_rooms(jsonb) to authenticated;
