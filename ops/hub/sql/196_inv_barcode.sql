-- ============================================================================
--  196_inv_barcode.sql — 재고 1단계: 바코드 · 엑셀 일괄 등록 · 실사 한 번에
--  상태: 적용 전
-- ----------------------------------------------------------------------------
--  Min 2026-11-26 「재고 관리를 모두 수기 입력 할 순 없으니까」「1단계부터 진행해」(설계: 등록은 파일로 한꺼번에,
--  입고·사용은 바코드로, 실사는 세고 한 번에 반영).
--
--  ① inv_items 에 바코드 칸 — barcode(낱개 JAN 등) · case_barcode(박스) · case_qty(박스 입수, 박스를 찍으면 이 수만큼).
--     같은 부서 안에서 한 바코드는 한 품목·한 칸에만(낱개·박스 칸을 가로질러서도) — 트리거가 막는다(23505).
--     바코드는 공백을 지우고 대문자로 저장한다(스캐너·엑셀 표기 차이 흡수). 숫자만 비교하지 않는다(Code128 영문 포함).
--  ② inv_import(부서, 줄 배열, 작성자) — 엑셀 일괄 등록을 한 트랜잭션으로(최대 5000줄).
--     줄마다 같은 품목 찾기: 낱개·박스 바코드 → 없으면 같은 이름(그 부서에 하나뿐일 때). 찾으면 **적힌 칸만** 고치고(빈 칸은 그대로),
--     없으면 새로 만든다(첫 재고가 있으면 입고 이력 「일괄 등록」). 기존 품목의 현재고는 바꾸지 않는다(그건 실사).
--     거래처 이름이 그 부서에 없으면 새로 만든다. 한 줄이 틀려도 그 줄만 건너뛰고 이유를 돌려준다.
--     같은 파일 안에 같은 바코드(바코드 없는 줄은 같은 이름)가 두 번이면 뒤 줄은 오류(앞 줄 품목을 덮어쓰지 않게).
--  ③ inv_stocktake(부서, [{item, expect, counted}], 작성자, 메모) — 실사를 한 번에. 줄마다 품목을 잠그고,
--     현재고가 화면이 읽은 값(expect)과 같을 때만 counted 로 맞추고 「실사조정」 이력을 남긴다. 다르면(그 사이 입출고) 건너뛰고 알려 준다.
--  권한: 두 함수 모두 inv_can_write(부서)(SQL 191) — 관리자 통과. security definer · anon 실행 불가.
--
--  멱등. 되돌리기: drop function inv_import·inv_stocktake · drop trigger inv_items_code_guard · 세 칸 drop.
-- ============================================================================

-- ── ⓪ 적용 전 확인 ─────────────────────────────────────────────────────────────
do $chk$
begin
  if to_regclass('public.inv_items') is null or to_regclass('public.inv_txns') is null or to_regclass('public.inv_suppliers') is null then
    raise exception '196: inv_items·inv_txns·inv_suppliers 가 없다';
  end if;
  if to_regprocedure('public.inv_can_write(text)') is null then
    raise exception '196: inv_can_write 가 없다 — SQL 191 먼저';
  end if;
end $chk$;

-- ── ① 바코드 칸 ───────────────────────────────────────────────────────────────
alter table public.inv_items add column if not exists barcode      text;
alter table public.inv_items add column if not exists case_barcode text;
alter table public.inv_items add column if not exists case_qty     numeric(14,2);
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'inv_items_case_qty_pos' and conrelid = 'public.inv_items'::regclass) then
    alter table public.inv_items add constraint inv_items_case_qty_pos check (case_qty is null or case_qty > 0);
  end if;
end $c$;
comment on column public.inv_items.barcode      is '196 — 낱개 바코드(JAN 등, 공백 없음·대문자). 같은 부서 안에서 유일(박스 칸 포함).';
comment on column public.inv_items.case_barcode is '196 — 박스 바코드. 찍으면 case_qty 만큼.';
comment on column public.inv_items.case_qty     is '196 — 박스 입수(박스 바코드 1번 = 이 수량).';

