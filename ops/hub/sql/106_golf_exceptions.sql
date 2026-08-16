-- ============================================================================
--  106_golf_exceptions.sql — 라운딩 예외(팀 홀수 변경 · 개인 불참)
-- ----------------------------------------------------------------------------
--  Min 2026-08: "본인 팀은 27홀 안 하고 18홀만/9홀만 하겠다, 오늘은 골프 안 치겠다,
--   그 팀의 누구는 라운딩 안 한다 — 담당자가 정리해 두고 인쇄물로 실무자와 공유"
--
--  기존:
--    · 홀수 = 상품명 규칙 자동(평일 체류 27H=18+9 · 주말/공휴 18H · 귀국 PUS 9H)
--    · 그날 라운딩 안 하는 팀 = golf_skips(102)  ← 그대로 사용
--  추가:
--    · golf_holes     = 그 날짜·그 팀의 홀수를 **수기 지정**(규칙 무시). 9/18/27.
--    · golf_absentees = 그 날짜에 **라운딩 안 하는 개인**(팀은 나가지만 한두 명 빠짐).
--  둘 다 (날짜, 대상) 1행 = 있으면 예외, 지우면 규칙대로.
--  RLS: 읽기=로그인 전체 · 쓰기=golf 영역(또는 admin).
--  멱등. ⚠ Supabase SQL Editor 수동 실행(또는 MCP). 105 이후.
-- ============================================================================

create table if not exists golf_holes (
  play_date   date    not null,
  event_seq   bigint  not null references bookings(event_seq) on delete cascade,
  holes       int     not null check (holes in (9,18,27)),
  note        text,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (play_date, event_seq)
);
create index if not exists idx_golf_holes_date on golf_holes(play_date);

create table if not exists golf_absentees (
  play_date   date    not null,
  member_id   uuid    not null references guest_members(id) on delete cascade,
  event_seq   bigint  not null references bookings(event_seq) on delete cascade,
  reason      text,
  created_by  text,
  created_at  timestamptz not null default now(),
  primary key (play_date, member_id)
);
create index if not exists idx_golf_absentees_date on golf_absentees(play_date);
create index if not exists idx_golf_absentees_seq  on golf_absentees(event_seq);

alter table golf_holes     enable row level security;
alter table golf_absentees enable row level security;

do $$
begin
  -- 읽기 = 로그인 전체(인쇄물·현장 확인)
  if not exists (select 1 from pg_policies where tablename='golf_holes' and policyname='golf_holes_read') then
    create policy golf_holes_read on golf_holes for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='golf_absentees' and policyname='golf_abs_read') then
    create policy golf_abs_read on golf_absentees for select to authenticated using (true);
  end if;
  -- 쓰기 = golf 영역(has_any_area 안에 admin 통과 포함)
  if not exists (select 1 from pg_policies where tablename='golf_holes' and policyname='golf_holes_write') then
    create policy golf_holes_write on golf_holes for all to authenticated
      using (has_any_area(array['golf'])) with check (has_any_area(array['golf']));
  end if;
  if not exists (select 1 from pg_policies where tablename='golf_absentees' and policyname='golf_abs_write') then
    create policy golf_abs_write on golf_absentees for all to authenticated
      using (has_any_area(array['golf'])) with check (has_any_area(array['golf']));
  end if;
end $$;
