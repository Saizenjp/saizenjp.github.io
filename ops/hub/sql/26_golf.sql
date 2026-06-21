-- ============================================================================
--  SaiZen Hub — 26 골프 라운딩 조편성 (코스·조·조원)
-- ----------------------------------------------------------------------------
--  도메인(Min 확정):
--   · 코스 3종: 아소(aso) · 소보(sobo) · 쿠주(kuju). 각 9홀(27홀 리조트).
--     인기도 아소>소보>쿠주 → 자동 분배 시 인기순으로 채움.
--   · 조(group) = 최대 4인 1조. 코스·티오프 시각·순번을 가짐(방배정과 같은 패턴).
--   · 같은 팀은 같은 코스로 묶음. 8명 팀은 2조를 link_group으로 연결.
--   · 자동 균형분배(assign_source='auto') 후 수기조정('manual'). 재자동은 auto만 정리.
--   · 9홀 추가요금은 별개 — 기존 charges(outlet='golf', 09/24) 정산으로 처리(여기 아님).
--  실행: Supabase SQL Editor. 01~09 이후. 멱등.
--  ⚠ RLS는 개발단계(authenticated 전체허용). 운영 전 area 'golf' 권한으로 강화 + admin.html
--     카드 area에 golf 추가 예정.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── 코스 마스터 ──
create table if not exists golf_courses (
  code        text        primary key,          -- 'aso' | 'sobo' | 'kuju'
  name_ja     text        not null,
  name_ko     text        not null,
  holes       int         not null default 9,
  popularity  int         not null default 99,  -- 1=가장 인기(아소)
  active      boolean     not null default true
);
insert into golf_courses(code,name_ja,name_ko,holes,popularity) values
  ('aso','阿蘇','아소',9,1),
  ('sobo','祖母','소보',9,2),
  ('kuju','久住','쿠주',9,3)
on conflict (code) do nothing;

-- ── 조(4-some) ──
create table if not exists golf_groups (
  id            uuid        primary key default gen_random_uuid(),
  play_date     date        not null,
  course_code   text        references golf_courses(code),
  tee_time      text,                              -- 'HH:MM'
  slot_no       int,                               -- 코스 내 티오프 순번
  event_seq     bigint      references bookings(event_seq) on delete set null,  -- 주 팀
  label         text,
  link_group    uuid,                              -- 8명 팀 등 연결(같은 link_group=한 팀 묶음)
  assign_source text        not null default 'manual',  -- 'auto' | 'manual'
  capacity      int         not null default 4,
  note          text,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_golf_groups_day    on golf_groups(play_date, course_code, slot_no);
create index if not exists idx_golf_groups_event  on golf_groups(event_seq);
create index if not exists idx_golf_groups_link   on golf_groups(link_group);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='golf_groups_source_chk') then
    alter table golf_groups add constraint golf_groups_source_chk check (assign_source in ('auto','manual'));
  end if;
end $$;

drop trigger if exists trg_golf_groups_updated on golf_groups;
create trigger trg_golf_groups_updated before update on golf_groups
  for each row execute function set_updated_at();

-- ── 조원 (1행=1명) ──
create table if not exists golf_group_members (
  id         uuid    primary key default gen_random_uuid(),
  group_id   uuid    not null references golf_groups(id) on delete cascade,
  member_id  uuid    references guest_members(id) on delete cascade,
  event_seq  bigint,
  seq        int
);
create index if not exists idx_golf_gm_group  on golf_group_members(group_id);
create index if not exists idx_golf_gm_member on golf_group_members(member_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname='golf_gm_uniq') then
    alter table golf_group_members add constraint golf_gm_uniq unique(group_id, member_id);
  end if;
end $$;

-- ── RLS (개발단계: 로그인 전체허용. 운영 전 area 'golf'로 강화) ──
alter table golf_courses       enable row level security;
alter table golf_groups        enable row level security;
alter table golf_group_members enable row level security;
do $$
declare tbl text;
begin
  foreach tbl in array array['golf_courses','golf_groups','golf_group_members'] loop
    execute format('drop policy if exists %I on %I', 'p_all_'||tbl, tbl);
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', 'p_all_'||tbl, tbl);
  end loop;
end $$;

-- ============================================================================
--  끝.
-- ============================================================================
