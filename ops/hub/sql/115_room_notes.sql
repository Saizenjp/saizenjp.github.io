-- ============================================================================
--  115_room_notes.sql — 객실 쪽지(벌레·고장·특이사항)
-- ----------------------------------------------------------------------------
--  Min 2026-08: "객실에 벌레가 나온다든가 전달할 게 있으면 그 호실에 아주 짧게 남기고
--                청소자가 확인할 수 있게."
--
--  설계(합의):
--   · 붙는 대상 = **팀이 아니라 방**. 벌레·고장은 그 팀의 문제가 아니라 그 호실의 문제다.
--     (팀 메모는 event_notes(16) 가 따로 있고 성격이 다르다)
--   · 수명 = 날짜가 아니라 **열림/닫힘**. 오늘 날짜에만 뜨면 다음날 청소자가 못 본다.
--     처리하면 done=true 로 닫고, 닫힌 것도 남겨 **재발 추적**에 쓴다(같은 방 벌레 3회 = 방역 신호).
--   · 종류는 3개까지 — 많으면 아무도 고르지 않는다. bug(벌레) / fix(설비 고장) / etc(기타)
--  RLS = 읽기 로그인 전체 · 쓰기 hk·room·front 영역(청소·객실·프론트가 모두 남길 수 있어야 한다)
--  멱등. ⚠ Supabase SQL Editor 수동 실행(또는 MCP apply_migration).
-- ============================================================================

create table if not exists room_notes (
  id           uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references room_inventory(id) on delete cascade,
  kind         text not null default 'etc' check (kind in ('bug','fix','etc')),
  body         text not null,
  done         boolean not null default false,
  created_by   text,
  created_at   timestamptz not null default now(),
  done_by      text,
  done_at      timestamptz
);
create index if not exists idx_room_notes_inv  on room_notes(inventory_id);
create index if not exists idx_room_notes_open on room_notes(done, inventory_id);

alter table room_notes enable row level security;
drop policy if exists rn_sel on room_notes;
create policy rn_sel on room_notes for select to authenticated using (true);
drop policy if exists rn_ins on room_notes;
create policy rn_ins on room_notes for insert to authenticated
  with check (has_any_area(array['hk','room','front']));
drop policy if exists rn_upd on room_notes;
create policy rn_upd on room_notes for update to authenticated
  using (has_any_area(array['hk','room','front'])) with check (has_any_area(array['hk','room','front']));
drop policy if exists rn_del on room_notes;
create policy rn_del on room_notes for delete to authenticated
  using (has_any_area(array['hk','room','front']));

-- 확인:
--   select kind, done, count(*) from room_notes group by 1,2 order by 1,2;
--   -- 재발 추적: 같은 방에서 벌레가 몇 번 나왔나
--   select inventory_id, count(*) from room_notes where kind='bug' group by 1 having count(*)>=2;
