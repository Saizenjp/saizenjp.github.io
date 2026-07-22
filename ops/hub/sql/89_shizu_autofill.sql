-- ============================================================================
--  89_shizu_autofill.sql — 시즈노야도 '미배정팀' 증분 자동배정(빈 방에만·비파괴)
-- ----------------------------------------------------------------------------
--  목적: step1 등록(import) 때마다 [자동배정] 버튼을 누르지 않아도, 시스템이
--        판단해 가능한 미배정 시즈팀을 빈 방에 자동 배정한다.
--  규칙(shizu.html autoAssignShizu 동일):
--   · 2인 1실 페어만. 홀수로 남는 1명·1인팀·방부족은 미배정 유지(현장 수기).
--   · 빈 방만(그 체류구간 점유 0 = manual+auto 전부 포함) → 남의 방 3번째 안 끼움.
--   · 別棟 선호(현지비고 별채/별관/온천 등) 팀은 離れ(吉祥·瑞雲·馬酔木) 먼저.
--   · 예약순(event_seq). 폐쇄기간 제외. 정원가드(rooms_capacity_guard)로 이중보호.
--  ★ 비파괴: 기존 배정을 지우지 않고 '삽입만'. 되돌리기=shizu.html 이동/해제.
--    (기존 full 자동배정 shizu_assign_rooms 은 auto를 지우고 재배치 — 이건 그대로 유지)
--  구조: _shizu_autofill_impl(무게이트·전 롤에 revoke — 서버/definer 전용) +
--        shizu_autofill(게이트: admin 또는 room/shizu/step1 영역 → impl 호출).
--        step1 임포트가 로그인 사용자 컨텍스트로 shizu_autofill 호출.
--  ⚠ MCP apply_migration 적용. 멱등(create or replace).
-- ============================================================================

-- 내부 구현(게이트 없음) — 반드시 REVOKE로 직접호출 차단, wrapper만 호출.
create or replace function public._shizu_autofill_impl(p_ym text)
returns integer
language plpgsql security definer set search_path=public as $$
declare
  v_start date; v_end date; v_placed int := 0;
  t record; v_mem uuid[]; v_n int; v_i int;
  v_pool text[]; v_room text; v_inv uuid; v_chosen text; v_rtype text;
  ANNEX constant text[] := array['吉祥','瑞雲','馬酔木','志津','合歓','山法師','北條'];
  MAIN  constant text[] := array['志津','合歓','山法師','北條','吉祥','瑞雲','馬酔木'];
  ANNEX_RE constant text := '별채|별관|別棟|別館|내탕|온천|内湯|温泉';
begin
  v_start := (p_ym || '-01')::date;
  v_end   := (date_trunc('month', v_start) + interval '1 month - 1 day')::date;

  for t in
    select b.event_seq, b.dep_date::date as dep, b.arr_date::date as arr,
           ((coalesce(b.remark_local,'') || ' ' || coalesce(b.remark,'')) ~ ANNEX_RE) as annex
    from guests g join bookings b on b.event_seq = g.event_seq
    where g.accom = '시즈노야도 료칸'
      and b.dep_date <= v_end and b.arr_date > v_start
    order by ((coalesce(b.remark_local,'') || ' ' || coalesce(b.remark,'')) ~ ANNEX_RE) desc, b.event_seq
  loop
    -- 미배정(시즈 방 없는) 멤버 순번대로
    select array_agg(gm.id order by gm.seq_in_team) into v_mem
    from guest_members gm
    where gm.event_seq = t.event_seq
      and not exists (select 1 from rooms r where r.member_id = gm.id and r.facility = '시즈노야도 료칸');
    if v_mem is null then continue; end if;
    v_n := array_length(v_mem, 1);
    if v_n < 2 then continue; end if;         -- 1명(홀수 leftover 포함) = 자동 안 함
    v_pool := case when t.annex then ANNEX else MAIN end;

    v_i := 1;
    while v_i + 1 <= v_n loop                  -- 2인 페어 단위
      v_chosen := null; v_inv := null; v_rtype := null;
      foreach v_room in array v_pool loop
        select id, room_type into v_inv, v_rtype
          from room_inventory where facility = '시즈노야도 료칸' and room_no = v_room;
        if v_inv is null then continue; end if;
        -- 폐쇄 제외(dep<=to_date AND arr>from_date = 클라 roomClosure 동일)
        if exists (select 1 from room_closures rc join room_inventory ri on ri.id = rc.inventory_id
                   where ri.facility = '시즈노야도 료칸' and ri.room_no = v_room
                     and t.dep <= rc.to_date and t.arr > rc.from_date) then continue; end if;
        -- 빈 방만(그 구간 점유 0 — 기존 manual+auto+이번 삽입 포함)
        if (select count(*) from rooms r
              where r.facility = '시즈노야도 료칸' and r.room_no = v_room
                and r.check_in < t.arr and r.check_out > t.dep) = 0 then
          v_chosen := v_room; exit;
        end if;
      end loop;
      exit when v_chosen is null;              -- 방 부족 → 남은 페어 미배정
      begin
        insert into rooms(member_id, event_seq, inventory_id, facility, room_type, room_no, check_in, check_out, assigned_pax, assign_source)
          values (v_mem[v_i],   t.event_seq, v_inv, '시즈노야도 료칸', v_rtype, v_chosen, t.dep, t.arr, 1, 'auto'),
                 (v_mem[v_i+1], t.event_seq, v_inv, '시즈노야도 료칸', v_rtype, v_chosen, t.dep, t.arr, 1, 'auto');
        v_placed := v_placed + 2;
      exception when others then
        null;                                  -- 정원가드 등 실패 = 스킵(다음 페어로)
      end;
      v_i := v_i + 2;
    end loop;
  end loop;
  return v_placed;
end $$;
revoke all on function public._shizu_autofill_impl(text) from public, anon, authenticated;

-- 공개 wrapper(게이트) — 로그인 사용자(step1 임포트·shizu 버튼)가 호출.
create or replace function public.shizu_autofill(p_ym text)
returns integer
language plpgsql security definer set search_path=public as $$
declare v_role text; v_areas text[];
begin
  select role, areas into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or coalesce(v_areas,'{}') && array['room','shizu','step1']) then
    raise exception '권한 없음(시즈 자동배정 — room/shizu/step1 영역)';
  end if;
  return public._shizu_autofill_impl(p_ym);
end $$;
revoke all on function public.shizu_autofill(text) from public, anon;
grant execute on function public.shizu_autofill(text) to authenticated;
