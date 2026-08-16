-- ============================================================================
--  104_room_swap.sql — 방 맞바꾸기(rooms) RPC · 야마나미 전 숙소
-- ----------------------------------------------------------------------------
--  두 방이 모두 차 있으면 클라이언트에서 순서대로 update 할 수 없다(중간 상태가
--  정원 가드(40)에 걸림). 시즈(67)와 같은 방식으로 **한 트랜잭션 안에서만**
--  가드를 비켜 원자적으로 교환한다.
--    · 쓰임 = ① 방 통째 맞바꾸기(A방 전원 ↔ B방 전원)
--             ② 사람 골라 맞바꾸기(A의 일부 ↔ B의 일부)  — 같은 RPC로 처리
--    · 제약(Min 2026-08) = **같은 숙소 · 같은 기간**만. 각 묶음은 한 방·한 기간.
--    · 권한 = admin 또는 room 영역(rooms 쓰기 권한과 동일선).
--    · 정원 = 교환 후 양쪽 모두 정원 이내여야 한다(초과면 예외로 전부 롤백).
--  멱등(create or replace). ⚠ Supabase SQL Editor 수동 실행(또는 MCP). 103 이후.
-- ============================================================================

create or replace function room_swap(p_a_ids uuid[], p_b_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text; v_areas text[];
  a_inv uuid; b_inv uuid; a_fac text; b_fac text;
  a_ci date; a_co date; b_ci date; b_co date;
  a_pax int; b_pax int; a_cap int; b_cap int; a_other int; b_other int;
  a_room text; a_type text; b_room text; b_type text;
begin
  select role, areas into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or coalesce(v_areas,'{}') && array['room']) then
    raise exception '권한 없음(방 맞바꾸기 — room 영역)';
  end if;
  if p_a_ids is null or array_length(p_a_ids,1) is null
     or p_b_ids is null or array_length(p_b_ids,1) is null then
    raise exception '맞바꿀 대상이 없습니다';
  end if;

  -- ① 각 묶음은 한 방·한 기간이어야 한다
  if (select count(*) from rooms where id = any(p_a_ids)) <> coalesce(array_length(p_a_ids,1),0)
     or (select count(*) from rooms where id = any(p_b_ids)) <> coalesce(array_length(p_b_ids,1),0) then
    raise exception '맞바꿀 배정을 찾을 수 없습니다(이미 바뀌었을 수 있습니다 — 새로고침)';
  end if;
  if (select count(distinct inventory_id) from rooms where id = any(p_a_ids)) <> 1
     or (select count(distinct check_in) from rooms where id = any(p_a_ids)) <> 1
     or (select count(distinct check_out) from rooms where id = any(p_a_ids)) <> 1 then
    raise exception '같은 방·같은 기간끼리만 맞바꿀 수 있습니다(A)';
  end if;
  if (select count(distinct inventory_id) from rooms where id = any(p_b_ids)) <> 1
     or (select count(distinct check_in) from rooms where id = any(p_b_ids)) <> 1
     or (select count(distinct check_out) from rooms where id = any(p_b_ids)) <> 1 then
    raise exception '같은 방·같은 기간끼리만 맞바꿀 수 있습니다(B)';
  end if;

  select inventory_id, check_in, check_out, coalesce(sum(assigned_pax),0)
    into a_inv, a_ci, a_co, a_pax
    from rooms where id = any(p_a_ids) group by inventory_id, check_in, check_out;
  select inventory_id, check_in, check_out, coalesce(sum(assigned_pax),0)
    into b_inv, b_ci, b_co, b_pax
    from rooms where id = any(p_b_ids) group by inventory_id, check_in, check_out;

  if a_inv = b_inv then raise exception '같은 방입니다'; end if;
  if a_ci <> b_ci or a_co <> b_co then
    raise exception '체류 기간이 같을 때만 맞바꿀 수 있습니다 (% ~ % ↔ % ~ %)', a_ci, a_co, b_ci, b_co;
  end if;

  -- ② 같은 숙소만
  select facility, room_no, room_type, coalesce(max_capacity, capacity)
    into a_fac, a_room, a_type, a_cap from room_inventory where id = a_inv;
  select facility, room_no, room_type, coalesce(max_capacity, capacity)
    into b_fac, b_room, b_type, b_cap from room_inventory where id = b_inv;
  if a_fac is distinct from b_fac then
    raise exception '같은 숙소끼리만 맞바꿀 수 있습니다 (% ↔ %)', a_fac, b_fac;
  end if;

  -- ③ 교환 후 정원 확인 — 그 기간에 겹치는 '남는 점유' + 상대 인원
  select coalesce(sum(assigned_pax),0) into a_other from rooms
   where inventory_id = a_inv and id <> all(p_a_ids)
     and check_in < a_co and check_out > a_ci;
  select coalesce(sum(assigned_pax),0) into b_other from rooms
   where inventory_id = b_inv and id <> all(p_b_ids)
     and check_in < b_co and check_out > b_ci;
  if a_other + b_pax > coalesce(a_cap, 0) then
    raise exception '% 정원 초과 — 정원 %, 교환 후 %', a_room, a_cap, a_other + b_pax
      using errcode = 'check_violation';
  end if;
  if b_other + a_pax > coalesce(b_cap, 0) then
    raise exception '% 정원 초과 — 정원 %, 교환 후 %', b_room, b_cap, b_other + a_pax
      using errcode = 'check_violation';
  end if;

  -- ④ 교환(이 txn 한정 가드 우회 — 중간 상태에서 한 방에 양쪽이 겹친다)
  perform set_config('app.skip_room_guard', '1', true);
  update rooms set inventory_id = b_inv, facility = b_fac, room_no = b_room,
                   room_type = b_type, assign_source = 'manual'
   where id = any(p_a_ids);
  update rooms set inventory_id = a_inv, facility = a_fac, room_no = a_room,
                   room_type = a_type, assign_source = 'manual'
   where id = any(p_b_ids);
  perform set_config('app.skip_room_guard', '', true);
end $$;

revoke all on function room_swap(uuid[], uuid[]) from public;
grant execute on function room_swap(uuid[], uuid[]) to authenticated;
