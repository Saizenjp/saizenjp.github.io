-- ============================================================================
--  SaiZen Hub — 정산·POS·주방·메뉴 통합 실행 SQL (09+11+12+13 한 번에)
-- ----------------------------------------------------------------------------
--  이 파일 하나만 SQL Editor에 붙여넣고 Run 하면 정산·POS·KDS·메뉴가 전부 준비됩니다.
--  모두 멱등(여러 번 실행해도 안전). 기존 01~08(예약·방배정) + 10_member_grade 이후.
--  ※ 10_member_grade.sql(방배정 회원등급)은 방배정 쪽 마이그레이션이라 여기 미포함.
--  구버전 테이블이 있어도 누락 컬럼을 자동 보강합니다. 실행 후 00_VERIFY.sql 로 확인.
--  ⚠ 세금: 内税(税込, 단가=최종가). 청구 합계 = 메뉴가 그대로(소비세 빼서 표시만).
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  ▼▼▼  09_settlement_core.sql
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ============================================================================
--  SaiZen Hub — 09 현장 정산 코어 (folios · charges · payments)
-- ----------------------------------------------------------------------------
--  설계: docs 정산 명세(04) Phase 1.
--   · 손님 "추가요금"(연회·레스토랑·추가 라운딩·골프샵·룸 업그레이드 등)을
--     한 체류(행사)의 정산 계정(folio)으로 모아 결제·합산한다.
--   · ⚠ B2B 정산(⑤ 現地精算表, 메리트투어↔사이젠 선계약)과 완전히 별개 레이어.
--     이 테이블에 B2B 금액(bookings.sales_amount 등)을 섞지 않는다.
--
--  핵심 원칙
--   · folio(정산 계정) 중심: 체류(행사)마다 folio 1개(팀 단위 기본 · 개인 단위도 허용).
--   · charges(통합 청구 원장)가 연동 지점: 모든 서브시스템이 charges에 한 줄씩 적재.
--   · 잔액 = Σ(charges.amount+tax+service_charge) − Σ payments. (뷰에서 계산, 중복저장 안 함)
--   · 통화 = 엔(JPY) 정수.
--
--  Min 확정값 (2026-06 결정 — 명세서·계산식에 반영)
--   · 결제수단: 현금 / 카드
--   · 세금: 소비세 10% 内税(税込·단가=최종가). amount=税抜 소계, tax=内税(gross−round(gross/1.1)) · 봉사료 없음
--   · folio 단위: 팀(행사) 기본 + 개인 허용
--   · 카테고리(고정 5종): 라운딩 · 식음 · 숙박 · 골프샵 · 기타
--
--  ⚠ 보안(중요): 이건 돈 데이터다. 아래 anon 전체허용 정책은 "개발 단계용 임시"이며
--     운영 투입 전 반드시 담당자 인증·역할 분리로 강화한다(04 명세 §6).
--
--  실행: Supabase SQL Editor 에 그대로 붙여넣기. 01~08 이후 실행. 멱등 재실행 가능.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- set_updated_at() 는 01_schema.sql 에서 정의됨. 없을 때만 대비해 보강(멱등).
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;


-- ── 1) folios : 정산 계정 (체류=행사 단위 기본 · 개인 단위 옵션) ─────────────
create table if not exists folios (
  id          uuid          primary key default gen_random_uuid(),
  event_seq   bigint        not null references bookings(event_seq) on delete cascade,
  subject     text          not null default 'team',   -- 'team' | 'member'
  member_id   uuid          references guest_members(id) on delete set null, -- 개인 정산 시
  status      text          not null default 'open',    -- 'open' | 'closed' | 'settled'
  session_ym  text,                                      -- "2026-06"
  opened_at   timestamptz   not null default now(),
  closed_at   timestamptz,
  note        text,
  created_by  text,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);
create index if not exists idx_folios_event   on folios(event_seq);
create index if not exists idx_folios_session on folios(session_ym);
create index if not exists idx_folios_status  on folios(status);

