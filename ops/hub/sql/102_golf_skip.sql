-- ============================================================================
--  102_golf_skip.sql — 그날 라운딩하지 않는 팀(제외)
-- ----------------------------------------------------------------------------
--  Min 2026-08: 「제외 토글 넣어줘」
--
--  라운딩 날짜는 상품명 규칙(SZCore.golfRows)으로 자동 계산한다:
--    입국일=ICN 팀 · 체류 중=전원 · 귀국일=PUS 팀.
--  하지만 실제로는 그날 안 나가는 팀이 있다(휴식·관광·자체 일정).
--  성수기에는 규칙대로면 조가 티오프 자리(코스당 17 × 3 = 51)를 넘어 버린다.
--
--  이 표에 들어간 (날짜, 팀) 은 코스 배정표에서 빠지고 자동 배정에서도 제외된다.
--  다시 넣으면 행을 지운다 = 토글.
--
--  실행: Supabase SQL Editor 또는 MCP apply_migration (멱등).
-- ============================================================================

create table if not exists public.golf_skips (
  play_date   date        not null,
  event_seq   bigint      not null references public.bookings(event_seq) on delete cascade,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  primary key (play_date, event_seq)
);

comment on table public.golf_skips is
  '그날 라운딩하지 않는 팀(코스 배정표 제외). 행이 있으면 제외, 지우면 복귀.';

create index if not exists idx_golf_skips_date on public.golf_skips(play_date);

alter table public.golf_skips enable row level security;

-- 읽기: 로그인 전체(조편성·카트·객실청소가 티오프를 함께 본다)
drop policy if exists golf_skips_read on public.golf_skips;
create policy golf_skips_read on public.golf_skips
  for select to authenticated using (true);

-- 쓰기: 골프 영역(admin 은 has_any_area 안에서 통과)
drop policy if exists golf_skips_write on public.golf_skips;
create policy golf_skips_write on public.golf_skips
  for all to authenticated
  using (has_any_area(array['golf']))
  with check (has_any_area(array['golf']));

-- 확인용
--   select * from golf_skips order by play_date desc, event_seq limit 50;