create index if not exists inv_items_dept_barcode_idx      on public.inv_items(dept, barcode)      where barcode is not null;
create index if not exists inv_items_dept_case_barcode_idx on public.inv_items(dept, case_barcode) where case_barcode is not null;

create or replace function public.inv_code_norm(p text) returns text
language sql immutable set search_path = public as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')), '');
$$;
revoke all on function public.inv_code_norm(text) from public, anon;
grant execute on function public.inv_code_norm(text) to authenticated;

create or replace function public.inv_items_code_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.barcode      := inv_code_norm(new.barcode);
  new.case_barcode := inv_code_norm(new.case_barcode);
  if new.barcode is not null and new.barcode = new.case_barcode then
    raise exception '바코드: 낱개와 박스 바코드가 같다(%)', new.barcode using errcode = '23505';
  end if;
  if new.barcode is not null or new.case_barcode is not null then
    -- 같은 부서 다른 품목과 겹치는지(낱개·박스 칸 어느 쪽이든). 동시 저장은 부서 단위 잠금으로 한 줄로 세운다.
    perform pg_advisory_xact_lock(hashtext('inv_code:' || coalesce(new.dept, '')));
    if exists (select 1 from inv_items i
                where i.dept = new.dept and i.id <> new.id
                  and (i.barcode in (new.barcode, new.case_barcode) or i.case_barcode in (new.barcode, new.case_barcode))) then
      raise exception '바코드: 이 부서에 같은 바코드가 이미 있다(%)', coalesce(new.barcode, new.case_barcode) using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists inv_items_code_guard on public.inv_items;
create trigger inv_items_code_guard before insert or update of barcode, case_barcode, dept on public.inv_items
  for each row execute function public.inv_items_code_guard();