-- 구버전 folios 테이블 누락 컬럼 보강(멱등)
alter table folios add column if not exists subject    text          not null default 'team';
alter table folios add column if not exists member_id  uuid;
alter table folios add column if not exists status     text          not null default 'open';
alter table folios add column if not exists session_ym text;
alter table folios add column if not exists opened_at  timestamptz   not null default now();
alter table folios add column if not exists closed_at  timestamptz;
alter table folios add column if not exists note       text;
alter table folios add column if not exists created_by text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='folios_subject_chk') then
    alter table folios add constraint folios_subject_chk check (subject in ('team','member'));
  end if;
  if not exists (select 1 from pg_constraint where conname='folios_status_chk') then
    alter table folios add constraint folios_status_chk check (status in ('open','closed','settled'));
  end if;
end $$;

drop trigger if exists trg_folios_updated on folios;
create trigger trg_folios_updated before update on folios
  for each row execute function set_updated_at();


-- ── 2) charges : 통합 청구 원장 (모든 서브시스템의 연동 지점) ────────────────
--  · amount = 税抜 소계(= 청구 gross − 内税) 를 직접 저장(정합성).
--  · tax = 内税(포함된 소비세). service_charge = 0(봉사료 미부과 정책). 둘 다 직접 저장.
--  · voided = 취소 처리(삭제 대신 무효화 → 금전 감사 추적).
create table if not exists charges (
  id             uuid          primary key default gen_random_uuid(),
  folio_id       uuid          not null references folios(id) on delete cascade,
  event_seq      bigint        references bookings(event_seq) on delete set null,
  category       text          not null,                -- 라운딩/식음/숙박/골프샵/기타
  source         text,                                  -- banquet/restaurant/golf/proshop/room/frontdesk
  description    text,
  qty            numeric(12,2) not null default 1,
  unit_price     numeric(14,0) not null default 0,      -- 단가(JPY) — POS는 税込(최종가)
  amount         numeric(14,0) not null default 0,      -- 税抜 소계(합산 대상)
  tax            numeric(14,0) not null default 0,      -- 소비세 内税(포함 10%)
  service_charge numeric(14,0) not null default 0,      -- 봉사료(현 정책 0)
  member_id      uuid          references guest_members(id) on delete set null,
  source_ref     text,                                  -- 서브시스템 행 id(레스토랑/연회 등)
  charged_at     timestamptz   not null default now(),
  created_by     text,
  note           text,
  voided         boolean       not null default false,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);
create index if not exists idx_charges_folio    on charges(folio_id);
create index if not exists idx_charges_event    on charges(event_seq);
create index if not exists idx_charges_category on charges(category);
create index if not exists idx_charges_charged  on charges(charged_at);

-- 구버전 charges 테이블이 이미 있을 경우 누락 컬럼 보강(멱등). 아래 뷰가 참조하는 컬럼 보장.
alter table charges add column if not exists event_seq      bigint;
alter table charges add column if not exists source         text;
alter table charges add column if not exists description    text;
alter table charges add column if not exists qty            numeric(12,2) not null default 1;
alter table charges add column if not exists unit_price     numeric(14,0) not null default 0;
alter table charges add column if not exists amount         numeric(14,0) not null default 0;
alter table charges add column if not exists tax            numeric(14,0) not null default 0;
alter table charges add column if not exists service_charge numeric(14,0) not null default 0;
alter table charges add column if not exists member_id      uuid;
alter table charges add column if not exists source_ref     text;
alter table charges add column if not exists charged_at     timestamptz   not null default now();
alter table charges add column if not exists created_by     text;
alter table charges add column if not exists note           text;
alter table charges add column if not exists voided         boolean       not null default false;
alter table charges add column if not exists created_at     timestamptz   not null default now();
alter table charges add column if not exists updated_at     timestamptz   not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname='charges_category_chk') then
    alter table charges add constraint charges_category_chk
      check (category in ('라운딩','식음','숙박','골프샵','기타'));
  end if;
