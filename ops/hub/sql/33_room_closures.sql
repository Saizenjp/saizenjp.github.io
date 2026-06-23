-- ============================================================================
--  33_room_closures.sql — 객실 기간 폐쇄(잠금) 일정
-- ----------------------------------------------------------------------------
--  · room_inventory.active(영구 on/off)·note 와 별개로, "이 방을 6/10~6/14만 닫음"
--    같은 기간 폐쇄를 관리. 사유(대표님 사용 중 / 사용 안 함 / 점검 등) 포함.
--  · 날짜 의미: from_date(폐쇄 시작) ~ to_date(폐쇄 종료, 이 날 포함 = 마지막 닫는 날).
--    배정 충돌 판정 = (체류 dep <= to_date) AND (체류 arr > from_date).
--  · 자동배정·수기배정은 폐쇄와 겹치는 방을 그 기간엔 배정 불가로 처리(room.html).
--  · RLS = rooms 와 동일: 읽기 로그인 전체 / 쓰기 room 영역(+admin/manager).
--  멱등. 수동 실행. 번호 33.
-- ============================================================================

create table if not exists room_closures (
  id            uuid          primary key default gen_random_uuid(),
  inventory_id  uuid          not null references room_inventory(id) on delete cascade,
  from_date     date          not null,                 -- 폐쇄 시작일
  to_date       date          not null,                 -- 폐쇄 종료일(포함)
  reason        text,                                   -- 사유: "대표님 사용 중" "사용 안 함" "점검" 등
  created_by    text,                                   -- 등록 담당자
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);
create index if not exists idx_room_closures_inv on room_closures(inventory_id);
create index if not exists idx_room_closures_dates on room_closures(from_date, to_date);

drop trigger if exists trg_room_closures_updated on room_closures;
create trigger trg_room_closures_updated before update on room_closures
  for each row execute function set_updated_at();

-- ── RLS: 읽기=로그인 전체 / 쓰기=room 영역(+admin/manager) ───────────────────
do $$
declare pol record;
begin
  if to_regclass('public.room_closures') is null then return; end if;
  execute 'alter table public.room_closures enable row level security';
  for pol in select policyname from pg_policies where schemaname='public' and tablename='room_closures' loop
    execute format('drop policy if exists %I on public.room_closures', pol.policyname);
  end loop;
  execute 'create policy room_closures_sel on public.room_closures for select to authenticated using (true)';
  execute format('create policy room_closures_ins on public.room_closures for insert to authenticated with check (has_any_area(%L))', array['room']);
  execute format('create policy room_closures_upd on public.room_closures for update to authenticated using (has_any_area(%L)) with check (has_any_area(%L))', array['room'], array['room']);
  execute format('create policy room_closures_del on public.room_closures for delete to authenticated using (has_any_area(%L))', array['room']);
end $$;
