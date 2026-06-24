-- ============================================================================
--  36_inventory.sql — 현장 재고·내부 수량 관리 (범용 모델: 품목 + 입출고 원장)
-- ----------------------------------------------------------------------------
--  · "현장의 모든 수량을 시스템화" 1단계. 부서(dept)로 F&B·객실을 한 모델에 담는다.
--      dept='fnb'  → 식자재·음료·주류·주방소모품
--      dept='room' → 객실비품·린넨·어메니티·청소용품·미니바
--  · 수량은 inv_items.current_qty(현재고)에 보관하고, 모든 변동은 inv_txns(원장)에 기록.
--    입고(+) / 사용·폐기(-) / 실사조정(절대치 보정). par_level(적정재고) 미만이면 부족 알림.
--  · RLS = 읽기 로그인 전체 / 쓰기 kitchen·room 영역(+admin). dept별 세분 게이트는 후속.
--  · POS·주방 소모 자동 차감 연동은 다음 단계(여기선 수동 입출고).
--  멱등. 수동 실행. 번호 36. (set_updated_at·has_any_area 는 기존 마이그레이션에서 생성됨)
-- ============================================================================

create table if not exists inv_items (
  id          uuid          primary key default gen_random_uuid(),
  dept        text          not null default 'fnb',          -- 'fnb' | 'room'
  category    text,                                          -- 식자재/음료/객실비품/린넨 …
  name_ko     text          not null,
  name_ja     text,
  unit        text          default '개',                    -- 단위: 개/병/박스/kg/롤 …
  location    text,                                          -- 보관 위치
  par_level   numeric(14,2) not null default 0,              -- 적정(최소)재고 → 부족 기준
  current_qty numeric(14,2) not null default 0,              -- 현재 수량
  note        text,
  active      boolean       not null default true,
  sort_order  int           default 0,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);
create index if not exists idx_inv_items_dept on inv_items(dept, active);

create table if not exists inv_txns (
  id         uuid          primary key default gen_random_uuid(),
  item_id    uuid          not null references inv_items(id) on delete cascade,
  delta      numeric(14,2) not null,                         -- +입고 / -사용·폐기
  reason     text          not null default '사용',          -- 입고/사용/폐기/실사조정/이동
  note       text,
  qty_after  numeric(14,2),                                  -- 처리 후 현재고 스냅샷
  created_by text,
  created_at timestamptz   not null default now()
);
create index if not exists idx_inv_txns_item on inv_txns(item_id, created_at desc);

drop trigger if exists trg_inv_items_updated on inv_items;
create trigger trg_inv_items_updated before update on inv_items
  for each row execute function set_updated_at();

-- ── RLS: 읽기=로그인 전체 / 쓰기=kitchen·room 영역(+admin) ────────────────────
do $$
declare pol record; tbl text;
begin
  foreach tbl in array array['inv_items','inv_txns'] loop
    if to_regclass('public.'||tbl) is null then continue; end if;
    execute format('alter table public.%I enable row level security', tbl);
    for pol in select policyname from pg_policies where schemaname='public' and tablename=tbl loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (true)', tbl||'_sel', tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (has_any_area(%L))', tbl||'_ins', tbl, array['kitchen','room']);
    execute format('create policy %I on public.%I for update to authenticated using (has_any_area(%L)) with check (has_any_area(%L))', tbl||'_upd', tbl, array['kitchen','room'], array['kitchen','room']);
    execute format('create policy %I on public.%I for delete to authenticated using (has_any_area(%L))', tbl||'_del', tbl, array['kitchen','room']);
  end loop;
end $$;

-- 확인:  select dept, count(*) from inv_items group by dept;
-- ============================================================================
--  끝.
-- ============================================================================
