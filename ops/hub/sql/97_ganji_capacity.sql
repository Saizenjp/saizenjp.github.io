-- ============================================================================
--  97_ganji_capacity.sql — 간지호텔 정원 2 (트리플 요청 시 1명까지 초과 배정 허용)
-- ----------------------------------------------------------------------------
--  Min 2026-08: "간지호텔은 1방에 2명 들어가는게 정원이고, 3명이 들어가는 경우는
--   트리플 요청하는 경우가 있어서 그런거야. 그 경우는 시즈노야도처럼 초과 표시를 보여주면 됨."
--
--  · capacity     = 2  → 화면의 「N/2」 와 초과 판정 기준(2명 넘으면 「초과」 빨강 표시)
--  · max_capacity = 3  → '최대 정원'이 아니라 **초과 배정 차단선**. 간지호텔의 정원은 2인이며,
--    트리플 요청처럼 어쩔 수 없이 1명을 더 넣는 경우까지만 허용하고 그 위는 DB가 막는다.
--   즉 3명은 "초과 배정(빨강 표시)" 상태, 4명은 차단.
--   (시즈노야도가 정확히 같은 방식: 정원 2 표기 · 최대 3 허용 · 3/2 는 붉게 「초과」)
--
--  멱등: 여러 번 실행해도 같은 값.
--  실행: Supabase SQL Editor 에서 1회. 96 이후.
-- ============================================================================

update public.room_inventory
   set capacity     = 2,
       max_capacity = 3
 where facility = '간지호텔'
   and (capacity is distinct from 2 or max_capacity is distinct from 3);

-- 확인용
--   select room_no, room_type, capacity, max_capacity from room_inventory
--    where facility='간지호텔' order by sort_order;      → 15행 · 트윈 · 2 / 3
--
--  ※ 이 변경으로 기존 3인 배정이 지워지지는 않는다(가드는 새 INSERT/UPDATE 때만 검사).
--    화면에서 「⚠ 초과」 칩으로 3인 방만 모아 확인할 수 있다.
--
--  ※ 4명이 들어가 있는 방이 아직 있다면(96 실행 때 걸렸던 그 방) 아래로 찾는다.
--      select i.room_no, r.check_in, r.check_out, count(*) pax
--        from rooms r join room_inventory i on i.id=r.inventory_id
--       where i.facility='간지호텔'
--       group by i.room_no, r.check_in, r.check_out
--      having count(*) > 3
--       order by i.room_no;
