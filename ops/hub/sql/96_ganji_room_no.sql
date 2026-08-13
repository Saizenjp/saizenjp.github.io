-- ============================================================================
--  96_ganji_room_no.sql — 간지호텔 실제 호수 반영 (15실 전부 트윈)
-- ----------------------------------------------------------------------------
--  Min 2026-08: 간지호텔 실제 호실 번호는 아래와 같다. 전부 트윈룸.
--     2층  201 202 203 205 206 207 208      (7실)
--     3층  301 302 303 305 306 307 308 310  (8실)
--  기존 데이터는 「간지 1호 … 간지 15호」로 들어가 있어 현장 호수와 다르다.
--
--  · room_inventory.room_no 를 실제 호수로 바꾸고
--  · 이미 배정된 rooms.room_no(비정규화 사본)도 같은 값으로 맞춘다.
--  · 정원·요금·id 는 그대로 → 기존 배정·정산에 영향 없음.
--  · 멱등: 이미 새 호수면 아무 것도 하지 않는다.
--
--  실행: Supabase SQL Editor 에서 1회.
-- ============================================================================

with m(old_no, new_no, ord) as (
  values ('간지 1호','201호',1),  ('간지 2호','202호',2),  ('간지 3호','203호',3),
         ('간지 4호','205호',4),  ('간지 5호','206호',5),  ('간지 6호','207호',6),
         ('간지 7호','208호',7),  ('간지 8호','301호',8),  ('간지 9호','302호',9),
         ('간지 10호','303호',10),('간지 11호','305호',11),('간지 12호','306호',12),
         ('간지 13호','307호',13),('간지 14호','308호',14),('간지 15호','310호',15)
)
update public.room_inventory r
   set room_no   = m.new_no,
       room_type = '트윈',
       sort_order = 39 + m.ord
  from m
 where r.facility = '간지호텔'
   and r.room_no  = m.old_no;

-- 배정된 방의 호수 사본도 함께 갱신(인쇄·키라벨·프론트가 이 값을 쓴다)
update public.rooms x
   set room_no = i.room_no
  from public.room_inventory i
 where x.inventory_id = i.id
   and i.facility = '간지호텔'
   and x.room_no is distinct from i.room_no;

-- 확인용
--   select room_no, room_type, capacity, max_capacity, sort_order
--     from room_inventory where facility='간지호텔' order by sort_order;
