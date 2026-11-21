-- ============================================================================
--  182_inv_move_menu_code.sql — 재고 입출고를 서버에서 한 번에 · 메뉴 코드 중복을 DB 가 막는다
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  무엇이 문제였나
--   ① 재고 입출고(inventory.html [입고]·[사용]·[실사], 17차)는 화면이 요청을 나눠 보냈다:
--        (1) inv_items.current_qty 를 「화면이 읽은 값과 같을 때만」 update
--        (2) inv_txns 에 이력 한 줄 insert
--        (3) 입고 단가가 바뀌었으면 품목 기준 단가 update
--      (1) 뒤 (2) 가 실패하거나 응답을 못 받으면(와이파이 끊김·태블릿 잠김) 현재고만 바뀌고 원장에 줄이 없다
--      → 원장 합계와 현재고가 어긋난다(화면은 「현재고는 바뀌었지만 이력 기록 실패」라고 알릴 뿐 되돌리지 못한다).
--   ② menu_items.code 에 유일 제약이 없다(13 머리말). 화면(menu.html [추가])이 목록을 보고 막지만,
--      두 기기가 같은 코드를 거의 동시에 넣으면 둘 다 들어간다 → 코드로 품목을 찾는 곳(석식 별주 목록 등)이 엉뚱한 줄을 집는다.
--
--  어떻게 고쳤나
--   ① 새 RPC inv_move(p_item, p_delta, p_expect, p_reason, p_note, p_unit_cost, p_by) — 한 트랜잭션:
--      품목 줄을 잠근다(for update) → 현재고가 p_expect(화면이 읽은 값)와 다르면 오류
--      (P0001 · 메시지 inv_stale = 「다른 기기가 먼저 바꿨다」 — 아무것도 바뀌지 않는다)
--      → current_qty := 현재고 + 변동 · inv_txns 한 줄(qty_after·단가·금액·거래처) · 입고 단가가 오면 품목 기준 단가도 그 값으로.
--      실사(절대값)도 같은 함수: 화면이 p_delta = 실사값 − p_expect, p_reason = '실사조정' 으로 보낸다
--      (현재고 = p_expect 일 때만 반영되므로 결과 = 실사값 그대로).
--      규칙: 변동은 소수 둘째 자리로 반올림(열이 numeric(14,2)) · 0 이면 거부 · 입고 > 0 · 사용·폐기 < 0 · 실사조정 결과 >= 0
--            (사용은 마이너스 재고를 허용 — 화면이 확인창으로 묻고 넣는다, 종전 그대로) · 이유 = 입고/사용/폐기/실사조정/이동(36 주석의 다섯 가지)
--            · 단가는 입고에만(0 이상) · 금액 = 단가 × 변동 · 거래처 = 품목의 주 거래처(입고에만 — 종전 화면과 같은 값).
--      권한 = 그 품목 부서의 쓰기 권한 — RLS 120 과 같은 식 has_any_area(array[inv_dept_area(dept)])
--             (fnb → kitchen, 그 밖에는 부서 이름과 같은 영역 · admin 통과 · 자식 키 inv_fnb·inv_room·inv_hk·inv_golf… 는
--              area_expand 로 부모와 같다(138) · 보기 권한(read_areas)만으로는 안 된다 · 차단 계정(active=false)은 false(49)). 참·거짓으로 판정(coalesce).
--      오류 코드: 권한 42501 · 품목 없음 P0002 · 다른 기기가 먼저 바꿈 P0001(메시지 inv_stale) · 입력 22023.
--      ⚠ 40001(serialization_failure)은 쓰지 않는다 — PostgREST(hasql-transaction)는 40001 을 받으면 트랜잭션을 자동으로
--        다시 돌린다. 이 판정은 다시 돌려도 같은 결과라 요청이 끝없이 되풀이·매달릴 수 있다.
--   ② menu_items(code) 부분 유일 인덱스 menu_items_code_uniq (where coalesce(code,'') <> '') — 빈 코드·null 은 여럿 허용.
--      이미 code 한 열만의 유일 인덱스가 있으면 건너뛴다. 지금 겹치는 코드가 있으면 멈춘다(파일 맨 앞에 두었다 — MCP 는 한 트랜잭션이라
--      ① 도 함께 적용되지 않는다). 겹침 확인:
--        select code, count(*) from menu_items where coalesce(code,'') <> '' group by code having count(*) > 1;
--      대소문자: 화면(menu.html)은 대소문자를 무시하고 막고(b1 = B1), DB 는 글자 그대로만 막는다
--      (코드로 품목을 찾는 곳이 글자 그대로 비교한다 — dinner.html). 운영 확인(2026-11-21): 겹치는 코드 0건.
--
--  하지 않는 일: RLS 변경 없음(SQL 적용 전 배포 대비 화면의 옛 직접 쓰기 길이 남는다) · 품목 추가 때의 초기 입고 줄(addItem)은 그대로 ·
--               기존 재고·이력·메뉴 코드 값 변경 없음.
--  anon 이 실행할 수 있는 security definer 함수 수 변동 없음(15) — 새 함수는 로그인 사용자만.
--  트리거: inv_items 의 trg_inv_items_updated(set_updated_at)·audit_row(45) 는 그대로 돈다(auth.uid() 는 부른 사람).
--  멱등(다시 실행해도 같은 결과 · 같은 이름의 다른 인자 판이 있으면 지운다). 36·109·120·138 이후.
--  옛 파일 머리말 제안(고치지 않음): 36_inventory.sql 「입출고는 182 inv_move 가 한 트랜잭션으로 한다」.
--  되돌리는 법:
--    drop function if exists public.inv_move(uuid, numeric, numeric, text, text, numeric, text);
--    drop index if exists public.menu_items_code_uniq;
--    → inventory.html 은 함수가 없으면(PGRST202·42883) 옛 경로로 저절로 돌아간다. menu.html 은 23505 가 안 오면 종전대로.
-- ============================================================================

