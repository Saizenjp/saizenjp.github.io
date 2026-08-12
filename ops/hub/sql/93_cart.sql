-- ============================================================================
--  93_cart.sql — 카트 관리표 (전기·가솔린·2인용)
-- ----------------------------------------------------------------------------
--  · cart_types      : 보유 카트 종류·대수 마스터(화면에서 수정)
--  · cart_bookings   : 날짜×팀 단위 카트 배정(대수·종류·신청구분)
--  요금: 1대 1일 ¥2,000 (기본값, 종류별로 바꿀 수 있게 컬럼으로)
--  신청구분: 'pre'=유료 사전신청 / 'onsite'=현장 신청
--  ⚠ 멱등. Supabase SQL Editor 또는 MCP apply_migration 으로 실행.
-- ============================================================================

-- ── 1) 보유 카트 종류 ───────────────────────────────────────────────────────
create table if not exists public.cart_types (
  code        text        primary key,              -- 'electric' | 'gasoline' | 'two_seater'
  name_ja     text        not null,
  name_ko     text        not null,
  total_count int         not null default 0,       -- 실제 보유 대수
  fee_yen     int         not null default 2000,    -- 1대 1일 사용료
  sort_order  int         not null default 99,
  active      boolean     not null default true,
  updated_at  timestamptz not null default now()
);

insert into public.cart_types(code,name_ja,name_ko,total_count,fee_yen,sort_order) values
  ('electric',  '電動カート',   '전기카트',  36, 2000, 1),
  ('gasoline',  'ガソリンカート','가솔린카트', 0, 2000, 2),
  ('two_seater','2人乗りカート','2인용카트',  0, 2000, 3)
on conflict (code) do nothing;

drop trigger if exists trg_cart_types_updated on public.cart_types;
create trigger trg_cart_types_updated before update on public.cart_types
  for each row execute function set_updated_at();

-- ── 2) 날짜×팀 카트 배정 ────────────────────────────────────────────────────
create table if not exists public.cart_bookings (
  id          uuid        primary key default gen_random_uuid(),
  play_date   date        not null,
  event_seq   bigint      not null references public.bookings(event_seq) on delete cascade,
  cart_code   text        not null references public.cart_types(code),
  qty         int         not null default 1 check (qty > 0),
  source      text        not null default 'pre' check (source in ('pre','onsite')),
  cart_nos    text,                                  -- 실제 배정한 카트 번호(수기, 예 "12,13")
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- 같은 날 같은 팀 같은 종류·신청구분은 한 행으로(대수만 조정)
create unique index if not exists uq_cart_bookings_day
  on public.cart_bookings(play_date, event_seq, cart_code, source);
create index if not exists idx_cart_bookings_date on public.cart_bookings(play_date);
create index if not exists idx_cart_bookings_seq  on public.cart_bookings(event_seq);

drop trigger if exists trg_cart_bookings_updated on public.cart_bookings;
create trigger trg_cart_bookings_updated before update on public.cart_bookings
  for each row execute function set_updated_at();

-- ── 3) RLS — 읽기=로그인 전체 / 쓰기=golf 영역(+admin) ──────────────────────
alter table public.cart_types    enable row level security;
alter table public.cart_bookings enable row level security;

drop policy if exists cart_types_sel on public.cart_types;
create policy cart_types_sel on public.cart_types
  for select to authenticated using (true);
drop policy if exists cart_types_wr on public.cart_types;
create policy cart_types_wr on public.cart_types
  for all to authenticated using (has_any_area(array['golf'])) with check (has_any_area(array['golf']));

drop policy if exists cart_bookings_sel on public.cart_bookings;
create policy cart_bookings_sel on public.cart_bookings
  for select to authenticated using (true);
drop policy if exists cart_bookings_wr on public.cart_bookings;
create policy cart_bookings_wr on public.cart_bookings
  for all to authenticated using (has_any_area(array['golf'])) with check (has_any_area(array['golf']));