-- ── ② 엑셀 일괄 등록 ──────────────────────────────────────────────────────────
--  p_rows = [{name, name_ja, category, unit, location, par, cost, supplier, barcode, case_barcode, case_qty, qty}] — 빈 칸은 없는 것으로 본다
--  반환 = {inserted, updated, unchanged, suppliers_added, errors:[{row(1부터), msg}]}
create or replace function public.inv_import(p_dept text, p_rows jsonb, p_by text default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  r jsonb; i int := 0; v_ins int := 0; v_upd int := 0; v_same int := 0; v_sup_new int := 0;
  v_err jsonb := '[]'::jsonb;
  v_name text; v_bc text; v_cbc text; v_cq numeric; v_par numeric; v_cost numeric; v_qty numeric; v_sname text;
  v_id uuid; v_sup uuid; v_n int; v_by text; v_claims jsonb; v_cur inv_items%rowtype; v_new inv_items%rowtype;
  v_seen_codes text[] := '{}'; v_seen_names text[] := '{}';
  num_re constant text := '^-?[0-9]+(\.[0-9]+)?$';
begin
  if p_dept is null or not exists (select 1 from area_tree t where t.child = 'inv_' || p_dept) then
    raise exception 'inv_import: 부서가 올바르지 않다(%)', p_dept using errcode = '22023';
  end if;
  if not coalesce(inv_can_write(p_dept), false) then
    raise exception 'inv_import: 권한 없음 — 이 부서(%) 재고의 쓰기 권한이 필요합니다', p_dept using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'inv_import: 줄 배열이 아니다' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'inv_import: 한 번에 5000줄까지(%줄) — 파일을 나눠 올리세요', jsonb_array_length(p_rows) using errcode = '22023';
  end if;
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_by := left(coalesce(nullif(btrim(p_by), ''), nullif(v_claims -> 'user_metadata' ->> 'name', ''), nullif(v_claims ->> 'email', ''), 'import'), 100);

  for r in select value from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      v_name := nullif(left(btrim(coalesce(r ->> 'name', '')), 200), '');
      v_bc   := inv_code_norm(r ->> 'barcode');
      v_cbc  := inv_code_norm(r ->> 'case_barcode');
      -- 숫자 칸: 비었으면 null, 숫자가 아니면 그 줄 오류
      if coalesce(r ->> 'case_qty', '') <> '' and (r ->> 'case_qty') !~ num_re then raise exception '박스 입수가 숫자가 아니다'; end if;
      if coalesce(r ->> 'par', '')      <> '' and (r ->> 'par')      !~ num_re then raise exception '적정재고가 숫자가 아니다'; end if;
      if coalesce(r ->> 'cost', '')     <> '' and (r ->> 'cost')     !~ num_re then raise exception '단가가 숫자가 아니다'; end if;
      if coalesce(r ->> 'qty', '')      <> '' and (r ->> 'qty')      !~ num_re then raise exception '재고가 숫자가 아니다'; end if;
      v_cq   := nullif(r ->> 'case_qty', '')::numeric;
      v_par  := nullif(r ->> 'par', '')::numeric;
      v_cost := nullif(r ->> 'cost', '')::numeric;
      v_qty  := nullif(r ->> 'qty', '')::numeric;
      if v_cq is not null and v_cq <= 0 then raise exception '박스 입수는 0 보다 커야 한다'; end if;
      if (v_par is not null and (v_par < 0 or v_par >= 1e9)) or (v_cost is not null and (v_cost < 0 or v_cost >= 1e9))
         or (v_qty is not null and (v_qty < 0 or v_qty >= 1e9)) then raise exception '숫자 범위 밖(0 이상)'; end if;
      if v_cbc is not null and v_cq is null then raise exception '박스 바코드에는 박스 입수가 필요하다'; end if;
      -- 같은 파일 안에서 겹침 — 뒤 줄이 앞 줄의 품목을 조용히 덮어쓰지 않게(바코드, 바코드 없는 줄은 이름)
      if (v_bc is not null and v_bc = any(v_seen_codes)) or (v_cbc is not null and v_cbc = any(v_seen_codes)) then
        raise exception '파일 안에 같은 바코드가 두 번(%)', coalesce(v_bc, v_cbc);
      end if;
      if v_bc is null and v_cbc is null and v_name is not null and v_name = any(v_seen_names) then
        raise exception '파일 안에 바코드 없는 같은 이름이 두 번 — 바코드를 넣거나 한 줄로';
      end if;

      -- 거래처(이름 → 그 부서 거래처, 없으면 새로)
      v_sup := null; v_sname := nullif(left(btrim(coalesce(r ->> 'supplier', '')), 120), '');
      if v_sname is not null then
        select s.id into v_sup from inv_suppliers s where s.dept = p_dept and btrim(s.name) = v_sname order by s.active desc limit 1;
        if v_sup is null then
          insert into inv_suppliers(dept, name) values (p_dept, v_sname) returning id into v_sup;
          v_sup_new := v_sup_new + 1;
        end if;
      end if;

      -- 같은 품목 찾기: 바코드 → 이름(그 부서에 하나뿐일 때)
      v_id := null;
      if v_bc is not null or v_cbc is not null then
        select it.id into v_id from inv_items it
         where it.dept = p_dept and (it.barcode in (v_bc, v_cbc) or it.case_barcode in (v_bc, v_cbc)) limit 1;
      end if;
      if v_id is null and v_name is not null then
        select count(*), min(it.id::text)::uuid into v_n, v_id from inv_items it where it.dept = p_dept and btrim(it.name_ko) = v_name;
        if v_n > 1 then raise exception '같은 이름의 품목이 %개 — 바코드로 구분하세요', v_n; end if;
      end if;

      if v_id is null then
        if v_name is null then raise exception '품목명이 없다'; end if;
        insert into inv_items(dept, category, name_ko, name_ja, unit, location, par_level, current_qty, unit_cost, supplier_id, barcode, case_barcode, case_qty)
        values (p_dept, coalesce(nullif(btrim(r ->> 'category'), ''), '기타'), v_name, nullif(btrim(coalesce(r ->> 'name_ja', '')), ''),
                coalesce(nullif(btrim(r ->> 'unit'), ''), '個'), nullif(btrim(coalesce(r ->> 'location', '')), ''),
                coalesce(v_par, 0), coalesce(v_qty, 0), v_cost, v_sup, v_bc, v_cbc, v_cq)
        returning id into v_id;
        if coalesce(v_qty, 0) > 0 then
          insert into inv_txns(item_id, delta, reason, note, qty_after, created_by, unit_cost, amount, supplier_id)
          values (v_id, v_qty, '입고', '일괄 등록', v_qty, v_by, v_cost, case when v_cost is not null then v_cost * v_qty end, v_sup);
        end if;
        v_ins := v_ins + 1;
      else
        select * into v_cur from inv_items where id = v_id for update;
        update inv_items set
          name_ko      = coalesce(v_name, name_ko),
          name_ja      = coalesce(nullif(btrim(coalesce(r ->> 'name_ja', '')), ''), name_ja),
          category     = coalesce(nullif(btrim(coalesce(r ->> 'category', '')), ''), category),
          unit         = coalesce(nullif(btrim(coalesce(r ->> 'unit', '')), ''), unit),
          location     = coalesce(nullif(btrim(coalesce(r ->> 'location', '')), ''), location),
          par_level    = coalesce(v_par, par_level),
          unit_cost    = coalesce(v_cost, unit_cost),
          supplier_id  = coalesce(v_sup, supplier_id),
          barcode      = coalesce(v_bc, barcode),
          case_barcode = coalesce(v_cbc, case_barcode),
          case_qty     = coalesce(v_cq, case_qty)
        where id = v_id
        returning * into v_new;
        if row(v_new.name_ko, v_new.name_ja, v_new.category, v_new.unit, v_new.location, v_new.par_level, v_new.unit_cost, v_new.supplier_id, v_new.barcode, v_new.case_barcode, v_new.case_qty)
           is not distinct from
           row(v_cur.name_ko, v_cur.name_ja, v_cur.category, v_cur.unit, v_cur.location, v_cur.par_level, v_cur.unit_cost, v_cur.supplier_id, v_cur.barcode, v_cur.case_barcode, v_cur.case_qty) then
          v_same := v_same + 1;
        else
          v_upd := v_upd + 1;
        end if;
      end if;
    exception when others then
      v_err := v_err || jsonb_build_object('row', i, 'msg', left(sqlerrm, 200));
      continue;
    end;
    -- 이 줄이 성공했을 때만 「본 것」에 넣는다(오류 줄의 바코드는 다음 줄을 막지 않는다)
    if v_bc  is not null then v_seen_codes := v_seen_codes || v_bc;  end if;
    if v_cbc is not null then v_seen_codes := v_seen_codes || v_cbc; end if;
    if v_bc is null and v_cbc is null and v_name is not null then v_seen_names := v_seen_names || v_name; end if;
  end loop;

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd, 'unchanged', v_same, 'suppliers_added', v_sup_new, 'errors', v_err);
end $fn$;
revoke all on function public.inv_import(text, jsonb, text) from public, anon;
grant execute on function public.inv_import(text, jsonb, text) to authenticated;
comment on function public.inv_import(text, jsonb, text) is '196 — 재고 엑셀 일괄 등록(바코드·이름으로 같은 품목 찾기, 적힌 칸만 갱신, 줄 단위 오류).';

