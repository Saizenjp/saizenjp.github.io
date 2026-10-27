-- ============================================================================
-- 157_settlement_schema_sync.sql — 현장 정산 스키마 동기화 메모 + 소비세 공통 함수 (P0, docs/06 정산 보강 2026-10-27)
-- ----------------------------------------------------------------------------
--  배경: docs/06 §1-1 — 09_settlement_core.sql 과 실DB 가 다르다. 09 는 이미 실행된 이력이라 고치지 않고
--        실DB 기준을 여기에 적는다(코드·문서가 실DB 를 따른다).
--  실DB 기준(2026-10-27 pg_constraint·information_schema 대조, docs/07_현장정산_실DB_스키마.md 에 전문):
--   · folios(event_seq integer NN) → bookings FK 없음. **일부러 없는 상태** — 워크인(walkins, event_seq 9,900,001+)·
--     현장 접수 팀은 bookings 에 없고 folios 는 그 event_seq 를 그대로 쓴다. ⚠ FK 를 다시 만들지 않는다.
--   · charges.event_seq·unit_price·amount·tax·service_charge = integer (09 파일의 bigint·numeric(14,0) 이 아님). qty 만 numeric.
--     source NN default 'frontdesk', pay_method(50)·link_ref(100) 컬럼 있음.
--   · payments.amount integer. method check 현금/카드.
--   · folios 에 같은 내용의 check 제약이 두 벌(folios_status_check/_chk · folios_subject_check/_chk) → 09 가 만든 `_chk` 만 남긴다.
--   · 뷰 v_folio_balance·v_settlement_by_category 는 security_invoker=on (39).
--   · 세액 계산 지점: JS pos.html·settle.html·frontdesk.html(P0 에서 saizen-core SZCore.taxIncluded 로 통일) /
--     SQL cart_sync_charge(100)·golf_add_charge(146) — 식은 모두 税込 − round(税込/1.1) 과 정수 엔에서 동일. SQL 쪽은 P1(세율 컬럼)에서 아래 tax_included() 로 교체.
--  이 파일이 하는 일: ① 중복 check 제약 한 벌 제거(동일 내용이라 동작 불변) ② 소비세 공통 SQL 함수 tax_included(税込, 세율%) 정의(P1 에서 사용, 지금은 미참조)
--  하지 않는 일: 테이블·컬럼·데이터 변경 없음. 정산 기록 삭제 없음(§0.4).
--  멱등. ⚠ 실행 전 Min 확인(docs/06 §0.3). 00_VERIFY 157.
-- ============================================================================

-- ① folios 중복 check 제약 정리 — 같은 조건의 제약이 두 벌이면 한 벌만 남긴다(`_chk` = 09 파일 이름)
alter table public.folios drop constraint if exists folios_status_check;
alter table public.folios drop constraint if exists folios_subject_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.folios'::regclass and conname='folios_status_chk') then
    alter table public.folios add constraint folios_status_chk check (status in ('open','closed','settled'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.folios'::regclass and conname='folios_subject_chk') then
    alter table public.folios add constraint folios_subject_chk check (subject in ('team','member'));
  end if;
end $$;

-- ② 소비세(内税) 공통 함수 — 税込 금액에 포함된 소비세. JS SZCore.taxIncluded 와 같은 식(정수 엔 전수 대조: tests/saizen-core-tax.test.mjs)
--    p_rate = % 정수(10 / 8 / 0). 0 이면 0(비과세·불과세). 적격청구서용 세율별 1회 단수처리(P1·D1)는 별도.
create or replace function public.tax_included(p_gross integer, p_rate integer default 10)
returns integer
language sql immutable strict as $$
  select case when p_rate <= 0 then 0
              else p_gross - round(p_gross::numeric / (1 + p_rate::numeric / 100))::integer end;
$$;
revoke all on function public.tax_included(integer, integer) from public;
grant execute on function public.tax_included(integer, integer) to authenticated, anon;   -- 순수 계산(데이터 접근 없음), 손님 QR 청구서(anon) 에서도 쓸 수 있게

-- 확인(실행 뒤)
-- select tax_included(1000), tax_included(1080, 8), tax_included(1000, 0);           -- 91 · 80 · 0
-- select conname from pg_constraint where conrelid='public.folios'::regclass;        -- pkey · folios_status_chk · folios_subject_chk
-- select count(*) from pg_constraint where conrelid='public.folios'::regclass and contype='f';  -- 0 (FK 없음 = 의도)
