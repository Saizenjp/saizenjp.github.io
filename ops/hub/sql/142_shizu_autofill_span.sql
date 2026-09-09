-- ============================================================================
--  142_shizu_autofill_span.sql — 서버 자동채움도 콤보 상품의 「실제 시즈 숙박 구간」을 쓴다
-- ----------------------------------------------------------------------------
--  배경(현지 담당자 2026-09): 「[14박 15일] 시즈노야도 + 간지호텔」 콤보 팀이 予約表에 14박 전부 떠 있었다.
--        화면(shizu.html parseShizuSpan)은 현지비고의 「9/9-9/16 시즈」를 읽어 구간을 줄이지만
--        서버 증분 자동채움(141)은 예약 기간(dep~arr) 그대로 넣어 같은 문제를 만든다.
--  규칙(화면 동일): 상품명이 시즈 + (야마나미|간지|쿠주) 콤보일 때만, 현지비고 줄 중 「시즈」가 언급된 줄에서
--        「M/D-M/D」「M/D~M/D」「M/D-D일」(뒤 날짜 월 생략=같은 달) 을 읽어 그 구간을 시즈 숙박으로.
--        못 읽으면 예약 기간 그대로(폴백). 순수 시즈 상품은 예약 기간 = 시즈 숙박.
--  ⚠ MCP apply_migration 적용. 멱등. 권한(revoke/grant)은 89·141 그대로 다시 명시.
-- ============================================================================

create or replace function public._shizu_span(p_remark text, p_product text, p_dep date, p_arr date)
returns table(dep date, arr date)
language plpgsql immutable as $$
declare
  v_ln text; m text[]; v_yr int; v_dep date; v_arr date;
begin
  if p_product ~ '(야마나미|ヤマナミ|山並|간지|ガンジー|쿠주|久住)' and p_product ~ '(시즈|志津|しずの|しづの)' then
    v_yr := extract(year from coalesce(p_dep, p_arr))::int;
    foreach v_ln in array regexp_split_to_array(coalesce(p_remark,''), E'\r?\n') loop
      continue when v_ln !~ '(시즈|志津|しずの|しづの)';
      m := regexp_match(v_ln, '(\d{1,2})\s*/\s*(\d{1,2})\s*[-~〜～]\s*(?:(\d{1,2})\s*/\s*)?(\d{1,2})(?!\s*/)');
      if m is not null then
        begin
          v_dep := make_date(v_yr, m[1]::int, m[2]::int);
          v_arr := make_date(v_yr, coalesce(m[3], m[1])::int, m[4]::int);
        exception when others then v_dep := null; end;
        if v_dep is not null and v_dep < v_arr then
          dep := v_dep; arr := v_arr; return next; return;
        end if;
      end if;
    end loop;
  end if;
  dep := p_dep; arr := p_arr; return next;
end $$;
revoke all on function public._shizu_span(text,text,date,date) from public, anon;
grant execute on function public._shizu_span(text,text,date,date) to authenticated;

-- 141 본문 그대로 + 팀 루프의 dep/arr 를 _shizu_span 으로 치환
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
    select b.event_seq, sp.dep, sp.arr,
           ((coalesce(b.remark_local,'') || ' ' || coalesce(b.remark,'')) ~ ANNEX_RE)   as annex,
           ((coalesce(b.remark_local,'') || ' ' || coalesce(b.remark,'')) ~* TRIPLE_RE) as triple,
           (sp.arr - sp.dep) as nights
    from guests g join bookings b on b.event_seq = g.event_seq
    cross join lateral public._shizu_span(b.remark_local, b.product_name, b.dep_date::date, b.arr_date::date) sp   -- 콤보 = 실제 시즈 구간(142)
    where g.accom = '시즈노야도 료칸'
      and coalesce(b.status,'') <> '대기'
      and sp.dep <= v_end and sp.arr > v_start
    order by ((coalesce(b.remark_local,'') || ' ' || coalesce(b.remark,'')) ~ ANNEX_RE) desc,
             (sp.arr - sp.dep) desc, b.event_seq
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

-- 공개 wrapper(89 그대로) — 권한만 다시 명시
revoke all on function public.shizu_autofill(text) from public, anon;
grant execute on function public.shizu_autofill(text) to authenticated;