end $$;

drop trigger if exists trg_charges_updated on charges;
create trigger trg_charges_updated before update on charges
  for each row execute function set_updated_at();


-- ── 3) payments : 결제 ──────────────────────────────────────────────────────
create table if not exists payments (
  id          uuid          primary key default gen_random_uuid(),
  folio_id    uuid          not null references folios(id) on delete cascade,
  method      text          not null,                   -- 현금 | 카드
  amount      numeric(14,0) not null default 0,
  paid_at     timestamptz   not null default now(),
  received_by text,
  note        text,
  voided      boolean       not null default false,
  created_at  timestamptz   not null default now()
);
create index if not exists idx_payments_folio on payments(folio_id);

-- 구버전 payments 테이블 누락 컬럼 보강(멱등)
alter table payments add column if not exists amount      numeric(14,0) not null default 0;
alter table payments add column if not exists paid_at     timestamptz   not null default now();
alter table payments add column if not exists received_by text;
alter table payments add column if not exists note        text;
alter table payments add column if not exists voided      boolean       not null default false;
alter table payments add column if not exists created_at  timestamptz   not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname='payments_method_chk') then
    alter table payments add constraint payments_method_chk check (method in ('현금','카드'));
  end if;
end $$;


-- ============================================================================
--  뷰 — 프론트는 이 뷰들을 읽기만 하면 잔액·요약을 얻는다.
-- ============================================================================

-- ── folio별 잔액(청구합계 − 결제합계, 취소분 제외) ──────────────────────────
drop view if exists v_folio_balance;
create view v_folio_balance as
select
  f.id            as folio_id,
  f.event_seq,
  f.subject,
  f.member_id,
  f.status,
  f.session_ym,
  b.rep_name,
  g.team_tag,
  g.group_code,
  gm.name_kr      as member_name,
  coalesce(c.charge_sum, 0)                                            as charge_amount,  -- 세전 소계
  coalesce(c.tax_sum, 0)                                               as tax_amount,
  coalesce(c.svc_sum, 0)                                               as service_amount,
  coalesce(c.charge_sum,0)+coalesce(c.tax_sum,0)+coalesce(c.svc_sum,0) as gross_total,    -- 청구 합계(세포함)
  coalesce(p.paid_sum, 0)                                              as paid_total,
  (coalesce(c.charge_sum,0)+coalesce(c.tax_sum,0)+coalesce(c.svc_sum,0))
    - coalesce(p.paid_sum, 0)                                          as balance,
  coalesce(c.line_count, 0)                                            as charge_count,
  f.opened_at,
  f.closed_at
from folios f
left join bookings b      on b.event_seq = f.event_seq
left join guests g        on g.event_seq = f.event_seq
left join guest_members gm on gm.id = f.member_id
left join (
  select folio_id,
         sum(amount)         as charge_sum,
         sum(tax)            as tax_sum,
         sum(service_charge) as svc_sum,
         count(*)            as line_count
  from charges where not voided group by folio_id
) c on c.folio_id = f.id
left join (
  select folio_id, sum(amount) as paid_sum
  from payments where not voided group by folio_id
) p on p.folio_id = f.id;

-- ── 카테고리·기간별 매출 요약(내부용) ──────────────────────────────────────
drop view if exists v_settlement_by_category;
create view v_settlement_by_category as
select
  f.session_ym,
  c.category,
  count(*)                                       as line_count,
  coalesce(sum(c.amount), 0)                     as charge_amount,
  coalesce(sum(c.tax), 0)                        as tax_amount,
  coalesce(sum(c.amount + c.tax + c.service_charge), 0) as gross_total
from charges c
join folios f on f.id = c.folio_id
where not c.voided
group by f.session_ym, c.category;


