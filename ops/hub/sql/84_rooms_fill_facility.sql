-- 84_rooms_fill_facility.sql — rooms.facility·room_no를 inventory_id에서 자동 채움(정합성 가드)
--   · 왜: rooms.facility가 null이면 시즈 예약표 로드 쿼리(.eq('facility',...))에서 제외돼
--     "방배정이 사라진 것처럼" 보이는 버그가 났음(수기/복원 insert가 facility를 빠뜨림).
--   · 이제 어떤 insert/update든 inventory_id만 있으면 facility·room_no를 room_inventory에서
--     강제로 채워 항상 일치. 사람이 빠뜨릴 수 없음.
--   · 정원가드(rooms_capacity_guard)보다 먼저 실행되도록 이름을 'rooms_aa_'로(BEFORE 트리거는 이름순).
-- 멱등.
create or replace function public.rooms_fill_facility()
returns trigger language plpgsql as $$
begin
  if new.inventory_id is not null then
    select facility, room_no into new.facility, new.room_no
    from room_inventory where id = new.inventory_id;
  end if;
  return new;
end $$;

drop trigger if exists rooms_aa_fill_facility on public.rooms;
create trigger rooms_aa_fill_facility
  before insert or update of inventory_id on public.rooms
  for each row execute function public.rooms_fill_facility();

-- 기존 데이터 정합화(누락·불일치 교정)
update rooms r set facility = ri.facility, room_no = ri.room_no
from room_inventory ri
where r.inventory_id = ri.id
  and (r.facility is distinct from ri.facility or r.room_no is distinct from ri.room_no);
