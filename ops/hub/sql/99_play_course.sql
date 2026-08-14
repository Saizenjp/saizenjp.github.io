-- ============================================================================
--  99_play_course.sql — 그날 그 팀이 실제로 도는 골프장(코스) 수기 지정
-- ----------------------------------------------------------------------------
--  Min 2026-08: 「골프장 야마나미CC·구주고원CC 수정 가능하게」
--
--  지금까지 코스는 규칙으로만 계산했다(SZCore.golfRows):
--    · 간지호텔 숙박 + 평일  → 九重高原CC
--    · 그 외 / 주말·공휴일   → やまなみCC
--  현장에는 예외가 있다(예: 오봉 연휴처럼 평일이지만 야마나미CC를 쓰는 경우).
--  그때 화면에서 코스를 직접 고르면 이 표에 남고, **규칙보다 우선**한다.
--
--  전기카트 사전신청 가능 여부(야마나미CC 이용일만)도 이 값을 따라간다.
--
--  실행: Supabase SQL Editor 에서 1회(멱등).
-- ============================================================================

create table if not exists public.play_course (
  play_date   date        not null,
  event_seq   bigint      not null references public.bookings(event_seq) on delete cascade,
  course      text        not null,                  -- 'やまなみCC' | '九重高原CC'
  changed_by  text,
  changed_at  timestamptz not null default now(),
  primary key (play_date, event_seq)
);

comment on table public.play_course is
  '그날 그 팀의 실제 골프장(코스) 수기 지정. 없으면 규칙(SZCore.golfRows)대로 계산한다.';

create index if not exists idx_play_course_date on public.play_course(play_date);

alter table public.play_course enable row level security;

-- 읽기: 로그인 전체(카트·조편성·수배서가 함께 본다)
drop policy if exists play_course_read on public.play_course;
create policy play_course_read on public.play_course
  for select to authenticated using (true);

-- 쓰기: 골프 영역(+admin/manager는 has_any_area 안에서 처리)
drop policy if exists play_course_write on public.play_course;
create policy play_course_write on public.play_course
  for all to authenticated
  using (has_any_area(array['golf']))
  with check (has_any_area(array['golf']));

-- 확인용
--   select * from play_course order by play_date desc, event_seq limit 50;
