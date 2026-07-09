-- ============================================================================
--  77_shizu_place.sql — 시즈 예약표 '개인 단위' 배정/이동/병합 + 미배정(rooms) RPC
-- ----------------------------------------------------------------------------
--  배경: 기존 예약표는 '방 통째 맞바꾸기(shizu_swap_rooms)'만 가능 → 개인 1명을
--   이미 사람이 있는 방에 합치기(merge)·개인 이동이 구조적으로 불가.
--   → room.html식 개인 단위 편집(미배정 행거 → 객실 카드)으로 개편.
--  rooms 쓰기는 room 영역 전용(19_rls_areas)이라 security definer RPC로 처리
--   (권한: admin 또는 room·shizu 영역, 시즈노야도 객실만).
--
--  ① shizu_place(p_rows jsonb) : 각 행 = {member_id,inventory_id,room_no,check_in,check_out}
--     - 그 사람의 기존 시즈 배정을 먼저 삭제(방 이동·재배정) 후 대상 방에 삽입.
--     - 삽입은 행별 서브트랜잭션 → 정원가드(40, 최대 3)에 걸리는 행만 건너뜀
--       (되는 사람만 배정, 나머지는 미배정 유지). assign_source='manual'(자동배정에서 보호).
--     - 반환 = 실제 배정된 인원 수(클라가 미배정 표기).
--  ② shizu_unassign(p_member_ids uuid[]) : 그 사람들의 시즈 배정을 해제(미배정 행거로).
--     - 반환 = 삭제된 행 수.
--  멱등(create or replace). ⚠ Supabase SQL Editor 수동 실행 / MCP 적용.
-- ============================================================================

create or replace function shizu_place(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_role text; v_areas text[]; r jsonb; n int := 0;
        v_fac text; v_rtype text; v_seq guest_members.event_seq%type; v_mid uuid;
begin
  select role, areas into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or coalesce(v_areas,'{}') && array['room','shizu']) then
    raise exception '권한 없음(시즈 배정 — room 또는 shizu 영역)';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    select facility, room_type into v_fac, v_rtype from room_inventory where id = (r->>'inventory_id')::uuid;
    if v_fac is distinct from '시즈노야도 료칸' then continue; end if;   -- 시즈 외는 조용히 skip
    v_mid := (r->>'member_id')::uuid;
    select event_seq into v_seq from guest_members where id = v_mid;
    -- 이 사람의 기존 시즈 배정을 먼저 제거(방 이동/재배정 = clean insert)
    delete from rooms where facility = '시즈노야도 료칸' and member_id = v_mid;
    begin
      insert into rooms(member_id, event_seq, inventory_id, facility, room_type, room_no, check_in, check_out, assigned_pax, assign_source)
        values(v_mid, v_seq, (r->>'inventory_id')::uuid, v_fac, v_rtype, r->>'room_no',
               (r->>'check_in')::date, (r->>'check_out')::date, 1, 'manual');
      n := n + 1;
    exception when others then
      null;   -- 정원(3)초과 등 → 그 사람만 건너뜀(미배정 유지)
    end;
  end loop;
  return n;
end $$;
grant execute on function shizu_place(jsonb) to authenticated;

create or replace function shizu_unassign(p_member_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_role text; v_areas text[]; n int := 0;
begin
  select role, areas into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or coalesce(v_areas,'{}') && array['room','shizu']) then
    raise exception '권한 없음(시즈 배정 해제 — room 또는 shizu 영역)';
  end if;
  delete from rooms where facility = '시즈노야도 료칸' and member_id = any(p_member_ids);
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function shizu_unassign(uuid[]) to authenticated;
