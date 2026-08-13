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
--  ⚠ rooms 는 정원 가드 트리거(40·67)가 INSERT/UPDATE 마다 검사한다. 이미 정원을 넘겨
--    들어가 있는 방이 있으면 호수만 바꾸는 이 UPDATE 도 함께 막힌다(실측: 정원3·점유4).
--    호수 갱신은 정원과 무관하므로 67이 만든 **트랜잭션 한정 우회 플래그**로 그 순간만 통과시킨다.
do $$
begin
  perform set_config('app.skip_room_guard', '1', true);   -- 이 txn 한정
  update public.rooms x
     set room_no = i.room_no
    from public.room_inventory i
   where x.inventory_id = i.id
     and i.facility = '간지호텔'
     and x.room_no is distinct from i.room_no;
  perform set_config('app.skip_room_guard', '', true);
end $$;

-- 확인용
--   select room_no, room_type, capacity, max_capacity, sort_order
--     from room_inventory where facility='간지호텔' order by sort_order;
--   → 201·202·203·205·206·207·208·301·302·303·305·306·307·308·310 (15행, 전부 트윈)
--
--  ⚠ 위 우회로도 막히면 설치된 가드가 40번 버전(플래그 미지원)이다. 그때는 67을 다시 실행하거나
--    아래처럼 잠시 끄고 돌린 뒤 반드시 다시 켠다.
--      alter table public.rooms disable trigger trg_rooms_capacity;
--      -- (위 update 실행)
--      alter table public.rooms enable  trigger trg_rooms_capacity;
--
--  ※ 별건: 정원 초과 방이 실제로 있다는 뜻이므로 따로 확인할 것(데이터 검수 페이지에도 잡힌다).
--      select r.inventory_id, i.facility, i.room_no, coalesce(i.max_capacity,i.capacity) cap,
--             r.check_in, r.check_out, sum(r.assigned_pax) over (partition by r.inventory_id) 
--        from rooms r join room_inventory i on i.id=r.inventory_id
--       where i.facility='간지호텔' order by i.room_no, r.check_in;