-- ============================================================================
--  RLS — ⚠ 개발 단계용 임시(anon 전체허용). 운영 전 반드시 강화(04 §6).
-- ============================================================================
alter table folios   enable row level security;
alter table charges  enable row level security;
alter table payments enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array['folios','charges','payments'] loop
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

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  ▼▼▼  11_pos_menu.sql
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ============================================================================
--  SaiZen Hub — 11 간이 POS 메뉴 마스터 (menu_items)
-- ----------------------------------------------------------------------------
--  설계: docs 정산 명세(04) Phase 2.
--   · 레스토랑·연회장·골프샵에서 직원이 태블릿(ops/hub/pos.html)으로 메뉴를
--     찍어 해당 팀 folio 의 charges 에 바로 적재한다.
--   · 외부 POS 연동 없음(현장 POS 미보유) — Hub 자체 간이 POS.
--   · v1 단순화: 카트→전송 시 charges 에 직접 적재(restaurant_orders 중간 테이블 생략).
--     주방 티켓·다단말 동시편집 같은 본격 기능이 필요해지면 그때 12_ 로 도입.
--
--  menu_items 는 단가 마스터일 뿐, 실제 청구 합산은 charges(09) 에서 한다.
--  category 는 09 의 charges 와 동일한 고정 5종. venue 는 charges.source 로 들어간다.
--
--  실행: Supabase SQL Editor. 01~09 이후 실행. 멱등(아래 시드는 테이블이 빌 때만).
-- ============================================================================

create table if not exists menu_items (
  id          bigserial     primary key,
  code        text,                                 -- 번호/기호(표시·검색용, 선택)
  name_ja     text          not null,               -- 御請求書·명세서에 쓰는 일본어명
  name_ko     text,                                 -- 직원 보조 표기(한국어)
  category    text          not null,               -- 라운딩/식음/숙박/골프샵/기타 (charges 와 동일)
  venue       text,                                 -- restaurant/banquet/proshop/etc → charges.source
  unit_price  numeric(14,0) not null default 0,     -- 단가(JPY, 税込·최종가). 소비세는 内税(청구 시 빼냄).
  sort_order  int           not null default 0,
  active      boolean       not null default true,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);
create index if not exists idx_menu_items_venue on menu_items(venue, sort_order);
create index if not exists idx_menu_items_active on menu_items(active);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='menu_items_category_chk') then
    alter table menu_items add constraint menu_items_category_chk
      check (category in ('라운딩','식음','숙박','골프샵','기타'));
  end if;
end $$;

drop trigger if exists trg_menu_items_updated on menu_items;
create trigger trg_menu_items_updated before update on menu_items
  for each row execute function set_updated_at();

-- ── RLS — ⚠ 09 와 동일: 개발 단계용 임시(anon 전체허용). 운영 전 강화. ──
alter table menu_items enable row level security;
drop policy if exists p_all_menu_items on menu_items;
create policy p_all_menu_items on menu_items
  for all to anon, authenticated using (true) with check (true);

-- ── 예시 시드 (테이블이 비었을 때만) — ⚠ 단가·메뉴는 Min 님이 실제값으로 교체 ──
do $$
begin
  if not exists (select 1 from menu_items) then
    insert into menu_items(code,name_ja,name_ko,category,venue,unit_price,sort_order) values
      ('B1','生ビール',      '생맥주',     '식음','restaurant', 800, 10),
      ('B2','瓶ビール',      '병맥주',     '식음','restaurant', 700, 11),
      ('B3','ハイボール',    '하이볼',     '식음','restaurant', 600, 12),
      ('D1','ソフトドリンク','음료(소프트)','식음','restaurant', 400, 20),
      ('F1','焼酎(ボトル)',  '소주(보틀)', '식음','restaurant',3000, 30),
      ('M1','定食',          '정식',       '식음','restaurant',1800, 40),
      ('M2','刺身盛り合わせ','회 모둠',    '식음','restaurant',2500, 41),
      ('E1','宴会コースA',   '연회 코스A', '식음','banquet',   5000, 50),
      ('E2','宴会コースB',   '연회 코스B', '식음','banquet',   7000, 51),
      ('P1','グローブ',      '장갑',       '골프샵','proshop', 3000, 60),
      ('P2','ボール(1ダース)','볼(1다스)', '골프샵','proshop', 4000, 61),
      ('P3','キャップ',      '모자',       '골프샵','proshop', 2500, 62),
      ('X1','その他(手入力)','기타(수동)', '기타','etc',          0, 90);
  end if;
