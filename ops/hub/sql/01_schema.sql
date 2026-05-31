-- ============================================================================
--  SaiZen 현장 운영 허브 — Supabase(PostgreSQL) 스키마  1단계 (v1)
-- ----------------------------------------------------------------------------
--  설계 원칙
--   · 2층 구조: [엠클릭 원본층] → [현장 운영층]
--   · 결합 키: event_seq (엠클릭 eventSeq). 예약리스트가 마스터.
--   · 팀(guests) / 개인(guest_members) 2층 분리.
--   · 거래(transactions)는 팀(룸차지) 귀속 기본 + 개인(member_id) 옵션. (리조트 PMS 표준)
--   · 정산표는 transactions 를 event_seq 기준 SUM 으로 합산만 함.
--   · 숙소 prefix 는 기존 v13.4 와 동일: 야마나미=Y · 쿠주힐즈=K · 간지호텔=G · 시즈노야도료칸=S
--
--  실행: Supabase SQL Editor 에 그대로 붙여넣기. 멱등 재실행 가능(IF NOT EXISTS / 부분 idempotent).
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ── 공통 updated_at 자동 갱신 트리거 함수 ───────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;


-- ============================================================================
--  [엠클릭 원본층] — 메리트투어가 보낸 데이터를 그대로 적재(읽기 위주)
-- ============================================================================

-- ── 1) bookings : 예약리스트 (마스터, 팀/예약 단위) ────────────────────────
create table if not exists bookings (
  event_seq      bigint        primary key,             -- 엠클릭 eventSeq (결합 키)
  event_no       text,                                  -- 행사번호 "260601-92295"
  status         text,                                  -- 구분: 견적/대기/확정/정산
  rep_name       text,                                  -- 대표고객
  member_type    text,                                  -- 회원권구분 (EWRC이용권, 다이아몬드 …)
  dep_date       date,                                  -- 출발일자
  arr_date       date,                                  -- 도착일자
  nights_label   text,                                  -- 기간 원문 "7박8일"
  origin         text,                                  -- 출발지 (인천/부산)
  airline        text,                                  -- 항공 (TW/ZE …)
  product_name   text,                                  -- 상품명
  pax            int           not null default 0,      -- 예약 컬럼 단독 (취소 반영 안 함 · v13.4 규칙)
  sales_amount   numeric(14,0) default 0,               -- 판매금액
  unpaid_amount  numeric(14,0) default 0,               -- 미수금액
  remark         text,                                  -- 비고 원문 ("1-1/팀(안명순, 전정숙)/…")
  team_label     text,                                  -- 비고에서 파싱한 팀명
  session_ym     text,                                  -- 월별 세션 "2026-06"
  synced_at      timestamptz   not null default now(),  -- 메리트투어 → 허브 적재 시각
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);
create index if not exists idx_bookings_session on bookings(session_ym);
create index if not exists idx_bookings_dep      on bookings(dep_date);

drop trigger if exists trg_bookings_updated on bookings;
create trigger trg_bookings_updated before update on bookings
  for each row execute function set_updated_at();


-- ── 2) passengers : 일행별예약 + 현지도착 보완 (개인 단위) ──────────────────
create table if not exists passengers (
  id             bigint        primary key,             -- 일행별예약 pkgPsgrSeq
  event_seq      bigint        not null references bookings(event_seq) on delete cascade,
  seq_in_team    int,                                   -- 일행별예약 No (팀 내 순번)
  name_kr        text,                                  -- 고객명
  name_en        text,                                  -- "영문성 영문이름" / 현지도착 영문명으로 보완
  gender         text,                                  -- 성별
  birth          date,                                  -- 생년월일 (태그 매칭 키)
  birth_yymmdd   text,                                  -- 생년월일 6자리 (member_key 조합용 캐시)
  passport_no    text,                                  -- 여권번호
  passport_exp   date,                                  -- 만료일
  phone          text,                                  -- 휴대번호
  dep_flight     text,                                  -- 한국출발편
  ret_flight     text,                                  -- 귀국편/출발편
  member_no      text,                                  -- 현지도착 회원번호 (보완)
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);
create index if not exists idx_passengers_event on passengers(event_seq);
create index if not exists idx_passengers_mkey  on passengers(name_kr, birth_yymmdd);

drop trigger if exists trg_passengers_updated on passengers;
create trigger trg_passengers_updated before update on passengers
  for each row execute function set_updated_at();