-- ── ② 먼저: 메뉴 코드 유일 인덱스 — 겹치는 코드가 있으면 여기서 멈춘다(아래 ① 도 함께 적용되지 않게 맨 앞) ─────────
do $idx$
declare
  v_att smallint;
  v_ex  text;
  v_dup integer;
begin
  if to_regclass('public.menu_items') is null then
    raise notice '182: menu_items 표가 없다 — 메뉴 코드 인덱스는 건너뛴다';
    return;
  end if;
  select a.attnum into v_att
    from pg_attribute a
   where a.attrelid = 'public.menu_items'::regclass and a.attname = 'code' and not a.attisdropped;
  if v_att is null then
    raise notice '182: menu_items.code 열이 없다 — 건너뛴다';
    return;
  end if;
  -- 이미 code 한 열만의 유일 인덱스(이름 무관 · 부분 인덱스 포함)가 있으면 건너뜀
  select c.relname into v_ex
    from pg_index i join pg_class c on c.oid = i.indexrelid
   where i.indrelid = 'public.menu_items'::regclass
     and i.indisunique and i.indnatts = 1 and i.indkey[0] = v_att
   limit 1;
  if v_ex is not null then
    raise notice '182: menu_items.code 유일 인덱스 % 가 이미 있다 — 건너뛴다', v_ex;
    return;
  end if;
  select count(*) into v_dup
    from (select m.code from public.menu_items m
           where coalesce(m.code, '') <> ''
           group by m.code having count(*) > 1) d;
  if v_dup > 0 then
    raise exception '182: menu_items.code 가 겹치는 코드가 %개 있다 — 먼저 정리하고 다시 실행한다(182 머리말의 확인 쿼리)', v_dup;
  end if;
  create unique index menu_items_code_uniq on public.menu_items (code) where coalesce(code, '') <> '';
  raise notice '182: menu_items_code_uniq 를 만들었다';
end $idx$;

-- ── ① 재고 입출고 RPC ─────────────────────────────────────────────────────────
--  (가) 같은 이름의 다른 인자 판 정리(초안·옛 판이 남아 있으면 PostgREST 가 어느 것을 부를지 헷갈린다)
do $drop$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = 'inv_move'
       and p.oid is distinct from to_regprocedure('public.inv_move(uuid,numeric,numeric,text,text,numeric,text)')::oid
  loop
    raise notice '182: 같은 이름의 다른 인자 판 % 를 지운다', r.sig;
    execute 'drop function ' || r.sig;
  end loop;
