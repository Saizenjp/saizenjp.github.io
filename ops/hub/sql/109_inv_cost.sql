-- ============================================================================
--  109_inv_cost.sql — 재고에 '금액'을 붙인다 (사입 관리 1단계)
-- ----------------------------------------------------------------------------
--  문제: inv_items·inv_txns 는 **수량만** 관리한다. 그래서 「몇 개 있나」는 알지만
--        「얼마에 누구에게 사서 얼마를 지급했나」를 전혀 모른다.
--        구매성 비용은 연 2.64억엔 = 매출의 31%(docs/profitability-estimate.md)인데
--        그 흐름이 시스템에 안 남는다 → 5% 가 새도 아무도 모른다.
--  이번 단계(1단계)만: **거래처 + 단가 + 입고 금액**. 발주(PO)·검품·청구서 대조는 다음 단계.
--        (한 번에 다 만들면 현장이 안 쓴다 — docs/purchasing-practice.md §6)
--
--   · inv_suppliers : 거래처 마스터(부서별). 단가 비교·월 지출 집계의 기준.
--   · inv_items     : + supplier_id(주 거래처) · unit_cost(기준 단가)
--   · inv_txns      : + unit_cost(그때 단가) · amount(금액 = |delta| × unit_cost) · supplier_id
--                     ⚠ 금액은 **입고(+)** 에만 의미가 있다. 사용·실사조정은 비워 둔다.
--   · v_inv_spend   : 월·부서·거래처·품목별 입고 금액 집계(원가율·부서 지출 확인용)
--                     security_invoker=on — 뷰가 기반 테이블 RLS 를 우회하지 않게(39 교훈).
--  RLS = 36_inventory 와 동일: 읽기 로그인 전체 · 쓰기 kitchen 또는 room 영역.
--  멱등. ⚠ Supabase SQL Editor 수동 실행(또는 MCP apply_migration).
-- ============================================================================

-- ── 거래처 마스터 ──────────────────────────────────────────────────────────
create table if not exists inv_suppliers (
  id          uuid primary key default gen_random_uuid(),
  dept        text not null,                 -- fnb / room / golf (inv_items.dept 와 같은 값)
  name        text not null,
  contact     text,                          -- 담당자·전화·메일 등 자유 기재
  note        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  text
);
create index if not exists idx_inv_suppliers_dept on inv_suppliers(dept, name);

alter table inv_suppliers enable row level security;
drop policy if exists invs_sel on inv_suppliers;
create policy invs_sel on inv_suppliers for select to authenticated using (true);
drop policy if exists invs_ins on inv_suppliers;
create policy invs_ins on inv_suppliers for insert to authenticated
  with check (has_any_area(array['kitchen','room']));
drop policy if exists invs_upd on inv_suppliers;
create policy invs_upd on inv_suppliers for update to authenticated
  using (has_any_area(array['kitchen','room'])) with check (has_any_area(array['kitchen','room']));
drop policy if exists invs_del on inv_suppliers;
create policy invs_del on inv_suppliers for delete to authenticated
  using (has_any_area(array['kitchen','room']));

-- ── 품목: 주 거래처 · 기준 단가 ────────────────────────────────────────────
alter table inv_items add column if not exists supplier_id uuid references inv_suppliers(id) on delete set null;
alter table inv_items add column if not exists unit_cost   numeric;

-- ── 원장: 그때 단가 · 금액 · 거래처 ────────────────────────────────────────
--  단가가 오르면 이력이 남아야 협상·검증이 된다 → 품목 단가와 별도로 txn 에 박아 둔다.
alter table inv_txns add column if not exists unit_cost   numeric;
alter table inv_txns add column if not exists amount      numeric;
alter table inv_txns add column if not exists supplier_id uuid references inv_suppliers(id) on delete set null;
create index if not exists idx_inv_txns_supplier on inv_txns(supplier_id);
create index if not exists idx_inv_txns_created  on inv_txns(created_at);

-- ── 월 지출 집계 ───────────────────────────────────────────────────────────
--  입고(+delta) 이면서 금액이 있는 것만. JST 기준 월(서버 UTC → +9h).
drop view if exists v_inv_spend;
create view v_inv_spend
with (security_invoker = on) as
select
  to_char((t.created_at + interval '9 hours'), 'YYYY-MM') as ym,
  i.dept,
  i.category,
  i.id            as item_id,
  i.name_ko       as item_name,
  t.supplier_id,
  s.name          as supplier_name,
  sum(t.delta)                     as qty_in,
  sum(coalesce(t.amount,0))        as amount,
  count(*)                         as txn_cnt
from inv_txns t
join inv_items i on i.id = t.item_id
left join inv_suppliers s on s.id = t.supplier_id
where t.delta > 0
group by 1,2,3,4,5,6,7;

-- 확인:
--   select * from v_inv_spend where ym = to_char(now() + interval '9 hours','YYYY-MM') order by amount desc;
--   select ym, dept, sum(amount) from v_inv_spend group by 1,2 order by 1 desc, 3 desc;
