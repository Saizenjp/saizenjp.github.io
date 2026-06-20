-- ════════════════════════════════════════════════════════════════════════
-- 16_event_notes.sql — 팀 운영 주석 (event_notes) + 수정이력 (event_note_log)
--   /app/ 의 수기입력(팀 라벨·야마나미 코스·비고·메모)을 ops 공유 레이어로.
--   · event_seq(팀) 1행 = 주석 1세트. bookings 삭제 시 cascade.
--   · 모든 변경은 event_note_log 에 누가·언제·이전→이후 기록.
--   · 멱등(create if not exists). RLS anon 허용(개발용 — 운영 전 강화).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists event_notes (
  event_seq    bigint        primary key references bookings(event_seq) on delete cascade,
  session_ym   text,                                   -- 월 세션 "2026-06" (필터용)
  team_label   text,                                   -- 운영 팀 라벨/팀명
  yama_course  text,                                   -- 야마나미 코스
  remarks      text,                                   -- 운영 비고
  memo         text,                                   -- 자유 메모
  updated_by   text,                                   -- 마지막 수정 담당자
  updated_at   timestamptz   not null default now(),
  created_at   timestamptz   not null default now()
);
create index if not exists idx_event_notes_session on event_notes(session_ym);

drop trigger if exists trg_event_notes_updated on event_notes;
create trigger trg_event_notes_updated before update on event_notes
  for each row execute function set_updated_at();

create table if not exists event_note_log (
  id          bigserial     primary key,
  event_seq   bigint,                                  -- 대상 팀 (FK 없음 — 이력 보존)
  field       text          not null,                  -- team_label / yama_course / remarks / memo
  old_value   text,
  new_value   text,
  changed_by  text,
  changed_at  timestamptz   not null default now()
);
create index if not exists idx_event_note_log_seq on event_note_log(event_seq, changed_at desc);

-- ── RLS anon 허용 (04_rls_anon.sql 패턴과 동일, 개발용) ──
alter table event_notes    enable row level security;
alter table event_note_log enable row level security;
do $$
declare tbl text;
begin
  foreach tbl in array array['event_notes','event_note_log'] loop
    execute format('drop policy if exists %I on %I', 'p_all_'||tbl, tbl);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      'p_all_'||tbl, tbl);
  end loop;
end $$;
