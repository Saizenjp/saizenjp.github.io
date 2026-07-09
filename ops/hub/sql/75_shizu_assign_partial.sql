-- ============================================================================
--  75_shizu_assign_partial.sql — 시즈 자동배정: 정원초과 시 '부분 성공'
-- ----------------------------------------------------------------------------
--  문제: shizu_assign_rooms 가 전 행을 한 트랜잭션으로 insert → 한 행이라도 정원가드
--   (40 rooms_capacity_guard)에 걸리면 트랜잭션 전체 롤백 → 한 팀도 배정 안 됨.
--   (클라가 못 본 월경계·수기 점유가 있으면 실제로 발생.)
--  해결: 각 insert를 행별 서브트랜잭션(begin…exception…end)으로 감싸 정원초과·제약위반
--   행만 건너뛰고 나머지는 그대로 배정. 반환값 = 실제 배정된 인원 수(클라가 미배정 표기).
--  멱등(create or replace). ⚠ 수동/MCP 적용.
-- ============================================================================

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
    if v_fac is distinct from '시즈노야도 료칸' then continue; end if;   -- 시즈 외는 조용히 skip
    select event_seq into v_seq from guest_members where id = (r->>'member_id')::uuid;
    v_src := case when coalesce(r->>'src','auto') = 'manual' then 'manual' else 'auto' end;
    begin
      insert into rooms(member_id, event_seq, inventory_id, facility, room_type, room_no, check_in, check_out, assigned_pax, assign_source)
        values((r->>'member_id')::uuid, v_seq, (r->>'inventory_id')::uuid, v_fac, v_rtype, r->>'room_no',
               (r->>'check_in')::date, (r->>'check_out')::date, 1, v_src);
      n := n + 1;
    exception when others then
      null;   -- 정원초과·제약위반 행만 건너뜀(전체 롤백 방지) → 되는 데까지 배정
    end;
  end loop;
  return n;
end $$;
grant execute on function shizu_assign_rooms(jsonb, date, date) to authenticated;
