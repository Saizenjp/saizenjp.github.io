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
--   · 세금: 소비세 10% "별도"(세전 단가 입력 → tax = round(amount*0.10)) · 봉사료 없음
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
--  · amount = 세전 소계(qty*unit_price 등) 를 직접 저장(정합성).
--  · tax = 소비세(별도). service_charge = 0(봉사료 미부과 정책). 둘 다 직접 저장.
--  · voided = 취소 처리(삭제 대신 무효화 → 금전 감사 추적).
create table if not exists charges (
  id             uuid          primary key default gen_random_uuid(),
  folio_id       uuid          not null references folios(id) on delete cascade,
  event_seq      bigint        references bookings(event_seq) on delete set null,
  category       text          not null,                -- 라운딩/식음/숙박/골프샵/기타
  source         text,                                  -- banquet/restaurant/golf/proshop/room/frontdesk
  description    text,
  qty            numeric(12,2) not null default 1,
  unit_price     numeric(14,0) not null default 0,      -- 세전 단가(JPY)
  amount         numeric(14,0) not null default 0,      -- 세전 소계(합산 대상)
  tax            numeric(14,0) not null default 0,      -- 소비세(별도 10%)
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