-- ── 3) member_codes : 그룹코드 참조테이블 ───────────────────────────────────
--  · 한 코드(DAウ)에 여러 회원이 묶일 수 있음 → (code, member_key) 복합 PK
--  · member_key = 이름 + 생년6자리 (예: "이정은620120")
create table if not exists member_codes (
  code           text          not null,                -- 그룹코드 "DAあ"
  member_key     text          not null,                -- "황보관현590611"
  member_class   text,                                  -- 다이아몬드/골드/EWRC/특별 …
  name_kr        text,                                  -- 성명
  is_learned     boolean       not null default false,  -- v13.4 학습 마스터 누적분 여부
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  primary key (code, member_key)
);
create index if not exists idx_member_codes_key on member_codes(member_key);

drop trigger if exists trg_member_codes_updated on member_codes;
create trigger trg_member_codes_updated before update on member_codes
  for each row execute function set_updated_at();


-- ============================================================================
--  [현장 운영층] — 야마나미 현장에서 읽고 쓰는 운영 원장
-- ============================================================================

-- ── 4) guests : 현장 운영 원장 (팀 단위) — 허브 전역 키 ─────────────────────
create table if not exists guests (
  event_seq      bigint        primary key references bookings(event_seq) on delete cascade,
  team_tag       text,                                  -- 개인번호 뗀 팀 태그 "DAあ-Y"
  group_code     text,                                  -- 그룹코드 prefix "DAあ" (FAあ 등 비회원 포함)
  accom          text,                                  -- 숙박지 원문 (야마나미리조트 …)
  accom_prefix   char(1),                               -- Y/K/G/S/X
  pax            int           not null default 0,
  check_status   text          not null default '체크인전', -- 체크인전/체크인/체크아웃
  session_ym     text,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);
create index if not exists idx_guests_session on guests(session_ym);
create index if not exists idx_guests_tag      on guests(team_tag);

drop trigger if exists trg_guests_updated on guests;
create trigger trg_guests_updated before update on guests
  for each row execute function set_updated_at();


-- ── 5) guest_members : 개인 단위 (v13.4 개인 태그코드 보관) ─────────────────
create table if not exists guest_members (
  id             uuid          primary key default gen_random_uuid(),
  event_seq      bigint        not null references guests(event_seq) on delete cascade,
  passenger_id   bigint        references passengers(id) on delete set null,
  person_tag     text,                                  -- 개인 전체 태그코드 "DAあ-1Y"
  seq_in_team    int,                                   -- 개인번호 (1,2,3 …)
  name_kr        text,
  name_en        text,
  is_rep         boolean       not null default false,  -- 대표자 여부
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  unique (event_seq, seq_in_team)
);
create index if not exists idx_gmembers_event on guest_members(event_seq);

drop trigger if exists trg_gmembers_updated on guest_members;
create trigger trg_gmembers_updated before update on guest_members
  for each row execute function set_updated_at();


-- ── 6) rooms : 숙박 배정 ────────────────────────────────────────────────────
create table if not exists rooms (
  id             uuid          primary key default gen_random_uuid(),
  event_seq      bigint        not null references guests(event_seq) on delete cascade,
  facility       text,                                  -- 야마나미골프텔/포틴힐즈/스가다이라 …
  room_type      text,                                  -- 호텔트윈/소형트윈/돔하우스/관내별장(소보·아소) …
  room_no        text,                                  -- 객실 번호
  check_in       date,
  check_out      date,
  assigned_pax   int           default 0,
  note           text,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);
create index if not exists idx_rooms_event on rooms(event_seq);

drop trigger if exists trg_rooms_updated on rooms;
create trigger trg_rooms_updated before update on rooms
  for each row execute function set_updated_at();


-- ── 7) rounds : 골프 라운딩 배정 ────────────────────────────────────────────
create table if not exists rounds (
  id             uuid          primary key default gen_random_uuid(),
  event_seq      bigint        not null references guests(event_seq) on delete cascade,
  round_date     date,
  course         text,                                  -- 야마나미 27홀 코스 등
  tee_time       time,
  pax            int           default 0,
  day_type       text,                                  -- 평일/주말/공휴일
  note           text,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);
create index if not exists idx_rounds_event on rounds(event_seq);
create index if not exists idx_rounds_date  on rounds(round_date);

drop trigger if exists trg_rounds_updated on rounds;
create trigger trg_rounds_updated before update on rounds
  for each row execute function set_updated_at();