end $drop$;

--  (나) 본체
--   반환 = {ok, item_id, txn_id, reason, before, delta, after, unit_cost, amount}
create or replace function public.inv_move(
  p_item      uuid,
  p_delta     numeric,
  p_expect    numeric,
  p_reason    text,
  p_note      text    default null,
  p_unit_cost numeric default null,
  p_by        text    default null
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_dept   text;
  v_cur    numeric;
  v_sup    uuid;
  v_delta  numeric;
  v_after  numeric;
  v_cost   numeric;
  v_amt    numeric;
  v_note   text;
  v_claims jsonb;
  v_by     text;
  v_txn    uuid;
begin
  if p_item is null then
    raise exception 'inv_move: 품목(p_item)이 없다' using errcode = '22023';
  end if;

  -- 품목·부서 — 권한을 먼저 본다(권한 없는 호출이 품목 줄을 잠그지 않게)
  select i.dept into v_dept from inv_items i where i.id = p_item;
  if not found then
    raise exception 'inv_move: 품목이 없다(inv_item_missing — 이미 지워졌을 수 있다)' using errcode = 'P0002';
  end if;
  -- 권한 — RLS 120 과 같은 식(그 품목 부서의 쓰기 권한) · 참·거짓
  if not coalesce(has_any_area(array[inv_dept_area(v_dept)]), false) then
    raise exception 'inv_move: 권한 없음 — 이 부서(%) 재고의 쓰기 권한이 필요합니다', coalesce(v_dept, '') using errcode = '42501';
  end if;

  -- 입력 검사
  if p_reason is null or p_reason not in ('입고', '사용', '폐기', '실사조정', '이동') then
    raise exception 'inv_move: 이유는 입고·사용·폐기·실사조정·이동 중 하나(%)', p_reason using errcode = '22023';
  end if;
  if p_delta is null or p_expect is null then
    raise exception 'inv_move: 변동(p_delta)·화면이 읽은 현재고(p_expect)가 없다' using errcode = '22023';
  end if;
  if abs(p_delta) >= 100000000000 then
    raise exception 'inv_move: 변동이 너무 크다(%)', p_delta using errcode = '22023';
  end if;
  v_delta := round(p_delta, 2);              -- 열이 numeric(14,2) — 소수 둘째 자리
  if v_delta = 0 then
    raise exception 'inv_move: 변동이 없다(0)' using errcode = '22023';
  end if;
  if p_reason = '입고' and v_delta < 0 then
    raise exception 'inv_move: 입고는 0 보다 커야 한다(%)', v_delta using errcode = '22023';
  end if;
  if p_reason in ('사용', '폐기') and v_delta > 0 then
    raise exception 'inv_move: 사용·폐기는 0 보다 작아야 한다(%)', v_delta using errcode = '22023';
  end if;
  if p_unit_cost is not null then
    if p_reason <> '입고' then
      raise exception 'inv_move: 단가는 입고에만 붙인다(%)', p_reason using errcode = '22023';
    end if;
    if p_unit_cost < 0 or p_unit_cost >= 1000000000 then
      raise exception 'inv_move: 단가 범위 밖(%)', p_unit_cost using errcode = '22023';
    end if;
  end if;

  -- 품목 줄을 잠그고 다시 읽는다 — 같은 품목을 동시에 바꾸는 호출은 여기서 한 줄로 선다(뒤에 온 쪽은 앞이 끝난 값을 본다)
  select i.dept, i.current_qty, i.supplier_id into v_dept, v_cur, v_sup
    from inv_items i
   where i.id = p_item
     for update;
  if not found then
    raise exception 'inv_move: 품목이 없다(inv_item_missing — 이미 지워졌을 수 있다)' using errcode = 'P0002';
  end if;
  if not coalesce(has_any_area(array[inv_dept_area(v_dept)]), false) then   -- 그 사이 부서가 바뀌었으면 다시 본다
    raise exception 'inv_move: 권한 없음 — 이 부서(%) 재고의 쓰기 권한이 필요합니다', coalesce(v_dept, '') using errcode = '42501';
  end if;
  -- 다른 기기가 먼저 바꿈 — P0001(40001 은 PostgREST 가 트랜잭션을 다시 돌려 끝없이 되풀이될 수 있어 쓰지 않는다)
  if v_cur is distinct from p_expect then
    raise exception 'inv_move: inv_stale — 다른 기기가 먼저 수량을 바꿨다(지금 %, 화면이 읽은 값 %) · 아무것도 바꾸지 않았다', v_cur, p_expect
      using errcode = 'P0001';
  end if;
  v_after := v_cur + v_delta;
  if abs(v_after) >= 1000000000000 then
    raise exception 'inv_move: 처리 뒤 수량이 범위 밖(%)', v_after using errcode = '22023';
  end if;
  if p_reason = '실사조정' and v_after < 0 then
    raise exception 'inv_move: 실사 결과는 0 이상(%)', v_after using errcode = '22023';
  end if;

  -- 단가·금액·거래처는 입고에만(109 — 사용·실사에는 금액을 붙이지 않는다 · 거래처 = 품목의 주 거래처, 종전 화면과 같은 값)
  if p_reason = '입고' then
    v_cost := p_unit_cost;
    v_amt  := case when p_unit_cost is not null then p_unit_cost * v_delta end;
  else
    v_cost := null;
    v_amt  := null;
    v_sup  := null;
  end if;

  v_note   := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  -- 작성자 = 화면이 준 이름 → 로그인 이름 → 이메일 → 'inv' (180 과 같은 꼴 · 종전 화면도 created_by 를 직접 넣었다)
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_by     := left(coalesce(nullif(btrim(p_by), ''),
                            nullif(v_claims -> 'user_metadata' ->> 'name', ''),
                            nullif(v_claims ->> 'email', ''),
                            'inv'), 100);

  update inv_items
     set current_qty = v_after,
         unit_cost   = coalesce(v_cost, unit_cost)     -- 입고 단가가 오면 품목 기준 단가도 최신값(다음 입고 기본값)
   where id = p_item;

  insert into inv_txns(item_id, delta, reason, note, qty_after, created_by, unit_cost, amount, supplier_id)
  values (p_item, v_delta, p_reason, v_note, v_after, v_by, v_cost, v_amt, v_sup)
  returning id into v_txn;

  return jsonb_build_object(
    'ok', true, 'item_id', p_item, 'txn_id', v_txn, 'reason', p_reason,
    'before', v_cur, 'delta', v_delta, 'after', v_after,
    'unit_cost', v_cost, 'amount', v_amt);
end $fn$;

comment on function public.inv_move(uuid, numeric, numeric, text, text, numeric, text) is
  '재고 입출고·실사(182) — 품목 줄 잠금 + 현재고가 p_expect 와 같을 때만 현재고·이력(inv_txns)·기준 단가를 한 트랜잭션. 다르면 P0001(메시지 inv_stale). 권한 = 그 품목 부서의 쓰기(inv_dept_area, RLS 120 과 같은 선).';

-- ── 권한 — 로그인 사용자만(anon 불가) ─────────────────────────────────────────
revoke all on function public.inv_move(uuid, numeric, numeric, text, text, numeric, text) from public, anon;
grant execute on function public.inv_move(uuid, numeric, numeric, text, text, numeric, text) to authenticated;

-- ── 확인용(읽기만) ───────────────────────────────────────────────────────
--   select proname, prosecdef, proconfig from pg_proc where proname = 'inv_move';                     -- 1행 · t · {search_path=public}
--   select has_function_privilege('anon', 'public.inv_move(uuid,numeric,numeric,text,text,numeric,text)', 'execute');   -- f
--   select indexname, indexdef from pg_indexes where tablename = 'menu_items' and indexname = 'menu_items_code_uniq';
--   원장과 현재고 대조(이 함수 뒤로 어긋남이 늘지 않아야 한다 — 초기 등록·옛 경로 줄은 종전 그대로):
--     select i.id, i.current_qty, t.qty_after from inv_items i
--       join lateral (select qty_after from inv_txns x where x.item_id = i.id order by created_at desc limit 1) t on true
--      where t.qty_after is distinct from i.current_qty;
