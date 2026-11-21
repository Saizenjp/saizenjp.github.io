-- ============================================================================
--  179_shizu_assign_guard_yearend.sql — 시즈 서버 배정: 기간이 겹치는 배정이 이미 있는 사람은 넣지 않는다 + 콤보 구간의 연말 넘김
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  무엇이 문제였나
--   (가) shizu_assign_rooms(시즈 예약표의 [월별 재배치]와 그 되돌리기)는 그 달에 걸친 자동(auto) 배정을 지우고 p_rows 를 그대로 넣는다.
--        지워지지 않고 남은 배정(수기 배정·맞바꿈, 그 달에 걸치지 않은 자동 배정)이 있는 사람이 p_rows 에 또 들어오면
--        같은 기간에 방이 두 개가 된다. 화면(shizu.html)은 23차부터 재배치 직전에 DB 를 다시 읽어 그런 사람을 빼지만
--        서버는 확인하지 않았다(오래 열어 둔 화면, 두 사람이 거의 동시에 누를 때, 그 사이에 수기 배정된 사람을 담은 되돌리기 스냅샷).
--        같은 사람·같은 방은 고유 인덱스(06 uq_rooms_member_room)가 막지만 다른 방은 막지 않았다.
--   (나) _shizu_span(서버 자동채움 _shizu_autofill_impl 이 콤보 상품의 실제 시즈 구간을 읽는 함수, 142)은 현지비고의 날짜를
--        모두 입국 연도로 읽었다 → 12월 입국·1월 귀국 콤보의 「12/28-1/4 시즈」는 2026-12-28 > 2026-01-04 라 못 읽어 예약 기간 전체로,
--        「1/2-1/5 시즈」는 2026-01 로 읽혀 그 달 자동채움에서 빠졌다. 화면 parseShizuSpan 은 23차에 고쳤고 서버만 남아 있었다.
--
--  어떻게 고쳤나
--   (가) 한 줄을 넣기 전에 그 사람의 시즈노야도 배정 가운데 기간이 겹치는 행(check_in < 새 check_out and check_out > 새 check_in)이
--        있으면 그 줄은 넣지 않는다. 지우기(p_clear_from~p_clear_to 의 auto)를 먼저 하므로 지워질 행은 막지 않는다.
--        같은 호출에서 앞 줄로 넣은 행도 막는다(같은 사람이 p_rows 에 두 번 있을 때).
--        반환값 = 실제로 넣은 수(종전과 같다) → 화면은 건너뛴 줄을 종전처럼 「미배정」으로 센다(보낸 수 − 반환값).
--        기간이 맞닿기만 한 것(앞 퇴실일 = 새 입실일)은 겹침이 아니다. 다른 시설(야마나미 등)의 배정은 보지 않는다.
--        날짜가 빈 행은 겹침으로 보지 않는다(자동채움·정원 가드의 겹침 식과 같다).
--        권한 확인 줄은 174 와 같은 뜻 그대로 두고 coalesce(…, false) 로 감싸 참·거짓만 나오게 했다.
--   (나) 화면 parseShizuSpan 과 같은 규칙: 예약이 해를 넘길 때(귀국 연도 > 입국 연도)만, 입국 연도로 만든 날짜가 입국일보다
--        앞이고 다음 해의 같은 날짜가 귀국일 이내이면 그 날짜를 다음 해로 읽는다(입실·퇴실 날짜마다 따로). 같은 해 예약은 종전 그대로.
--        월·일을 숫자(월×100+일)로 비교한다 — 화면의 「YYYY-MM-DD 글자 비교」와 같은 순서다. immutable 유지.
--        (종전부터의 차이 하나는 그대로 둔다: 「2/30」처럼 없는 날짜는 서버가 그 줄을 건너뛰고, 화면은 그 글자를 그대로 쓴다.)
--
--  확인만 한 것(바꾸지 않음)
--   · _shizu_autofill_impl: 구간은 _shizu_span 만 부른다 → (나)가 그대로 반영된다. 시즈 배정이 하나라도 있는 사람은 이미
--     건너뛴다(not exists … r.member_id = gm.id) → (가) 같은 이중 배정이 생기지 않는다.
--   · shizu_place(169): 넣기 전에 그 사람의 시즈 배정을 모두 지운다 → 대상 아님.
--   · 지금 해를 넘기는 콤보 예약 0건(2027 입국 예약 0건) — 이미 들어간 배정을 다시 짜는 update 는 없다.
--
--  하지 않는 일: rooms 행 수정·삭제(지우기는 종전 p_clear 범위 그대로) · RLS·권한 영역 변경 · 새 함수.
--  권한: 두 함수의 속성 그대로 — shizu_assign_rooms = security definer · search_path public · 로그인 사용자만 /
--        _shizu_span = 일반 함수 · immutable · 로그인 사용자만. anon 이 실행할 수 있는 security definer 함수 수 변동 없음(15).
--  멱등(⓪ 가 이미 179 판이면 건너뛰고 같은 정의로 다시 만든다). 142·174 이후.
--  75 의 shizu_assign_rooms · 142 의 _shizu_span 정의는 이 파일이 대체한다.
--   ⚠ 75 를 다시 실행했다면 174 의 ① do 블록(권한 확인 줄 치환)을 먼저, 그다음 이 파일을 다시 실행한다
--     (75 판 그대로면 ⓪ 의 md5 가 「75+174」 판과 달라 멈춘다). 142 를 다시 실행했다면 이 파일만 다시 실행한다.
--  되돌리는 법:
--   ① (권장) 적용 직전에 두 함수의 정의를 떠 둔다 — 되돌릴 때 그대로 다시 실행한다.
--        select pg_get_functiondef('public._shizu_span(text,text,date,date)'::regprocedure);
--        select pg_get_functiondef('public.shizu_assign_rooms(jsonb,date,date)'::regprocedure);
--   ② 떠 둔 것이 없으면: 142 의 첫 create 문(_shizu_span)과 바로 아래 revoke·grant 두 줄 →
--      75 의 create 문(shizu_assign_rooms) → 174 의 ① do 블록(권한 확인 줄 치환 — 이미 된 함수는 건너뛴다)과
--      174 의 shizu_assign_rooms revoke·grant 두 줄. (운영 본문 = 이 판들에서 주석만 뺀 것 — ⓪ 의 기대값이 그 판이다.)
--  확인: 00_VERIFY 179 행(2줄).
-- ============================================================================

