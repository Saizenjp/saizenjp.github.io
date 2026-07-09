-- ============================================================================
--  71_shizu_reassign.sql — 시즈 자동배정을 '한 달치 재배치'로(auto 정리 후 재배정)
-- ----------------------------------------------------------------------------
--  ① shizu_swap_rooms: 맞바꾸기/이동한 방을 assign_source='manual'로 표시
--     → 이후 자동 재배치에서 보호(삭제되지 않음).
--  ② shizu_assign_rooms(p_rows, p_clear_from, p_clear_to): 기간 지정 시 그 기간
--     시즈 auto 배정을 먼저 삭제(manual 보존) 후 새 배정 삽입 → 3인실 포함 최적 재배치.
--  멱등. ⚠ 수동/MCP 적용.
-- ============================================================================

-- ① swap/move → manual 표시
create or replace function shizu_swap_rooms(
  p_src_ids uuid[], p_src_room text, p_src_inv uuid,
  p_tgt_ids uuid[], p_tgt_room text, p_tgt_inv uuid
) returns void language plpgsql security definer set search_path = public as $$
declare v_role text; v_areas text[];
begin
  select role, areas into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or coalesce(v_areas,'{}') && array['room','shizu']) then
    raise exception '권한 없음(시즈 방 변경 — room 또는 shizu 영역)';
  end if;
  if not exists(select 1 from room_inventory where id = p_src_inv and facility = '시즈노야도 료칸')
     or not exists(select 1 from room_inventory where id = p_tgt_inv and facility = '시즈노야도 료칸') then
    raise exception '시즈노야도 객실만 변경할 수 있습니다';
  end if;
  perform set_config('app.skip_room_guard', '1', true);
  update rooms set room_no = p_tgt_room, inventory_id = p_tgt_inv, assign_source = 'manual' where id = any(p_src_ids);
  if array_length(p_tgt_ids, 1) is not null then
    update rooms set room_no = p_src_room, inventory_id = p_src_inv, assign_source = 'manual' where id = any(p_tgt_ids);
  end if;
  perform set_config('app.skip_room_guard', '', true);
end $$;
grant execute on function shizu_swap_rooms(uuid[], text, uuid, uuid[], text, uuid) to authenticated;

-- ② assign에 기간 정리(clear) 옵션 추가(오버로드 정리 위해 기존 1-인자 삭제 후 재생성)
drop function if exists shizu_assign_rooms(jsonb);
create or replace function shizu_assign_rooms(p_rows jsonb, p_clear_from date default null, p_clear_to date default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_role text; v_areas text[]; r jsonb; n int := 0;
        v_fac text; v_rtype text; v_seq guest_members.event_seq%type; v_src text;
begin
  select role, areas into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or coalesce(v_areas,'{}') && array['room','shizu']) then
    raise exception '권한 없음(시즈 자동배정 — room 또는 shizu 영역)';
  end if;
  if p_clear_from is not null and p_clear_to is not null then
    delete from rooms where facility = '시즈노야도 료칸' and coalesce(assign_source,'auto') = 'auto'
      and check_in <= p_clear_to and check_out > p_clear_from;   -- manual/맞바꿈 보존
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    select facility, room_type into v_fac, v_rtype from room_inventory where id = (r->>'inventory_id')::uuid;
    if v_fac is distinct from '시즈노야도 료칸' then raise exception '시즈노야도 객실만 배정할 수 있습니다'; end if;
    select event_seq into v_seq from guest_members where id = (r->>'member_id')::uuid;
    v_src := case when coalesce(r->>'src','auto') = 'manual' then 'manual' else 'auto' end;  -- 수기 강제추가 보호
    insert into rooms(member_id, event_seq, inventory_id, facility, room_type, room_no, check_in, check_out, assigned_pax, assign_source)
      values((r->>'member_id')::uuid, v_seq, (r->>'inventory_id')::uuid, v_fac, v_rtype, r->>'room_no',
             (r->>'check_in')::date, (r->>'check_out')::date, 1, v_src);
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function shizu_assign_rooms(jsonb, date, date) to authenticated;
