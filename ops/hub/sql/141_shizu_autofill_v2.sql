-- ============================================================================
--  141_shizu_autofill_v2.sql — 시즈노야도 서버측 증분 자동배정을 화면 규칙(2026-09 개편)과 맞춤
-- ----------------------------------------------------------------------------
--  배경: step1 등록 때마다 서버 RPC shizu_autofill(89)이 미배정 시즈팀을 채우는데, 이쪽이 아직
--        「예약순·2인 페어·빈 방만」 옛 규칙이라 shizu.html 의 새 자동배정(shzPlanAssign)과 결과가 달랐다
--        (트리플 요청 3번째를 미배정으로 두고, 같은 팀 방 빈 침대에 합류시키지 않음 — 송병석 10/15 사례).
--  규칙(shizu.html shzPlanAssign 동일):
--   ① 순서 = 別棟 선호 → 체류 긴 팀 → 예약순   (화면은 최고령도 보지만 서버는 생략)
--   ② 같은 팀 합류: 그 팀이 이미 쓰는 방(수기·자동)에 빈 침대가 있으면 먼저 채운다. 남의 팀 방에는 안 섞는다.
--   ③ 트리플 요청(비고 트리플·3인 1실) 3명 = 한 방(정원 3). 그 외 2명씩, 홀수 1명은 같은 팀 방 빈 침대에만.
--   ④ 빈 방 고르기 = 本館/別棟 등급 우선 + 등급 안에서는 앞뒤 손님과 틈이 가장 작은 방(best-fit).
--  ★ 여전히 비파괴(삽입만) — 기존 배정을 옮기지는 않는다. 전면 재배치는 화면의 「월별 자동배정」.
--  ⚠ MCP apply_migration 적용. 멱등(create or replace). 권한(revoke/grant)은 89 그대로 다시 명시.
-- ============================================================================

create or replace function public._shizu_autofill_impl(p_ym text)
returns integer
language plpgsql security definer set search_path=public as $$
declare
  v_start date; v_end date; v_placed int := 0;
  t record; v_mem uuid[]; v_n int; v_i int; v_take int; v_tier int;
  v_first text[]; v_second text[]; v_pool text[]; v_room text;
  v_inv uuid; v_rtype text; v_chosen text; v_chosen_inv uuid; v_chosen_rtype text;
  v_cap int; v_same int; v_other int; v_free int; v_score int; v_best int; v_gb int; v_ga int;
  MAIN  constant text[] := array['志津','合歓','山法師','北條'];
  ANNEX constant text[] := array['吉祥','瑞雲','馬酔木'];
  ANNEX_RE  constant text := '별채|별관|別棟|別館|내탕|온천|内湯|温泉';
  TRIPLE_RE constant text := '트리플|トリプル|triple|3\s*(인|명|人)\s*(1\s*)?(실|室|룸|방)';
