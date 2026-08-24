-- ============================================================================
-- 120_inv_depts.sql — 재고·사입을 부서별로 (SaiZen ops)
--
--  배경: 재고(inv_items·inv_txns·inv_suppliers)의 쓰기 권한이 kitchen·room 두 영역
--        고정이라, 화면에는 골프 부서가 있는데 골프 담당자는 저장할 수 없었다.
--        부서가 늘어날수록(청소·프론트·시즈) 같은 문제가 반복된다.
--
--  변경: **그 행의 dept 에 해당하는 영역을 가진 사람만** 쓴다.
--        dept 'fnb' → 영역 'kitchen', 그 밖에는 dept 와 같은 이름의 영역.
--        (admin 은 has_any_area 안에서 이미 전부 통과)
--        읽기는 지금처럼 로그인 전체 — 다른 부서 재고를 보는 것은 막지 않는다.
--
--  멱등. Supabase SQL Editor 수동 실행. 번호 120.
-- ============================================================================

-- dept → 권한영역 (한 곳에서만 정의한다)
create or replace function inv_dept_area(p_dept text)
returns text language sql immutable
set search_path = public
as $$ select case when coalesce(p_dept,'') = 'fnb' then 'kitchen' else coalesce(p_dept,'') end $$;

revoke all on function inv_dept_area(text) from public;
grant execute on function inv_dept_area(text) to authenticated;

-- ── inv_items : 행의 dept 로 판정 ──────────────────────────────────────────
alter table inv_items enable row level security;
drop policy if exists inv_items_sel on inv_items;
drop policy if exists inv_items_ins on inv_items;
drop policy if exists inv_items_upd on inv_items;
drop policy if exists inv_items_del on inv_items;

create policy inv_items_sel on inv_items for select to authenticated using (true);
create policy inv_items_ins on inv_items for insert to authenticated
  with check ( has_any_area(array[ inv_dept_area(dept) ]) );
create policy inv_items_upd on inv_items for update to authenticated
  using      ( has_any_area(array[ inv_dept_area(dept) ]) )
  with check ( has_any_area(array[ inv_dept_area(dept) ]) );
create policy inv_items_del on inv_items for delete to authenticated
  using      ( has_any_area(array[ inv_dept_area(dept) ]) );

-- ── inv_txns : 자기 dept 가 없다 → 물린 품목의 dept 를 따라간다 ────────────
alter table inv_txns enable row level security;
drop policy if exists inv_txns_sel on inv_txns;
drop policy if exists inv_txns_ins on inv_txns;
drop policy if exists inv_txns_upd on inv_txns;
drop policy if exists inv_txns_del on inv_txns;

create policy inv_txns_sel on inv_txns for select to authenticated using (true);
create policy inv_txns_ins on inv_txns for insert to authenticated
  with check ( exists (select 1 from inv_items i
                        where i.id = inv_txns.item_id
                          and has_any_area(array[ inv_dept_area(i.dept) ])) );
create policy inv_txns_upd on inv_txns for update to authenticated
  using      ( exists (select 1 from inv_items i
                        where i.id = inv_txns.item_id
                          and has_any_area(array[ inv_dept_area(i.dept) ])) )
  with check ( exists (select 1 from inv_items i
                        where i.id = inv_txns.item_id
                          and has_any_area(array[ inv_dept_area(i.dept) ])) );
create policy inv_txns_del on inv_txns for delete to authenticated
  using      ( exists (select 1 from inv_items i
                        where i.id = inv_txns.item_id
                          and has_any_area(array[ inv_dept_area(i.dept) ])) );

-- ── inv_suppliers(사입 거래처) : 행의 dept 로 판정 ─────────────────────────
do $$
begin
  if to_regclass('public.inv_suppliers') is null then return; end if;
  execute 'alter table inv_suppliers enable row level security';
  execute 'drop policy if exists invs_sel on inv_suppliers';
  execute 'drop policy if exists invs_ins on inv_suppliers';
  execute 'drop policy if exists invs_upd on inv_suppliers';
  execute 'drop policy if exists invs_del on inv_suppliers';
  execute 'create policy invs_sel on inv_suppliers for select to authenticated using (true)';
  execute 'create policy invs_ins on inv_suppliers for insert to authenticated
             with check ( has_any_area(array[ inv_dept_area(dept) ]) )';
  execute 'create policy invs_upd on inv_suppliers for update to authenticated
             using ( has_any_area(array[ inv_dept_area(dept) ]) )
             with check ( has_any_area(array[ inv_dept_area(dept) ]) )';
  execute 'create policy invs_del on inv_suppliers for delete to authenticated
             using ( has_any_area(array[ inv_dept_area(dept) ]) )';
end $$;

-- 확인용
--   select dept, inv_dept_area(dept) from (values ('fnb'),('room'),('hk'),('golf'),('front'),('shizu')) v(dept);