end $$;

-- ============================================================================
--  끝.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  ▼▼▼  12_kitchen_tickets.sql
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ============================================================================
--  SaiZen Hub — 12 주방 화면(KDS) 티켓 + 메뉴 station 라우팅
-- ----------------------------------------------------------------------------
--  설계: docs 정산 명세(04) Phase 3.
--   · 드링크바(레스토랑 프론트) 태블릿에서 주문 전송 → 주방행 항목만 주방 화면에
--     티켓으로 즉시 표시. 주방은 만들고 [완료] 탭으로 치운다(라이브 큐).
--   · 흐름: 전송 = 곧바로 주방 표시(2차 확인 없음. 카트→전송이 이미 확인 단계).
--   · 돈(charges, 09)과 분리: charges = 정산 장부, kitchen_tickets = 조리 큐.
--     같은 전송이 charges 적재 + (주방행만) 티켓 발행을 동시에 한다.
--
--  station(메뉴별 처리 위치):
--   · kitchen = 조리 필요 → 주방 화면에 티켓 발행
--   · bar     = 드링크바에서 즉석 제조 → 티켓 없음(직원이 카트 보고 바로 만듦)
--   · none    = 골프샵 등 비조리 → 티켓 없음
--
--  실행: Supabase SQL Editor. 01~11 이후 실행. 멱등.
-- ============================================================================

-- ── menu_items 에 station 추가 (11에서 만든 테이블) ──
alter table menu_items add column if not exists station text not null default 'kitchen';

do $$
begin
  if not exists (select 1 from pg_constraint where conname='menu_items_station_chk') then
    alter table menu_items add constraint menu_items_station_chk
      check (station in ('kitchen','bar','none'));
  end if;
end $$;

-- 예시 시드(10)의 station 보정 — 음료=bar · 음식=kitchen · 골프샵/기타=none.
--  ⚠ station 은 category 로 자동 판별 불가(같은 '식음'에 生ビール=bar, 定食=kitchen).
--    실제 메뉴는 Min 님이 항목별로 station 을 지정해야 한다(기본값 kitchen).
update menu_items set station='bar'  where code in ('B1','B2','B3','D1','F1') and station='kitchen';
update menu_items set station='none' where code in ('P1','P2','P3','X1');
-- (M1,M2,E1,E2 는 기본값 kitchen 유지)


-- ── kitchen_tickets : 주방 조리 큐 ─────────────────────────────────────────
create table if not exists kitchen_tickets (
  id          bigserial     primary key,
  folio_id    uuid          references folios(id) on delete set null,
  event_seq   bigint,
  team_tag    text,                                  -- 표시용(어느 팀 주문인지)
  station     text          not null default 'kitchen',
  item_name   text          not null,               -- 일본어 메뉴명(주방이 보는 이름)
  qty         numeric(12,2) not null default 1,
  note        text,
  status      text          not null default 'new', -- new | done (라이브 큐)
  created_by  text,
  created_at  timestamptz   not null default now(),
  done_at     timestamptz
);
create index if not exists idx_ktickets_status on kitchen_tickets(status, created_at);
create index if not exists idx_ktickets_station on kitchen_tickets(station);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='kitchen_tickets_status_chk') then
    alter table kitchen_tickets add constraint kitchen_tickets_status_chk
      check (status in ('new','done'));
  end if;
end $$;

