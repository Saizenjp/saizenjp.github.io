-- ============================================================================
--  96_ganji_room_no.sql — 간지호텔 실제 호수 반영 (15실 전부 트윈)
-- ----------------------------------------------------------------------------
--  Min 2026-08: 간지호텔 실제 호실 번호는 아래와 같다. 전부 트윈룸.
--     2층  201 202 203 205 206 207 208      (7실)
--     3층  301 302 303 305 306 307 308 310  (8실)
--  기존 데이터는 「간지 1호 … 간지 15호」 처럼 임시 표기로 들어가 있다.
--
--  · 호수 문자열에 의존하지 않는다 — 현재 정렬순(sort_order, room_no) 15실에
--    위 순서대로 새 호수를 부여한다.
--  · room_inventory.room_no 와 이미 배정된 rooms.room_no(비정규화 사본)를 함께 갱신.
--  · 정원·요금·id 는 그대로 → 기존 배정·정산에 영향 없음.
--  · 멱등: 두 번 실행해도 같은 결과(이미 새 호수면 그대로 유지).
--
--  실행: Supabase SQL Editor 에서 1회.
-- ============================================================================

-- 0) 먼저 확인 — 간지호텔 객실이 15실인지 본다.
--    select count(*) from room_inventory where facility='간지호텔';

with target as (
  select id,
         row_number() over (order by sort_order, room_no) as rn
    from public.room_inventory
   where facility = '간지호텔'
), m(rn, new_no) as (
  values (1,'201호'), (2,'202호'), (3,'203호'), (4,'205호'), (5,'206호'),
         (6,'207호'), (7,'208호'), (8,'301호'), (9,'302호'), (10,'303호'),
         (11,'305호'),(12,'306호'),(13,'307호'),(14,'308호'),(15,'310호')
)
update public.room_inventory r
   set room_no    = m.new_no,
       room_type  = '트윈',
       sort_order = 39 + m.rn
  from target t
  join m on m.rn = t.rn
 where r.id = t.id;

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
--   → 201·202·203·205·206·207·208·301·302·303·305·306·307·308·310 (15행, 전부 트윈)
