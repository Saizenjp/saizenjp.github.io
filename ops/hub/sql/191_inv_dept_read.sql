-- ============================================================================
--  191_inv_dept_read.sql — 재고는 자기 부서만 보기(읽기도 부서별)
--  상태: 적용 완료(2026-11-25, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  Min 2026-11-25 「재고는 막고」(부서별 세부 관리 — 지금은 재고 권한이 한 부서라도 있으면
--  다른 부서 재고·단가·사입 금액까지 다 보였다. 읽기 정책이 using(true) 였다 — SQL 120).
--
--  ① 판정 함수 두 개(부서 키 = 화면 단위 inv_<부서>, 홈 카드·페이지 가드와 같은 키)
--     inv_can_read(dept)  = 그 부서 재고 권한(수정·보기 어느 쪽이든) 또는 정산(settle) 권한 — 관리자는 늘 통과.
--                           정산은 사입 금액을 보는 곳이라 전 부서를 본다(docs/ecosystem-review.md §5).
--     inv_can_write(dept) = 그 부서 재고의 수정 권한.
--     area_expand 로 판정하므로 그룹 키(예: room)를 가진 사람은 그 자식 inv_room 을 가진 것과 같다(지금 계정 그대로 동작).
--  ② 쓰기도 같은 부서 키로 좁힌다. 전에는 그룹 키(kitchen 등)로 판정해 「주방 화면(kds)」만 가진 사람도
--     DB 에서는 F&B 재고를 고칠 수 있었다(화면에서는 버튼이 숨어 있었다).
--  ③ inv_items · inv_txns(품목의 부서를 따른다) · inv_suppliers 의 보기·쓰기 정책을 다시 만든다.
--     v_inv_spend(월 사입 집계)는 security_invoker 라 이 정책을 그대로 따른다.
--     RESTRICTIVE active_staff_only(189)는 그대로 둔다.
--  ④ 재고 입출고 함수 inv_move(182 — security definer)는 본문에서 그 부서 쓰기 권한을 확인한다 →
--     본문 안의 has_any_area(array[inv_dept_area(…)]) 를 inv_can_write(…) 로 바꾼다(처음 확인 + 잠근 뒤 다시 확인 = 두 번 나와야 한다).
--
--  멱등. 되돌리기: 정책 *_sel 을 using(true) 로, 쓰기 정책을 has_any_area(array[inv_dept_area(dept)]) 로(120 판).
-- ============================================================================

-- ── ⓪ 적용 전 확인 ─────────────────────────────────────────────────────────────
do $chk$
begin
  if to_regclass('public.inv_items') is null or to_regclass('public.inv_txns') is null or to_regclass('public.inv_suppliers') is null then
    raise exception '191: inv_items·inv_txns·inv_suppliers 가 없다';
  end if;
  if to_regprocedure('public.has_any_read_area(text[])') is null or to_regprocedure('public.has_any_area(text[])') is null then
    raise exception '191: has_any_area·has_any_read_area 가 없다';
  end if;
  if exists (select 1 from public.inv_items i
              where not exists (select 1 from public.area_tree t where t.child = 'inv_' || i.dept)) then
    raise exception '191: area_tree 에 없는 재고 부서가 있다 — 그 부서는 관리자만 보게 된다(먼저 확인)';
  end if;
end $chk$;

-- ── ① 판정 함수 ───────────────────────────────────────────────────────────────
create or replace function public.inv_can_read(p_dept text) returns boolean
language sql stable set search_path = public as $$
  select public.has_any_read_area(array['inv_' || coalesce(p_dept, ''), 'settle']);
$$;
create or replace function public.inv_can_write(p_dept text) returns boolean
language sql stable set search_path = public as $$
  select public.has_any_area(array['inv_' || coalesce(p_dept, '')]);
$$;
revoke all on function public.inv_can_read(text) from public, anon;
revoke all on function public.inv_can_write(text) from public, anon;
grant execute on function public.inv_can_read(text) to authenticated;
grant execute on function public.inv_can_write(text) to authenticated;
comment on function public.inv_can_read(text)  is '191 — 그 부서 재고를 볼 수 있는가(inv_<부서> 수정·보기 또는 settle · 관리자).';
comment on function public.inv_can_write(text) is '191 — 그 부서 재고를 고칠 수 있는가(inv_<부서> 수정 · 관리자).';

-- ── ② inv_items ───────────────────────────────────────────────────────────────
drop policy if exists inv_items_sel on public.inv_items;
drop policy if exists inv_items_ins on public.inv_items;
drop policy if exists inv_items_upd on public.inv_items;
drop policy if exists inv_items_del on public.inv_items;
create policy inv_items_sel on public.inv_items for select to authenticated using (public.inv_can_read(dept));
create policy inv_items_ins on public.inv_items for insert to authenticated with check (public.inv_can_write(dept));
create policy inv_items_upd on public.inv_items for update to authenticated using (public.inv_can_write(dept)) with check (public.inv_can_write(dept));
create policy inv_items_del on public.inv_items for delete to authenticated using (public.inv_can_write(dept));

-- ── ③ inv_txns — 품목의 부서를 따른다 ─────────────────────────────────────────
drop policy if exists inv_txns_sel on public.inv_txns;
drop policy if exists inv_txns_ins on public.inv_txns;
drop policy if exists inv_txns_upd on public.inv_txns;
drop policy if exists inv_txns_del on public.inv_txns;
create policy inv_txns_sel on public.inv_txns for select to authenticated
  using (exists (select 1 from public.inv_items i where i.id = inv_txns.item_id and public.inv_can_read(i.dept)));
create policy inv_txns_ins on public.inv_txns for insert to authenticated
  with check (exists (select 1 from public.inv_items i where i.id = inv_txns.item_id and public.inv_can_write(i.dept)));
create policy inv_txns_upd on public.inv_txns for update to authenticated
  using (exists (select 1 from public.inv_items i where i.id = inv_txns.item_id and public.inv_can_write(i.dept)))
  with check (exists (select 1 from public.inv_items i where i.id = inv_txns.item_id and public.inv_can_write(i.dept)));
create policy inv_txns_del on public.inv_txns for delete to authenticated
  using (exists (select 1 from public.inv_items i where i.id = inv_txns.item_id and public.inv_can_write(i.dept)));

-- ── ④ inv_suppliers ───────────────────────────────────────────────────────────
drop policy if exists invs_sel on public.inv_suppliers;
drop policy if exists invs_ins on public.inv_suppliers;
drop policy if exists invs_upd on public.inv_suppliers;
drop policy if exists invs_del on public.inv_suppliers;
create policy invs_sel on public.inv_suppliers for select to authenticated using (public.inv_can_read(dept));
create policy invs_ins on public.inv_suppliers for insert to authenticated with check (public.inv_can_write(dept));
create policy invs_upd on public.inv_suppliers for update to authenticated using (public.inv_can_write(dept)) with check (public.inv_can_write(dept));
create policy invs_del on public.inv_suppliers for delete to authenticated using (public.inv_can_write(dept));

-- ── ⑤ inv_move(182) — 본문의 권한 확인을 같은 부서 키로 ─────────────────────────
do $mv$
declare d text; n int; pat text := 'has_any_area(array[inv_dept_area(';
begin
  if to_regprocedure('public.inv_move(uuid,numeric,numeric,text,text,numeric,text)') is null then
    raise notice '191 ⑤: inv_move 가 없다 — 건너뜀'; return;
  end if;
  d := pg_get_functiondef('public.inv_move(uuid,numeric,numeric,text,text,numeric,text)'::regprocedure);
  if position('inv_can_write(' in d) > 0 then raise notice '191 ⑤: 이미 바뀜'; return; end if;
  n := (length(lower(d)) - length(replace(lower(d), pat, ''))) / length(pat);
  if n <> 2 then
    raise exception '191 ⑤: inv_move 본문의 「%」 가 %번 — 2번이어야 한다(본문 확인)', pat, n;
  end if;
  -- has_any_area(array[inv_dept_area(X)]) → inv_can_write(X) : 괄호 짝 「)])」 를 「)」 로
  d := regexp_replace(d, 'has_any_area\(array\[inv_dept_area\(([^()]*)\)\]\)', 'inv_can_write(\1)', 'gi');
  if position('inv_dept_area(' in d) > 0 or position('inv_can_write(' in d) = 0 then raise exception '191 ⑤: 치환 실패(본문 꼴이 예상과 다르다)'; end if;
  execute d;
  raise notice '191 ⑤: inv_move 권한 확인 → inv_can_write';
end $mv$;

-- ── ⑥ 적용 뒤 확인 ─────────────────────────────────────────────────────────────
do $post$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('inv_items','inv_txns','inv_suppliers')
              and cmd = 'SELECT' and permissive = 'PERMISSIVE' and qual = 'true') then
    raise exception '191: 재고 읽기 정책에 using(true) 가 남았다';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('inv_items','inv_txns','inv_suppliers')
        and permissive = 'PERMISSIVE') <> 12 then
    raise exception '191: 재고 정책 수가 12(3표 × 보기·넣기·고치기·지우기)가 아니다';
  end if;
  if to_regprocedure('public.inv_move(uuid,numeric,numeric,text,text,numeric,text)') is not null
     and (select prosrc from pg_proc where oid = 'public.inv_move(uuid,numeric,numeric,text,text,numeric,text)'::regprocedure) not like '%inv_can_write(%' then
    raise exception '191: inv_move 가 아직 옛 권한 확인이다';
  end if;
end $post$;

notify pgrst, 'reload schema';