-- ── RLS — ⚠ 09·10 과 동일: 개발 단계용 임시(anon 전체허용). 운영 전 강화. ──
alter table kitchen_tickets enable row level security;
drop policy if exists p_all_kitchen_tickets on kitchen_tickets;
create policy p_all_kitchen_tickets on kitchen_tickets
  for all to anon, authenticated using (true) with check (true);

-- ============================================================================
--  끝.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  ▼▼▼  13_menu_seed.sql
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ============================================================================
--  SaiZen Hub — 13 실제 메뉴 시드 (메리트투어·야마나미 리조트 메뉴판 기준)
-- ----------------------------------------------------------------------------
--  출처: 메뉴판 이미지 2종(飲料 / Up-Grade·追加·おつまみ + 酒類持込料).
--  ⚠ 가격은 모두 税込(소비세 포함, 최종가). 시스템은 内税 처리(POS·정산이 단가에서
--    소비세 10%를 빼내 표시하며 더하지 않음). 따라서 unit_price = 손님이 내는 최종가.
--  station: kitchen(조리→주방 KDS 티켓) / bar(드링크바 즉석) / none(반입료 등 비조리).
--
--  실행: Supabase SQL Editor. 11·12 이후 실행. 멱등(아래 가드).
--  ⚠ 11_pos_menu.sql 의 예시 시드(B1,M1 …)는 placeholder이므로 함께 제거한다.
-- ============================================================================

-- 10의 예시 placeholder 제거(실데이터로 대체)
delete from menu_items where code in ('B1','B2','B3','D1','F1','M1','M2','E1','E2','P1','P2','P3','X1');

