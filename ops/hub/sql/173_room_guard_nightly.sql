-- ============================================================================
-- 173_room_guard_nightly.sql — 방 정원 가드·검수식을 「같은 밤 최대 점유」로 (2026-11-20 작성 · 2026-11-21 적용 완료)
--
--  무엇을
--   ① rooms_capacity_guard() — rooms BEFORE INSERT/UPDATE 트리거(trg_rooms_capacity)의 함수.
--      정원 비교를 「기간이 겹치는 행의 인원 합」에서 「새 행이 묵는 밤들 중 가장 붐비는 밤의 인원」으로 바꾼다.
--   ② data_audit() 의 ⑤ 「방 정원 초과」(room_over) — 같은 식(같은 밤 최대) + 퇴실일이 오늘(일본 시간)−7일 이후인 배정만.
--   실행 순서: ② → ① (멈출 수 있는 쪽을 먼저 — ② 가 예외로 멈추면 어떤 방식으로 실행해도 ① 도 바뀌지 않는다).
--
--  왜
--   기간이 겹치기만 하면 다 더하는 식은, 서로 만나지 않는 두 사람을 한 밤에 같이 있는 것처럼 센다.
--   예) 정원 2인 방 · 가 = 1일~15일(앞 절반) · 나 = 15일~29일(뒤 절반) · 다 = 1일~29일(전 기간).
--       어느 밤에도 2명뿐인 정상 배정인데
--        · 다 를 나중에 넣거나, 이미 들어간 다 의 행을 고치면(비고만 고쳐도) 「가+나 = 2, +1 = 3 > 2」로 거부됐다.
--          가·나를 나중에 넣으면 통과 — 저장 순서에 따라 결과가 달랐다.
--        · 검수(room_over)는 다 의 행을 「3/2名」으로 세어 없는 초과를 냈다.
--   방배정 화면(room.html 의 roomOccOver·wzOccOver)은 처음부터 밤 단위 최대(peak)로 본다 → 화면은 「가능」, DB 는 「거부」로 어긋나 있었다.
--   검수 범위: 지나간 배정은 고칠 것이 없다 — 다른 항목(golf_dup 등)처럼 최근 7일 이후만 본다.
--
--  식
--   밤 d 의 점유 = check_in <= d < check_out 인 행의 assigned_pax 합. 점유는 누군가 입실하는 밤에만 늘어난다 →
--   [check_in, check_out) 안의 최대는 「새 행의 첫 밤」 또는 「그 사이에 시작하는 다른 행의 첫 밤」 중 한 곳에서 난다.
--   그래서 밤마다(28박이면 28번) 세지 않고 그 후보 밤만 센다(room.html 의 roomOccOver 와 같은 방법).
--   성능: 가드는 새 행의 기간과 겹치는 행을 한 번만 읽는다(종전과 같은 idx_rooms_inventory 조회 1회) —
--         읽어 둔 몇 줄 안에서 후보 밤별 합을 낸다. 28박이어도 표를 다시 읽지 않는다.
--   종전보다 엄격해지는 경우는 없다 — 같은 행 집합 안에서 「밤 최대 ≤ 겹치는 행의 합」이므로
--   종전에 통과하던 저장은 모두 통과한다(자동 배정·자동 저장이 새로 막히는 길 없음).
--
--  바꾸지 않는 것
--   · app.skip_room_guard = '1'(트랜잭션 한정 우회 — room_swap·shizu_swap_rooms·96·98 이 쓴다)
--   · room_inventory 행 잠금(for update — 같은 방에 동시에 저장하는 두 사람을 줄 세운다)
--   · 정원 = coalesce(max_capacity, capacity) · 객실/날짜/정원이 비면 통과 · UPDATE 때 자기 행 제외
--   · 오류 코드 check_violation · 문구 앞머리 「객실 정원 초과」(화면은 이 문구를 해석하지 않는다)
--   · 함수 속성: security definer 아님 · search_path = public, pg_temp(118) · 실행 권한 없음(트리거 전용, 119)
--   · 트리거 trg_rooms_capacity 자체(40) · data_audit 의 다른 항목·권한(마스터 전용, 로그인 사용자만 실행)
--   · 비로그인(anon)이 실행할 수 있는 security definer 함수 수(15)
--   · room_swap(104)의 「교환 후 정원 확인」은 아직 「겹치는 기간의 합」이다 — 위 예 같은 방은 맞바꾸기만 거부될 수 있다(다음 번호에서 같은 식으로).
--  달라지는 것
--   · 위 예처럼 어느 밤에도 정원 이내인 배정은 저장 순서와 상관없이 통과한다(행 수정도 통과).
--   · 밤이 없는 행(check_out <= check_in)은 어느 밤도 차지하지 않으므로 검사하지 않는다
--     (종전: 그 날짜를 가로지르는 행의 합으로 검사했다. 다른 행을 검사할 때도 이런 행은 세지 않는다).
--   · 오류 문구: 「겹침점유」→「같은 밤 최대 점유」 + 가장 붐비는 밤의 날짜.
--   · 검수 room_over: 퇴실일이 7일 전보다 이른 배정은 세지 않는다. 표본의 「n/정원名」 n = 그 행 기간의 밤 최대 인원.
--
--  바탕
--   ① 67_shizu_swap.sql 의 rooms_capacity_guard 본문(md5 6623dbfa3365b85432e81d794dfb98a1 · 905자 = 2026-11-20 운영 본문) → 전문 교체.
--   ② 운영 본문 텍스트 치환(129 의 ⑤ 블록 문장, 공백·줄바꿈 차이는 허용). 옛 합산 식이 정확히 3번
--      (건수 조건 1 · 표본 조건 1 · 표본 표시 1) 나오지 않으면 예외로 멈추고 아무것도 바꾸지 않는다. 이미 반영돼 있으면 건너뜀.
--  멱등. 00_VERIFY 173. 이 파일이 40·67 의 rooms_capacity_guard 정의를 대체한다(40·67 을 통째로 다시 실행하면 옛 식으로 돌아간다).
--
--  적용 전 확인(읽기 전용 — data_audit 의 운영 본문 31,714자는 저장소에 없다)
--   select (select count(*) from regexp_matches(prosrc, '\(select coalesce\(sum\(b\.assigned_pax\),\s*0\) from rooms b\s+where b\.inventory_id = a\.inventory_id and b\.member_id is not null\s+and b\.check_in < a\.check_out and b\.check_out > a\.check_in\)', 'g')) as n_sum,
--          prosrc ~ '\m(nightly|starts|r2)\M' as name_used
--     from pg_proc where oid = 'public.data_audit()'::regprocedure;      -- 3 · f
--   n_sum 이 3 이 아니면 173 은 예외로 멈춘다(운영 본문을 129 의 ⑤ 블록과 대조).
--   name_used 가 t 면 그 낱말이 변수 선언인지 본문에서 확인한다 — 새 식의 별칭(nightly·starts·r2)이
--   레코드 변수 이름과 겹치면 함수는 만들어지지만 실행할 때 오류가 난다(별칭만이면 문제없다).
--
--  되돌리는 법
--   ① 67_shizu_swap.sql 의 ① 블록(create or replace function rooms_capacity_guard …)을 다시 실행하고
--        alter function public.rooms_capacity_guard() set search_path = public, pg_temp;
--        revoke all on function public.rooms_capacity_guard() from public, anon, authenticated;
--   ② 적용 직전에 select pg_get_functiondef('public.data_audit()'::regprocedure); 결과를 보관해 두었다가 그대로 실행한 뒤
--        revoke all on function public.data_audit() from public, anon;
--        grant execute on function public.data_audit() to authenticated;
--
--  적용 뒤 확인
--   · 00_VERIFY 173 두 줄 · 데이터 검수 화면에서 [재검수] 한 번(오류 없이 돌고 「방 정원 초과」 건수가 나오는지)
--   · select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'execute');   -- 15 (불변)
-- ============================================================================