begin
  v_start := (p_ym || '-01')::date;
  v_end   := (date_trunc('month', v_start) + interval '1 month - 1 day')::date;

  for t in
    select b.event_seq, b.dep_date::date as dep, b.arr_date::date as arr,
           ((coalesce(b.remark_local,'') || ' ' || coalesce(b.remark,'')) ~ ANNEX_RE)   as annex,
           ((coalesce(b.remark_local,'') || ' ' || coalesce(b.remark,'')) ~* TRIPLE_RE) as triple,
           (b.arr_date::date - b.dep_date::date) as nights
    from guests g join bookings b on b.event_seq = g.event_seq
    where g.accom = '시즈노야도 료칸'
      and coalesce(b.status,'') <> '대기'
      and b.dep_date <= v_end and b.arr_date > v_start
    order by ((coalesce(b.remark_local,'') || ' ' || coalesce(b.remark,'')) ~ ANNEX_RE) desc,
             (b.arr_date::date - b.dep_date::date) desc, b.event_seq
  loop
    v_cap := case when t.triple then 3 else 2 end;
    select array_agg(gm.id order by gm.seq_in_team) into v_mem
      from guest_members gm
     where gm.event_seq = t.event_seq
       and not exists (select 1 from rooms r where r.member_id = gm.id and r.facility = '시즈노야도 료칸');
    if v_mem is null then continue; end if;
    v_first  := case when t.annex then ANNEX else MAIN end;
    v_second := case when t.annex then MAIN  else ANNEX end;
    v_pool   := v_first || v_second;

    -- ② 같은 팀 합류(그 팀이 쓰는 방의 빈 침대부터)
    foreach v_room in array v_pool loop
      exit when coalesce(array_length(v_mem,1),0) = 0;
      select id, room_type into v_inv, v_rtype from room_inventory where facility = '시즈노야도 료칸' and room_no = v_room;
      if v_inv is null then continue; end if;
      if exists (select 1 from room_closures rc where rc.inventory_id = v_inv and t.dep <= rc.to_date and t.arr > rc.from_date) then continue; end if;
      select count(*) filter (where r.event_seq = t.event_seq), count(*) filter (where r.event_seq is distinct from t.event_seq)
        into v_same, v_other
        from rooms r where r.facility = '시즈노야도 료칸' and r.room_no = v_room and r.check_in < t.arr and r.check_out > t.dep;
      if v_other > 0 or v_same = 0 then continue; end if;
      v_free := v_cap - v_same;
      if v_free <= 0 then continue; end if;
      v_take := least(v_free, array_length(v_mem,1));
      for v_i in 1..v_take loop
        begin
          insert into rooms(member_id, event_seq, inventory_id, facility, room_type, room_no, check_in, check_out, assigned_pax, assign_source)
            values (v_mem[v_i], t.event_seq, v_inv, '시즈노야도 료칸', v_rtype, v_room, t.dep, t.arr, 1, 'auto');
          v_placed := v_placed + 1;
        exception when others then null; end;
      end loop;
      v_mem := v_mem[v_take+1:];
    end loop;

    -- ③ 묶기(트리플 3 / 2명씩) + ④ 빈 방 best-fit
    loop
      v_n := coalesce(array_length(v_mem,1),0);
      exit when v_n < 2;
      v_take := case when v_cap = 3 and v_n = 3 then 3 else 2 end;
      v_chosen := null; v_chosen_inv := null; v_chosen_rtype := null;
      for v_tier in 1..2 loop
        v_best := null;
        foreach v_room in array (case when v_tier = 1 then v_first else v_second end) loop
          select id, room_type into v_inv, v_rtype from room_inventory where facility = '시즈노야도 료칸' and room_no = v_room;
          if v_inv is null then continue; end if;
          if exists (select 1 from room_closures rc where rc.inventory_id = v_inv and t.dep <= rc.to_date and t.arr > rc.from_date) then continue; end if;
          if exists (select 1 from rooms r where r.facility = '시즈노야도 료칸' and r.room_no = v_room and r.check_in < t.arr and r.check_out > t.dep) then continue; end if;   -- 빈 방만
          select coalesce(min(t.dep - r.check_out), 60) into v_gb from rooms r where r.facility = '시즈노야도 료칸' and r.room_no = v_room and r.check_out <= t.dep;
          select coalesce(min(r.check_in - t.arr), 60) into v_ga from rooms r where r.facility = '시즈노야도 료칸' and r.room_no = v_room and r.check_in >= t.arr;
          v_score := v_gb + v_ga;
          if v_best is null or v_score < v_best then
            v_best := v_score; v_chosen := v_room; v_chosen_inv := v_inv; v_chosen_rtype := v_rtype;
          end if;
        end loop;
        exit when v_chosen is not null;
      end loop;
      exit when v_chosen is null;                 -- 방 부족 → 남은 인원 미배정
      for v_i in 1..v_take loop
        begin
          insert into rooms(member_id, event_seq, inventory_id, facility, room_type, room_no, check_in, check_out, assigned_pax, assign_source)
            values (v_mem[v_i], t.event_seq, v_chosen_inv, '시즈노야도 료칸', v_chosen_rtype, v_chosen, t.dep, t.arr, 1, 'auto');
          v_placed := v_placed + 1;
        exception when others then null; end;
      end loop;
      v_mem := v_mem[v_take+1:];
    end loop;

    -- ⑤ 홀수 1명: 이번에 만든 같은 팀 방의 빈 침대에만(트리플 요청이면 3번째 가능) — 없으면 미배정
    if coalesce(array_length(v_mem,1),0) = 1 then
      foreach v_room in array v_pool loop
        select id, room_type into v_inv, v_rtype from room_inventory where facility = '시즈노야도 료칸' and room_no = v_room;
        if v_inv is null then continue; end if;
        select count(*) filter (where r.event_seq = t.event_seq), count(*) filter (where r.event_seq is distinct from t.event_seq)
          into v_same, v_other
          from rooms r where r.facility = '시즈노야도 료칸' and r.room_no = v_room and r.check_in < t.arr and r.check_out > t.dep;
        if v_other > 0 or v_same = 0 or v_cap - v_same <= 0 then continue; end if;
        begin
          insert into rooms(member_id, event_seq, inventory_id, facility, room_type, room_no, check_in, check_out, assigned_pax, assign_source)
            values (v_mem[1], t.event_seq, v_inv, '시즈노야도 료칸', v_rtype, v_room, t.dep, t.arr, 1, 'auto');
          v_placed := v_placed + 1;
        exception when others then null; end;
        exit;
      end loop;
    end if;
  end loop;
  return v_placed;
end $$;
revoke all on function public._shizu_autofill_impl(text) from public, anon, authenticated;

-- 공개 wrapper(89 그대로) — 권한만 다시 명시(create or replace 는 옛 권한을 남기므로)
revoke all on function public.shizu_autofill(text) from public, anon;
grant execute on function public.shizu_autofill(text) to authenticated;