-- 실제 메뉴는 'NAMA-S'(生ビール 小) 존재 여부로 1회만 적재(멱등)
do $$
begin
  if not exists (select 1 from menu_items where code='NAMA-S') then
    insert into menu_items(code,name_ja,name_ko,category,venue,station,unit_price,sort_order) values
    -- ── 飲料(음료) · 드링크바 제조(station=bar) · 税込 ──
    ('NAMA-S','生ビール(小)','생맥주(소)','식음','restaurant','bar',600,10),
    ('NAMA-M','生ビール(中)','생맥주(중)','식음','restaurant','bar',700,11),
    ('NAMA-L','生ビール(大)','생맥주(대)','식음','restaurant','bar',950,12),
    ('NAMA-P','生ビール(ピッチャー)','생맥주(피처)','식음','restaurant','bar',1800,13),
    ('BIN','瓶ビール(アサヒ・キリン)','병맥주(아사히·기린)','식음','restaurant','bar',700,14),
    ('NONAL','ノンアルコールビール','무알콜 맥주','식음','restaurant','bar',500,15),
    ('HIGH','ハイボール','하이볼','식음','restaurant','bar',600,16),
    ('KSOJU','韓国焼酎(眞露・ジョウンデー)','한국소주(참이슬·좋은데이)','식음','restaurant','bar',700,17),
    ('JSOJU-G','焼酎グラス(芋・麦・米)','일본소주(잔)','식음','restaurant','bar',600,18),
    ('JSOJU-B','焼酎ボトル','일본소주(병)','식음','restaurant','bar',3300,19),
    ('SAKE-1','日本酒(1合)','니혼슈(1합)','식음','restaurant','bar',600,20),
    ('SAKE-2','日本酒(2合)','니혼슈(2합)','식음','restaurant','bar',1200,21),
    ('ONECUP','ワンカップ','원컵(니혼슈)','식음','restaurant','bar',500,22),
    ('REI','レイザン(冷酒)','레이잔(냉주)','식음','restaurant','bar',1200,23),
    ('DAIGIN','純米大吟醸','준마이 다이긴죠','식음','restaurant','bar',2800,24),
    ('UMEG','梅酒グラス','매실주(잔)','식음','restaurant','bar',600,25),
    ('WHIS','ウイスキー(角瓶・SUNTORY)','위스키(1병·산토리)','식음','restaurant','bar',6500,26),
    ('WINE-1','ワイン(ボトル)','와인(병)','식음','restaurant','bar',1500,27),
    ('WINE-2','ワイン(ボトル・中)','와인(병·중급)','식음','restaurant','bar',2500,28),
    ('WINE-3','ワイン(ボトル・上)','와인(병·상급)','식음','restaurant','bar',3000,29),
    ('SAWA','サワー','사와(사워)','식음','restaurant','bar',600,30),
    ('SD-COLA','コーラ','콜라','식음','restaurant','bar',350,31),
    ('SD-OOLONG','ウーロン茶','우롱차','식음','restaurant','bar',350,32),
    ('SD-CIDER','サイダー','사이다','식음','restaurant','bar',350,33),
    ('SD-LEMON','レモンスカッシュ','레몬 스쿼시','식음','restaurant','bar',350,34),
    ('SD-UME','梅スパークリング','매실 스파클링','식음','restaurant','bar',350,35),
    ('TANSAN-S','炭酸水(500cc)','탄산수(500cc)','식음','restaurant','bar',300,36),
    ('TANSAN-L','炭酸水(1L)','탄산수(1L)','식음','restaurant','bar',500,37),
    -- ── 석식 Up-Grade(1인당) · 주방(station=kitchen) · 税込 ──
    ('UP-KAISEKI','会席料理','카이세키 요리','식음','restaurant','kitchen',3000,50),
    ('UP-SUKI','すき焼き','스키야키','식음','restaurant','kitchen',3000,51),
    ('UP-SHABU','牛しゃぶしゃぶ','소고기 샤브샤브','식음','restaurant','kitchen',3000,52),
    ('UP-BBQ','バーベキュー','바베큐(4인 이상)','식음','restaurant','kitchen',3000,53),
    -- ── 追加 메뉴 · 주방 · 税込 ──
    ('ADD-SASHIMI','刺身(船盛・鯛姿造り)','회 모둠(도미)','식음','restaurant','kitchen',15000,60),
    ('ADD-SASHIMI-EBI','刺身(船盛)+伊勢海老','회 모둠+이세에비','식음','restaurant','kitchen',20000,61),
    ('ADD-UNAGI','うなぎ蒲焼き(1尾)','장어구이(1마리)','식음','restaurant','kitchen',5000,62),
    ('ADD-WAGYU','和牛ステーキ(1枚)','와규 스테이크(1인분)','식음','restaurant','kitchen',5000,63),
    ('ADD-BASASHI','馬刺し(1人前)','말고기 육회(1인분)','식음','restaurant','kitchen',5000,64),
    -- ── おつまみ 안주(각 800) · 주방 · 税込 · 19:30까지 ──
    ('SN-TAKO','タコの唐揚げ','낙지튀김','식음','restaurant','kitchen',800,70),
    ('SN-POTE','フライドポテト','감자튀김','식음','restaurant','kitchen',800,71),
    ('SN-TORI','鶏の竜田揚げ','닭튀김','식음','restaurant','kitchen',800,72),
    ('SN-GOBO','スティックごぼう唐揚げ','우엉튀김','식음','restaurant','kitchen',800,73),
    ('SN-TAKOWASA','タコワサビ','문어 와사비','식음','restaurant','kitchen',800,74),
    -- ── 酒類持込料(주류 반입료) · 비조리(station=none) · 기타 ──
    ('CORK-1','酒類持込料(一般1本)','주류반입료(일반 1병/팩/캔)','기타','restaurant','none',1000,90),
    ('CORK-2','酒類持込料(洋酒・1L以上)','주류반입료(양주·1L 이상 댓병)','기타','restaurant','none',2000,91),
    ('CORK-3','酒類持込料(保管分)','주류반입료(보관분)','기타','restaurant','none',1000,92);
  end if;
end $$;

-- ============================================================================
--  끝.  (메뉴 수정·추가는 ops/hub/menu.html 또는 이 파일 재편집)
-- ============================================================================