-- ② data_audit ⑤ room_over — 같은 밤 최대 점유 + 퇴실일이 7일 전 이후인 배정만(운영 본문 텍스트 치환)
--    멈출 수 있는 쪽이라 먼저 실행한다 — 여기서 멈추면 아래 ① 가드도 바뀌지 않는다.
do $do$
declare
  d      text;
  n_sum  int;
  n_whr  int;
  -- 옛 합산 식(129 ⑤). 공백·줄바꿈 차이는 허용한다 — 운영 본문에 정확히 3번 있어야 한다
  p_sum  constant text := $re$\(select coalesce\(sum\(b\.assigned_pax\),\s*0\) from rooms b\s+where b\.inventory_id = a\.inventory_id and b\.member_id is not null\s+and b\.check_in < a\.check_out and b\.check_out > a\.check_in\)$re$;
  -- 그 가운데 where 조건으로 쓰인 2번(건수·표본)
  p_whr  constant text := $re$where a\.member_id is not null(\s+)and $re$ || p_sum || $re$\s*> i\.max_capacity$re$;
  -- 새 식: 그 행의 기간 안에서 시작하는 밤들(자기 첫 밤 포함)마다 점유를 세어 가장 큰 값
  new_sum constant text := $nw$(select coalesce(max(nightly.pax),0) from (
                 select (select coalesce(sum(b.assigned_pax),0) from rooms b
                          where b.inventory_id = a.inventory_id and b.member_id is not null
                            and b.check_in <= starts.night and b.check_out > starts.night) as pax
                 from (select distinct r2.check_in as night from rooms r2
                        where r2.inventory_id = a.inventory_id and r2.member_id is not null
                          and r2.check_in >= a.check_in and r2.check_in < a.check_out) starts) nightly)$nw$;
  new_gate constant text := $nw$a.check_out >= ((now() at time zone 'Asia/Tokyo')::date - 7)$nw$;