-- ── 8) dining : 식사 배정 ───────────────────────────────────────────────────
create table if not exists dining (
  id             uuid          primary key default gen_random_uuid(),
  event_seq      bigint        not null references guests(event_seq) on delete cascade,
  meal_date      date,
  meal_type      text,                                  -- 석식 등
  restaurant     text,
  pax            int           default 0,
  note           text,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);
create index if not exists idx_dining_event on dining(event_seq);
create index if not exists idx_dining_date  on dining(meal_date);

drop trigger if exists trg_dining_updated on dining;
create trigger trg_dining_updated before update on dining
  for each row execute function set_updated_at();


-- ── 9) transactions : 현장 거래 로그 (정산표가 합산만 함) ───────────────────
--  · 팀(event_seq) 귀속 기본 / 개인(member_id) 옵션  ← 리조트 PMS 표준
--  · amount 를 직접 저장(정합성). qty·unit_price 는 참고용.
create table if not exists transactions (
  id             uuid          primary key default gen_random_uuid(),
  event_seq      bigint        not null references guests(event_seq) on delete cascade,  -- 룸차지 귀속(팀)
  member_id      uuid          references guest_members(id) on delete set null,          -- 개인 귀속(옵션)
  occurred_at    timestamptz   not null default now(),
  category       text          not null,                -- dining_add / proshop / room_charge / etc
  description    text,                                  -- 한 줄 내역
  qty            numeric(12,2) default 1,
  unit_price     numeric(14,0) default 0,
  amount         numeric(14,0) not null default 0,      -- 합산 대상 (정합성 위해 직접 저장)
  currency       char(3)       not null default 'JPY',
  posted_by      text,                                  -- 입력 모듈: front / restaurant / proshop
  voided         boolean       not null default false,  -- 취소 처리 (삭제 대신 무효화 → 감사 추적)
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);
create index if not exists idx_tx_event    on transactions(event_seq);
create index if not exists idx_tx_category on transactions(category);
create index if not exists idx_tx_occurred on transactions(occurred_at);

drop trigger if exists trg_tx_updated on transactions;
create trigger trg_tx_updated before update on transactions
  for each row execute function set_updated_at();


-- ============================================================================
--  정산 합산 뷰 — 프론트 정산표는 이 뷰를 읽기만 하면 됨
-- ============================================================================

-- ── 팀별 룸차지 합계 (취소분 제외) ──────────────────────────────────────────
create or replace view v_folio_summary as
select
  g.event_seq,
  g.team_tag,
  g.group_code,
  b.rep_name,
  g.accom,
  g.pax,
  coalesce(sum(t.amount) filter (where not t.voided), 0) as charge_total,
  count(t.id)          filter (where not t.voided)        as charge_count,
  g.session_ym
from guests g
join bookings b on b.event_seq = g.event_seq
left join transactions t on t.event_seq = g.event_seq
group by g.event_seq, g.team_tag, g.group_code, b.rep_name, g.accom, g.pax, g.session_ym;

-- ── 카테고리별 합계 (식사추가 / 골프샵 분해용) ──────────────────────────────
create or replace view v_folio_by_category as
select
  g.event_seq,
  g.team_tag,
  t.category,
  coalesce(sum(t.amount) filter (where not t.voided), 0) as amount
from guests g
left join transactions t on t.event_seq = g.event_seq
group by g.event_seq, g.team_tag, t.category;


-- ============================================================================
--  RLS (Row Level Security) — 1단계는 단일 운영팀 가정.
--  · anon + authenticated 모두 읽기/쓰기 허용으로 단순하게 시작.
--    (Supabase 신규 프로젝트는 publishable key 사용 → 역할이 anon 으로 잡힘)
--  · 2단계 모듈 분리 시 posted_by/role 기반 정책으로 세분화 예정.
-- ============================================================================
alter table bookings       enable row level security;
alter table passengers     enable row level security;
alter table member_codes   enable row level security;
alter table guests         enable row level security;
alter table guest_members  enable row level security;
alter table rooms          enable row level security;
alter table rounds         enable row level security;
alter table dining         enable row level security;
alter table transactions   enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'bookings','passengers','member_codes','guests','guest_members',
    'rooms','rounds','dining','transactions'
  ] loop
    execute format('drop policy if exists %I on %I', 'p_all_'||tbl, tbl);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      'p_all_'||tbl, tbl
    );
  end loop;
end $$;

-- ============================================================================
--  끝.
-- ============================================================================
