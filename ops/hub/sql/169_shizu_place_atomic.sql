-- ============================================================================
--  169_shizu_place_atomic.sql — shizu_place() 운영 DB 본문 기록 (77 의 shizu_place 를 대체)
-- ----------------------------------------------------------------------------
--  77_shizu_place.sql 의 shizu_place 는 「그 사람의 기존 방 삭제」가 서브트랜잭션(begin … exception)
--  밖에 있다 → 새 방 삽입이 정원 가드(40) 등에 막히면 삭제만 남아 그 사람의 기존 방배정이 사라진다.
--  운영 DB 에는 삭제와 삽입을 한 서브트랜잭션으로 묶은 아래 본문이 이미 적용돼 있다
--  (삽입이 실패하면 삭제도 되돌아가 기존 방이 그대로 남는다).
--
--  이 파일은 그 본문을 저장소에 남기는 **기록용**이다(2026-11-12 pg_get_functiondef 결과 그대로).
--  다시 적용해도 동작은 바뀌지 않는다(create or replace · 멱등).
--  ⚠ 77 의 shizu_place 정의는 다시 실행하지 않는다 — 옛 본문으로 되돌아간다. shizu_unassign 은 77 그대로.
--  권한: 로그인 전용(118·119 와 같은 상태 — public·anon 회수, authenticated 부여).
--  확인: 00_VERIFY 77행 = 본문이 「begin 바로 다음에 delete」인지 본다.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.shizu_place(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role text; v_areas text[]; r jsonb; n int := 0;
        v_fac text; v_rtype text; v_seq guest_members.event_seq%type; v_mid uuid;
begin
  select role, areas into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or coalesce(v_areas,'{}') && array['room','shizu']) then
    raise exception '권한 없음(시즈 배정 — room 또는 shizu 영역)';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    select facility, room_type into v_fac, v_rtype from room_inventory where id = (r->>'inventory_id')::uuid;
    if v_fac is distinct from '시즈노야도 료칸' then continue; end if;
    v_mid := (r->>'member_id')::uuid;
    select event_seq into v_seq from guest_members where id = v_mid;
    -- delete(기존 방 제거)+insert(새 방)를 한 서브트랜잭션으로 → insert 실패 시 delete도 롤백(사람이 사라지지 않고 기존 방 유지)
    begin
      delete from rooms where facility = '시즈노야도 료칸' and member_id = v_mid;
      insert into rooms(member_id, event_seq, inventory_id, facility, room_type, room_no, check_in, check_out, assigned_pax, assign_source)
        values(v_mid, v_seq, (r->>'inventory_id')::uuid, v_fac, v_rtype, r->>'room_no',
               (r->>'check_in')::date, (r->>'check_out')::date, 1, 'manual');
      n := n + 1;
    exception when others then
      null;
    end;
  end loop;
  return n;
end $function$;

revoke execute on function public.shizu_place(jsonb) from public, anon;
grant  execute on function public.shizu_place(jsonb) to authenticated;
