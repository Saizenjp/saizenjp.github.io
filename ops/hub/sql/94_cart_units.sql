-- ============================================================================
--  94_cart_units.sql — 카트 개별 번호 관리(사용 불가 카트 제외)
-- ----------------------------------------------------------------------------
--  Min 2026-08: "카트를 뭉쳐서 몇번부터 몇번이 아니라, 사용 못하는 카트는 제외도
--  해야 되니까" → 번호 범위(cart_types.numbers) 대신 카트 1대 = 1행으로 관리한다.
--   · active=false  : 정비·고장 등으로 그날 배정에서 빼는 카트
--   · note          : 사유(수기)
--  배정은 active=true 인 카트만 sort_order 순으로 배분한다.
--  ⚠ 멱등. Supabase SQL Editor 에서 실행.
-- ============================================================================

create table if not exists public.cart_units (
  id          uuid        primary key default gen_random_uuid(),
  cart_code   text        not null references public.cart_types(code) on delete cascade,
  no          text        not null,                 -- 카트 번호(문자 허용: 12 · E7 · 3A)
  active      boolean     not null default true,    -- false = 사용 불가(정비·고장)
  note        text,                                 -- 사유
  sort_order  int         not null default 0,
  updated_at  timestamptz not null default now()
);
create unique index if not exists uq_cart_units      on public.cart_units(cart_code, no);
create index        if not exists idx_cart_units_code on public.cart_units(cart_code);

drop trigger if exists trg_cart_units_updated on public.cart_units;
create trigger trg_cart_units_updated before update on public.cart_units
  for each row execute function set_updated_at();

-- ── 최초 전개: 현재 보유 대수만큼 1..N 을 개별 행으로 ────────────────────────
--   전기 36 · 가솔린 2인승 27 · 가솔린 4인승 48 (Min 2026-08)
--   이미 있으면 건너뛴다. 번호 체계가 다르면 화면에서 고치면 된다.
insert into public.cart_units(cart_code, no, sort_order)
  select 'electric', i::text, i from generate_series(1,36) i
on conflict (cart_code, no) do nothing;
insert into public.cart_units(cart_code, no, sort_order)
  select 'gas2', i::text, i from generate_series(1,27) i
on conflict (cart_code, no) do nothing;
insert into public.cart_units(cart_code, no, sort_order)
  select 'gas4', i::text, i from generate_series(1,48) i
on conflict (cart_code, no) do nothing;

-- ── RLS — 읽기=로그인 전체 / 쓰기=golf 영역(+admin) ──────────────────────────
alter table public.cart_units enable row level security;

drop policy if exists cart_units_sel on public.cart_units;
create policy cart_units_sel on public.cart_units
  for select to authenticated using (true);
drop policy if exists cart_units_wr on public.cart_units;
create policy cart_units_wr on public.cart_units
  for all to authenticated using (has_any_area(array['golf'])) with check (has_any_area(array['golf']));
