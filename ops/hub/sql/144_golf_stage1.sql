-- ============================================================================
-- 144_golf_stage1.sql — 코스 배정표 1단계(Min 2026-10-25): 샷건 날 · 스타트 홀 · 오후 재스타트 · 우산 대여
-- ----------------------------------------------------------------------------
--  ① golf_groups 컬럼 3개
--     start_hole  샷건 플레이 날의 조별 스타트 홀(1~9). 첫날은 랜덤 배정, 담당자가 고칠 수 있다.
--     pm_tee      昼食後 再スタート 시각 'HH:MM' — 규칙이 아니라 **담당자가 고른 조만** 값이 있다(Min).
--     pm_course   재스타트 코스(aso/sobo/kuju). 기본 제안=하루 순환의 세 번째 코스.
--  ② golf_day_settings — 날짜 단위 설정(샷건 ON·시작 시각·메모). 샷건 날은 미리 정해진다(Min).
--  ③ golf_lends — 조 단위 대여 물품(우선 우산). 대여/반납 누가·언제. 조가 지워지면 함께 지워진다.
--  RLS = 읽기 로그인 전체 · 쓰기 golf 영역(has_any_area, admin 통과). 일별 로테이션(어제 코스→다음 코스)은
--  화면 규칙이라 DB 변경 없음. 멱등. MCP 적용 2026-10-25.
-- ============================================================================
alter table public.golf_groups add column if not exists start_hole int;
alter table public.golf_groups add column if not exists pm_tee text;
alter table public.golf_groups add column if not exists pm_course text;

create table if not exists public.golf_day_settings (
  play_date    date primary key,
  shotgun      boolean not null default false,
  shotgun_time text,
  note         text,
  updated_by   text,
  updated_at   timestamptz not null default now()
);
alter table public.golf_day_settings enable row level security;
drop policy if exists golf_day_settings_sel on public.golf_day_settings;
create policy golf_day_settings_sel on public.golf_day_settings for select to authenticated using (true);
drop policy if exists golf_day_settings_ins on public.golf_day_settings;
create policy golf_day_settings_ins on public.golf_day_settings for insert to authenticated with check (has_any_area(array['golf']));
drop policy if exists golf_day_settings_upd on public.golf_day_settings;
create policy golf_day_settings_upd on public.golf_day_settings for update to authenticated using (has_any_area(array['golf'])) with check (has_any_area(array['golf']));
drop policy if exists golf_day_settings_del on public.golf_day_settings;
create policy golf_day_settings_del on public.golf_day_settings for delete to authenticated using (has_any_area(array['golf']));

create table if not exists public.golf_lends (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.golf_groups(id) on delete cascade,
  play_date   date not null,
  event_seq   bigint,
  item        text not null default 'umbrella',
  qty         int  not null default 1,
  lent_by     text,
  lent_at     timestamptz not null default now(),
  returned_by text,
  returned_at timestamptz
);
create index if not exists idx_golf_lends_day   on public.golf_lends(play_date);
create index if not exists idx_golf_lends_group on public.golf_lends(group_id);
alter table public.golf_lends enable row level security;
drop policy if exists golf_lends_sel on public.golf_lends;
create policy golf_lends_sel on public.golf_lends for select to authenticated using (true);
drop policy if exists golf_lends_ins on public.golf_lends;
create policy golf_lends_ins on public.golf_lends for insert to authenticated with check (has_any_area(array['golf']));
drop policy if exists golf_lends_upd on public.golf_lends;
create policy golf_lends_upd on public.golf_lends for update to authenticated using (has_any_area(array['golf'])) with check (has_any_area(array['golf']));
drop policy if exists golf_lends_del on public.golf_lends;
create policy golf_lends_del on public.golf_lends for delete to authenticated using (has_any_area(array['golf']));
