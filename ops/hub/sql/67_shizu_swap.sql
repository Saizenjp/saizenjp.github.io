-- ============================================================================
--  67_shizu_swap.sql — 시즈노야도 예약표 맞바꾸기/방변경(rooms) RPC
-- ----------------------------------------------------------------------------
--  시즈 담당자는 room.html이 아니라 予約表(shizu.html)에서 방을 맞바꾸거나
--  빈 객실로 이동. rooms 쓰기는 room 영역 전용이라 security definer RPC로 처리.
--    · 권한: admin 또는 room·shizu 영역 보유자.
--    · 대상: 시즈노야도 객실만(facility 확인).
--    · 맞바꾸기 순간 한 방에 두 팀이 겹쳐 정원가드(40)가 막는 문제 →
--      트랜잭션 한정 플래그 app.skip_room_guard 로 그 순간만 우회(같은 txn 내).
--  멱등(create or replace). ⚠ 수동/MCP 적용.
-- ============================================================================

-- ① 정원가드: 트랜잭션 한정 skip 플래그 존중(맞바꾸기 원자성). 그 외 로직 불변.
create or replace function rooms_capacity_guard() returns trigger
language plpgsql as $$
declare cap int; used int;
begin
  if coalesce(current_setting('app.skip_room_guard', true), '') = '1' then return NEW; end if;
  if NEW.inventory_id is null or NEW.check_in is null or NEW.check_out is null then return NEW; end if;
  select coalesce(max_capacity, capacity) into cap from room_inventory where id = NEW.inventory_id for update;
  if cap is null then return NEW; end if;
  select coalesce(sum(assigned_pax), 0) into used from rooms
   where inventory_id = NEW.inventory_id and check_in is not null and check_out is not null
     and check_in < NEW.check_out and check_out > NEW.check_in
     and (TG_OP <> 'UPDATE' or id <> NEW.id);
  if used + coalesce(NEW.assigned_pax, 0) > cap then
    raise exception '객실 정원 초과 — inventory_id=% 정원=% 겹침점유=% (+%) : 더블부킹 차단',
      NEW.inventory_id, cap, used, coalesce(NEW.assigned_pax, 0) using errcode = 'check_violation';
  end if;
  return NEW;
end $$;

-- ② 맞바꾸기/이동 RPC. p_tgt_ids 비면 '빈 객실로 이동', 있으면 '두 방 맞바꾸기'.
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
  perform set_config('app.skip_room_guard', '1', true);   -- 이 txn 한정 정원가드 우회
  update rooms set room_no = p_tgt_room, inventory_id = p_tgt_inv where id = any(p_src_ids);
  if array_length(p_tgt_ids, 1) is not null then
    update rooms set room_no = p_src_room, inventory_id = p_src_inv where id = any(p_tgt_ids);
  end if;
  perform set_config('app.skip_room_guard', '', true);
end $$;
grant execute on function shizu_swap_rooms(uuid[], text, uuid, uuid[], text, uuid) to authenticated;