begin
  if to_regprocedure('public.data_audit()') is null then
    raise exception '173: data_audit() 가 없다 — 82·129 부터 적용';
  end if;
  d := pg_get_functiondef('public.data_audit()'::regprocedure);
  select count(*) into n_sum from regexp_matches(d, p_sum, 'g');
  if n_sum = 0 and position('as night from rooms r2' in d) > 0 and position(new_gate in d) > 0 then
    raise notice '173: data_audit room_over 는 이미 밤 단위 — 건너뜀';
    return;
  end if;
  if n_sum <> 3 then
    raise exception '173: data_audit 의 방 정원 초과 합산 식이 %번 나온다(3번이어야 한다) — 운영 본문을 129 의 ⑤ 블록과 대조', n_sum;
  end if;
  select count(*) into n_whr from regexp_matches(d, p_whr, 'g');
  if n_whr <> 2 then
    raise exception '173: data_audit 의 방 정원 초과 조건(where a.member_id is not null and … > i.max_capacity)이 %번 나온다(2번이어야 한다)', n_whr;
  end if;
  -- 건수·표본 조건 2곳: 최근 7일 이후 + 새 식
  d := regexp_replace(d, p_whr,
         $r$where a.member_id is not null\1and $r$ || new_gate || $r$\1and $r$ || new_sum || ' > i.max_capacity', 'g');
  -- 표본 표시 1곳: 새 식
  d := regexp_replace(d, p_sum, new_sum, 'g');
  if (select count(*) from regexp_matches(d, p_sum, 'g')) <> 0
     or (length(d) - length(replace(d, new_sum, ''))) / length(new_sum) <> 3
     or (length(d) - length(replace(d, new_gate, ''))) / length(new_gate) <> 2 then
    raise exception '173: 치환 결과가 예상과 다르다 — 적용하지 않음';
  end if;
  execute d;
end $do$;
revoke all on function public.data_audit() from public, anon;
grant execute on function public.data_audit() to authenticated;

-- ① 정원 가드 — 같은 밤 최대 점유
create or replace function public.rooms_capacity_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare cap int; used int; v_night date;
begin
  if coalesce(current_setting('app.skip_room_guard', true), '') = '1' then return NEW; end if;
  if NEW.inventory_id is null or NEW.check_in is null or NEW.check_out is null then return NEW; end if;
  if NEW.check_out <= NEW.check_in then return NEW; end if;          -- 밤이 없는 행은 어느 밤도 차지하지 않는다
  select coalesce(max_capacity, capacity) into cap from room_inventory where id = NEW.inventory_id for update;
  if cap is null then return NEW; end if;
  with o as materialized (
    -- 새 행의 기간과 겹치는 행만 한 번 읽는다(종전과 같은 범위)
    select r.check_in, r.check_out, coalesce(r.assigned_pax, 0) as pax
      from rooms r
     where r.inventory_id = NEW.inventory_id
       and r.check_in < NEW.check_out and r.check_out > NEW.check_in
       and (TG_OP <> 'UPDATE' or r.id <> NEW.id)                    -- 갱신 시 자기 행 제외
  ), starts as (
    -- 점유가 늘 수 있는 밤 = 새 행의 첫 밤 + 그 사이에 시작하는 행의 첫 밤
    select NEW.check_in as night
    union
    select o.check_in from o where o.check_in > NEW.check_in
  )
  select nightly.pax, nightly.night into used, v_night
    from (select s.night,
                 (select coalesce(sum(o.pax), 0) from o
                   where o.check_in <= s.night and o.check_out > s.night) as pax
            from starts s) nightly
   order by nightly.pax desc, nightly.night
   limit 1;
  used := coalesce(used, 0);
  if used + coalesce(NEW.assigned_pax, 0) > cap then
    raise exception '객실 정원 초과 — inventory_id=% 정원=% 같은 밤 최대 점유=% (+%) · 가장 붐비는 밤 % : 더블부킹 차단',
      NEW.inventory_id, cap, used, coalesce(NEW.assigned_pax, 0), v_night using errcode = 'check_violation';
  end if;
  return NEW;
end $$;
revoke all on function public.rooms_capacity_guard() from public, anon, authenticated;

-- 확인
-- select prosecdef, proconfig, prosrc like '%nightly.pax%' from pg_proc where proname = 'rooms_capacity_guard';   -- f · {"search_path=public, pg_temp"} · t
-- select prosrc like '%as night from rooms r2%' from pg_proc where proname = 'data_audit';                         -- t
-- select tgname from pg_trigger where tgrelid = 'public.rooms'::regclass and not tgisinternal;                      -- trg_rooms_capacity 포함

-- ── ⑤ rooms.assigned_pax 기본값 0 → 1 (1행 = 1명) ─────────────────────────────
--   2026-11-20 데이터 정정(시즈 7~8월 수기 배정 67행 0 → 1)의 재발 방지. 값을 넣지 않은 수기 행이 0명으로 들어가
--   통계(occ_room)·검수에서 빠지던 원인. 기존 행은 바꾸지 않는다(정정 뒤 0 인 행 0개).
alter table public.rooms alter column assigned_pax set default 1;
