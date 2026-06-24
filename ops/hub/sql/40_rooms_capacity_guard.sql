-- ============================================================================
--  40_rooms_capacity_guard.sql — 객실 정원 초과(더블부킹) DB 차단
-- ----------------------------------------------------------------------------
--  문제: 정원 체크가 클라이언트(room.html)에만 있어, 두 직원이 같은 방·겹치는 기간을
--   거의 동시에 배정하면 둘 다 클라 검사를 통과한 뒤 각자 insert → DB가 수용해 정원 초과.
--   (월경계 등 클라가 못 본 점유도 마찬가지.)
--
--  해결: rooms INSERT/UPDATE 시 BEFORE 트리거로
--    · 같은 inventory_id 의 room_inventory 행을 FOR UPDATE 로 잠가 동시 삽입을 직렬화하고,
--    · [check_in, check_out) 와 겹치는 기존 배정의 assigned_pax 합 + NEW 가 정원을 넘으면 거부.
--   = 동시편집 경합까지 막는 권위 차단막(클라 검사는 UX용 1차 방어로 유지).
--
--  비고: 폐쇄(room_closures)는 업무 규칙이라 앱에서 처리(여기선 정원만). 날짜/정원 정보가
--   없으면(check_in·check_out·정원 null) 통과시켜 기존 데이터·예외를 막지 않는다.
--  멱등(create or replace + drop trigger if exists). ⚠ Supabase SQL Editor 수동 실행.
-- ============================================================================

create or replace function rooms_capacity_guard()
returns trigger
language plpgsql
as $$
declare
  cap  int;
  used int;
begin
  if NEW.inventory_id is null or NEW.check_in is null or NEW.check_out is null then
    return NEW;                                  -- 날짜 없는 행은 검사 불가 → 통과
  end if;

  -- 같은 객실에 대한 동시 삽입 직렬화(경합 차단). 정원 정보도 함께 확보.
  select coalesce(max_capacity, capacity) into cap
    from room_inventory where id = NEW.inventory_id for update;
  if cap is null then return NEW; end if;        -- 정원 미정 객실은 차단하지 않음

  select coalesce(sum(assigned_pax), 0) into used
    from rooms
   where inventory_id = NEW.inventory_id
     and check_in is not null and check_out is not null
     and check_in < NEW.check_out and check_out > NEW.check_in   -- 기간 겹침
     and (TG_OP <> 'UPDATE' or id <> NEW.id);                    -- 갱신 시 자기 행 제외

  if used + coalesce(NEW.assigned_pax, 0) > cap then
    raise exception '객실 정원 초과 — inventory_id=% 정원=% 겹침점유=% (+%) : 더블부킹 차단',
      NEW.inventory_id, cap, used, coalesce(NEW.assigned_pax,0)
      using errcode = 'check_violation';
  end if;

  return NEW;
end $$;

drop trigger if exists trg_rooms_capacity on rooms;
create trigger trg_rooms_capacity
  before insert or update on rooms
  for each row execute function rooms_capacity_guard();

-- 확인: select tgname from pg_trigger where tgrelid='public.rooms'::regclass and not tgisinternal;
