-- ============================================================================
--  SaiZen Hub — 11 주방 화면(KDS) 티켓 + 메뉴 station 라우팅
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
--  실행: Supabase SQL Editor. 01~10 이후 실행. 멱등.
-- ============================================================================

-- ── menu_items 에 station 추가 (10에서 만든 테이블) ──
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
