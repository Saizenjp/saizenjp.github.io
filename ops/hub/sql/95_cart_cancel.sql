-- ============================================================================
--  95_cart_cancel.sql — 전기카트 사전신청 「현장 취소」 수량
-- ----------------------------------------------------------------------------
--  Min 2026-08:
--   · 유료 사전 신청은 메리트투어에서 **확정된 상태**로 온다 → 「미확정」이라는 상태는 없다.
--   · 현장에서 빠지는 경우가 있다. 그때는 취소한 수량을 남긴다.
--     예) 사전신청 9 · 현장 취소 2  →  사전신청 7 · 취소 2
--   · 요금은 **남은 신청 수량(qty)** 기준. 취소분은 청구하지 않는다.
--
--  실행: Supabase SQL Editor 에서 1회(멱등). 93_cart.sql 이후.
-- ============================================================================

alter table public.cart_bookings
  add column if not exists cancelled int not null default 0;

comment on column public.cart_bookings.cancelled is
  '현장 취소 수량(누계). 사전신청 qty 에서 옮겨 담는다 — 요금은 qty 기준.';

-- 확인용
--   select play_date, event_seq, cart_code, qty, cancelled, note
--   from cart_bookings where cancelled > 0 order by play_date desc limit 50;