-- ── ③ 실사 한 번에 ────────────────────────────────────────────────────────────
--  p_counts = [{item: uuid, expect: 화면이 읽은 현재고, counted: 센 수량}]
--  반환 = {applied, unchanged, stale:[item…], skipped:[{item, msg}]}
create or replace function public.inv_stocktake(p_dept text, p_counts jsonb, p_by text default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  r jsonb; v_item uuid; v_exp numeric; v_cnt numeric; v_cur numeric; v_dept text; v_delta numeric;
  v_ok int := 0; v_same int := 0; v_stale jsonb := '[]'::jsonb; v_skip jsonb := '[]'::jsonb;
  v_by text; v_claims jsonb; v_note text;
begin
  if p_dept is null or not coalesce(inv_can_write(p_dept), false) then
    raise exception 'inv_stocktake: 권한 없음 — 이 부서(%) 재고의 쓰기 권한이 필요합니다', coalesce(p_dept, '') using errcode = '42501';
  end if;
  if p_counts is null or jsonb_typeof(p_counts) <> 'array' or jsonb_array_length(p_counts) > 5000 then
    raise exception 'inv_stocktake: 실사 줄이 없거나 5000줄을 넘는다' using errcode = '22023';
  end if;
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_by := left(coalesce(nullif(btrim(p_by), ''), nullif(v_claims -> 'user_metadata' ->> 'name', ''), nullif(v_claims ->> 'email', ''), 'stocktake'), 100);
  v_note := coalesce(nullif(left(btrim(coalesce(p_note, '')), 500), ''), '실사');

  -- 품목 id 순서로 잠근다(동시에 두 실사가 같은 품목들을 잡아도 교착하지 않게)
  for r in select value from jsonb_array_elements(p_counts) order by value ->> 'item' loop
    begin
      v_item := (r ->> 'item')::uuid;
      v_exp  := (r ->> 'expect')::numeric;
      v_cnt  := round((r ->> 'counted')::numeric, 2);
      if v_item is null or v_exp is null or v_cnt is null then raise exception '품목·읽은 값·센 값이 필요하다'; end if;
      if v_cnt < 0 or v_cnt >= 1e9 then raise exception '센 값은 0 이상'; end if;
      select i.current_qty, i.dept into v_cur, v_dept from inv_items i where i.id = v_item for update;
      if not found then raise exception '품목이 없다(이미 지워졌을 수 있다)'; end if;
      if v_dept is distinct from p_dept then raise exception '다른 부서 품목'; end if;
      if v_cur is distinct from v_exp then
        v_stale := v_stale || to_jsonb(v_item::text);
        continue;
      end if;
      v_delta := v_cnt - v_cur;
      if v_delta = 0 then v_same := v_same + 1; continue; end if;
      update inv_items set current_qty = v_cnt where id = v_item;
      insert into inv_txns(item_id, delta, reason, note, qty_after, created_by)
      values (v_item, v_delta, '실사조정', v_note, v_cnt, v_by);
      v_ok := v_ok + 1;
    exception when others then
      v_skip := v_skip || jsonb_build_object('item', r ->> 'item', 'msg', left(sqlerrm, 200));
    end;
  end loop;
  return jsonb_build_object('applied', v_ok, 'unchanged', v_same, 'stale', v_stale, 'skipped', v_skip);
end $fn$;
revoke all on function public.inv_stocktake(text, jsonb, text, text) from public, anon;
grant execute on function public.inv_stocktake(text, jsonb, text, text) to authenticated;
comment on function public.inv_stocktake(text, jsonb, text, text) is '196 — 실사 한 번에(읽은 값과 같을 때만 반영, 다르면 stale 로 돌려준다).';

-- ── ④ 적용 뒤 확인 ─────────────────────────────────────────────────────────────
do $post$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'inv_items' and column_name = 'case_barcode') then
    raise exception '196: inv_items.case_barcode 가 없다';
  end if;
  if to_regprocedure('public.inv_import(text,jsonb,text)') is null or to_regprocedure('public.inv_stocktake(text,jsonb,text,text)') is null then
    raise exception '196: inv_import·inv_stocktake 가 없다';
  end if;
  if has_function_privilege('anon', 'public.inv_import(text,jsonb,text)', 'execute')
     or has_function_privilege('anon', 'public.inv_stocktake(text,jsonb,text,text)', 'execute') then
    raise exception '196: anon 이 재고 함수를 부를 수 있다';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'inv_items_code_guard' and tgrelid = 'public.inv_items'::regclass) then
    raise exception '196: inv_items_code_guard 트리거가 없다';
  end if;
end $post$;

notify pgrst, 'reload schema';