-- ── ⓪ 적용 전 검사 — 바꾸려는 두 함수의 운영 본문이 기대한 판(142 · 75+174 에서 주석을 뺀 것)과 같은 로직인가 ──
--   주석과 공백을 뺀 글자의 md5 로 비교한다(175 ⓪ 와 같은 식). 2026-11-21 운영 대조: 두 값 모두 일치.
--   다르면 멈춘다 — 운영에만 있는 로직을 이 파일이 모르고 덮어쓰지 않게.
do $chk$
declare
  r     record;
  v_src text;
  v_md5 text;
  v_cmt text := '-' || '-[^' || chr(10) || ']*';
  v_ws  text := '[ ' || chr(9) || chr(13) || chr(10) || ']+';
begin
  if to_regprocedure('public.area_expand(text[])') is null then
    raise exception '179: area_expand(text[]) 없음 — 138 먼저';
  end if;
  for r in
    select * from (values
      ('public._shizu_span(text,text,date,date)',    '57e5302df52ba0bf83a07d134ab0307c', 'v_cross'),
      ('public.shizu_assign_rooms(jsonb,date,date)', '05b6d42a6b50eee03f9574c4a1462093', 'x.member_id = v_mid')
    ) as t(sig, want, mark)
  loop
    v_src := null;
    select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure(r.sig);
    if v_src is null then
      raise notice '179: % 가 없다 — 새로 만든다', r.sig;
      continue;
    end if;
    if position(r.mark in v_src) > 0 then
      raise notice '179: % 는 이미 179 판이다 — 같은 정의로 다시 만든다', r.sig;
      continue;
    end if;
    v_md5 := md5(regexp_replace(regexp_replace(v_src, v_cmt, '', 'g'), v_ws, '', 'g'));
    if v_md5 <> r.want then
      raise exception '179: % 의 운영 본문이 기대한 판과 다르다(주석·공백을 뺀 md5 = %, 기대 %). pg_get_functiondef 로 뽑아 달라진 줄을 확인하고, 로직이면 이 파일의 같은 함수에 옮긴 뒤 위 기대값을 고쳐 다시 실행한다.', r.sig, v_md5, r.want;
    end if;
  end loop;
  --  (다) 확인만: 서버 자동채움이 _shizu_span 을 부르는가(부르지 않으면 (나)가 자동채움에 반영되지 않는다 — 멈추지는 않는다)
  if to_regprocedure('public._shizu_autofill_impl(text)') is not null
     and (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public._shizu_autofill_impl(text)')) not like '%public._shizu_span(%' then
    raise notice '179: _shizu_autofill_impl 이 _shizu_span 을 부르지 않는다 — 서버 자동채움에는 (나)가 반영되지 않는다(142 확인)';
  end if;
end $chk$;

-- ── ① 콤보 상품의 실제 시즈 구간 — 연말을 넘기는 예약은 다음 해로(화면 parseShizuSpan 과 같은 규칙) ─────────
create or replace function public._shizu_span(p_remark text, p_product text, p_dep date, p_arr date)
returns table(dep date, arr date)
language plpgsql immutable as $$
declare
  v_ln text; m text[]; v_yr int; v_dep date; v_arr date;
  v_cross boolean; v_dk int; v_ay int; v_ak int; v_k1 int; v_k2 int;
begin
  if p_product ~ '(야마나미|ヤマナミ|山並|간지|ガンジー|쿠주|久住)' and p_product ~ '(시즈|志津|しずの|しづの)' then
    v_yr := extract(year from coalesce(p_dep, p_arr))::int;
    -- 179: 예약이 해를 넘길 때(귀국 연도 > 입국 연도)만 다음 해로 읽을 수 있다(화면의 cross)
    v_cross := p_dep is not null and p_arr is not null and extract(year from p_arr) > extract(year from p_dep);
    if v_cross then
      v_dk := extract(month from p_dep)::int * 100 + extract(day from p_dep)::int;
      v_ay := extract(year from p_arr)::int;
      v_ak := extract(month from p_arr)::int * 100 + extract(day from p_arr)::int;
    end if;
    foreach v_ln in array regexp_split_to_array(coalesce(p_remark,''), E'\r?\n') loop
      continue when v_ln !~ '(시즈|志津|しずの|しづの)';
      m := regexp_match(v_ln, '(\d{1,2})\s*/\s*(\d{1,2})\s*[-~〜～]\s*(?:(\d{1,2})\s*/\s*)?(\d{1,2})(?!\s*/)');
      if m is not null then
        begin
          v_k1 := m[1]::int * 100 + m[2]::int;
          v_k2 := coalesce(m[3], m[1])::int * 100 + m[4]::int;
          -- 179: 입국 연도로 만든 날짜가 입국일보다 앞이고 다음 해의 같은 날짜가 귀국일 이내면 다음 해(날짜마다 따로)
          v_dep := make_date(v_yr + case when v_cross and v_k1 < v_dk and (v_yr + 1 < v_ay or (v_yr + 1 = v_ay and v_k1 <= v_ak)) then 1 else 0 end,
                             m[1]::int, m[2]::int);
          v_arr := make_date(v_yr + case when v_cross and v_k2 < v_dk and (v_yr + 1 < v_ay or (v_yr + 1 = v_ay and v_k2 <= v_ak)) then 1 else 0 end,
                             coalesce(m[3], m[1])::int, m[4]::int);
        exception when others then v_dep := null; end;
        if v_dep is not null and v_dep < v_arr then
          dep := v_dep; arr := v_arr; return next; return;
        end if;
      end if;
    end loop;
  end if;
  dep := p_dep; arr := p_arr; return next;
end $$;

-- ── ② 시즈 자동배정 — 이미 기간이 겹치는 시즈 배정이 있는 사람은 넣지 않는다 ─────────────────────
create or replace function public.shizu_assign_rooms(p_rows jsonb, p_clear_from date default null, p_clear_to date default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_role text; v_areas text[]; r jsonb; n int := 0;
        v_fac text; v_rtype text; v_seq guest_members.event_seq%type; v_src text;
        v_mid uuid; v_ci date; v_co date;
begin
  select role, areas into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not coalesce(coalesce(v_role,'') = 'admin' or area_expand(coalesce(v_areas,'{}')) && array['room','shizu'], false) then
    raise exception '권한 없음(시즈 자동배정 — room 또는 shizu 영역)';
  end if;
  if p_clear_from is not null and p_clear_to is not null then
    delete from rooms where facility = '시즈노야도 료칸' and coalesce(assign_source,'auto') = 'auto'
      and check_in <= p_clear_to and check_out > p_clear_from;
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    select facility, room_type into v_fac, v_rtype from room_inventory where id = (r->>'inventory_id')::uuid;
    if v_fac is distinct from '시즈노야도 료칸' then continue; end if;
    select event_seq into v_seq from guest_members where id = (r->>'member_id')::uuid;
    v_src := case when coalesce(r->>'src','auto') = 'manual' then 'manual' else 'auto' end;
    begin
      v_mid := (r->>'member_id')::uuid;
      v_ci  := (r->>'check_in')::date;
      v_co  := (r->>'check_out')::date;
      -- 179: 이 사람에게 이미 기간이 겹치는 시즈 배정(지우기 뒤에 남은 수기·다른 달 배정, 이 호출의 앞 줄)이 있으면 넣지 않는다
      if not exists (select 1 from rooms x
                      where x.member_id = v_mid and x.facility = '시즈노야도 료칸'
                        and x.check_in < v_co and x.check_out > v_ci) then
        insert into rooms(member_id, event_seq, inventory_id, facility, room_type, room_no, check_in, check_out, assigned_pax, assign_source)
          values(v_mid, v_seq, (r->>'inventory_id')::uuid, v_fac, v_rtype, r->>'room_no', v_ci, v_co, 1, v_src);
        n := n + 1;
      end if;
    exception when others then
      null;
    end;
  end loop;
  return n;
end $$;

-- ── ③ 권한(종전과 같은 선을 다시 명시) ─────────────────────────────────────────
revoke all on function public._shizu_span(text,text,date,date) from public, anon;
grant execute on function public._shizu_span(text,text,date,date) to authenticated;
revoke all on function public.shizu_assign_rooms(jsonb, date, date) from public, anon;
grant execute on function public.shizu_assign_rooms(jsonb, date, date) to authenticated;

-- ── ④ 적용 직후 자기 확인 — 연말 넘김 · 같은 해 그대로 ───────────────────────────────────────
--   다르면 예외로 멈춘다(MCP apply_migration·SQL Editor 처럼 파일 전체가 한 트랜잭션이면 아무것도 바뀌지 않는다 —
--   psql 로 문장마다 실행했다면 ①② 는 적용된 채 남는다. 멱등이라 원인을 고친 뒤 다시 실행하면 된다).
do $t$
declare v record;
begin
  select * into v from public._shizu_span('12/28-1/4 시즈', '야마나미 + 시즈노야도', date '2026-12-26', date '2027-01-05');
  if v.dep is distinct from date '2026-12-28' or v.arr is distinct from date '2027-01-04' then
    raise exception '179 ④: 연말을 넘기는 구간이 다르다(% ~ %, 기대 2026-12-28 ~ 2027-01-04)', v.dep, v.arr;
  end if;
  select * into v from public._shizu_span('9/9-9/16 시즈', '간지호텔 + 시즈노야도', date '2026-09-05', date '2026-09-20');
  if v.dep is distinct from date '2026-09-09' or v.arr is distinct from date '2026-09-16' then
    raise exception '179 ④: 같은 해 구간이 바뀌었다(% ~ %, 기대 2026-09-09 ~ 2026-09-16)', v.dep, v.arr;
  end if;
  select * into v from public._shizu_span('12/28-1/4 시즈', '야마나미 + 시즈노야도', date '2026-01-02', date '2026-01-10');
  if v.dep is distinct from date '2026-01-02' or v.arr is distinct from date '2026-01-10' then
    raise exception '179 ④: 같은 해 예약의 「12/28-1/4」는 종전처럼 예약 기간이어야 한다(% ~ %)', v.dep, v.arr;
  end if;
end $t$;
