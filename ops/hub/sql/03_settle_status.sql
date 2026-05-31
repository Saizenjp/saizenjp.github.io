-- ============================================================================
--  SaiZen Hub — 03 정산 상태 분리 (settle_status)  · 룸차지 선불/현장 구분
-- ----------------------------------------------------------------------------
--  배경:
--   · 숙박 기본요금 = 패키지 선불(이미 받음) → 정산에서 "선불 완료" 표시만
--   · 싱글차지(1인 4,400/박) = 원칙 현장 지불이나, 메리트투어 선불자도 있음
--     - 엠클릭 비고/카톡으로 "선불" 전달 → 현장에서 또 받으면 이중청구
--   · 해결: transactions에 settle_status 추가
--       onsite        = 현장 청구(체크아웃 때 받음) → 정산 합산
--       prepaid_merit = 메리트 선불 완료 → 합산 제외, "선불" 표시만
--  · 개인 특정: member_id(기존 컬럼)로 누가 선불인지 귀속
--  · 01·02 SQL 실행 후 이어서 실행. 멱등.
-- ============================================================================

-- ── settle_status 컬럼 추가 ──
alter table transactions
  add column if not exists settle_status text not null default 'onsite';

-- 값 제약(onsite / prepaid_merit). 기존 제약 있으면 건너뜀.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_settle_status_chk'
  ) then
    alter table transactions
      add constraint transactions_settle_status_chk
      check (settle_status in ('onsite','prepaid_merit'));
  end if;
end $$;

create index if not exists idx_tx_settle on transactions(settle_status);

-- ── 정산 합산 뷰 갱신: 현장청구(onsite)만 SUM, 선불(prepaid_merit) 별도 집계 ──
-- 기존 뷰(01에서 생성)의 컬럼 구성이 바뀌므로 먼저 삭제 후 재생성.
drop view if exists v_folio_summary;
create view v_folio_summary as
select
  g.event_seq,
  g.team_tag,
  g.group_code,
  b.rep_name,
  g.accom,
  g.pax,
  b.sales_amount                                                                 as prepaid_package,   -- 패키지 선불(참고)
  coalesce(sum(t.amount) filter (where not t.voided and t.settle_status='onsite'), 0)        as onsite_charge,    -- 현장 청구(받을 돈)
  coalesce(sum(t.amount) filter (where not t.voided and t.settle_status='prepaid_merit'), 0) as merit_prepaid,    -- 메리트 선불 완료(표시용)
  count(t.id) filter (where not t.voided and t.settle_status='onsite')           as onsite_count,
  g.session_ym
from guests g
join bookings b on b.event_seq = g.event_seq
left join transactions t on t.event_seq = g.event_seq
group by g.event_seq, g.team_tag, g.group_code, b.rep_name, g.accom, g.pax, b.sales_amount, g.session_ym;

-- ── 개인별 룸차지 상세 뷰 (정산서에 "전정숙님 싱글차지 — 선불완료" 표기용) ──
drop view if exists v_folio_lines;
create view v_folio_lines as
select
  t.id,
  t.event_seq,
  g.team_tag,
  gm.seq_in_team,
  coalesce(gm.name_kr, '(팀 공통)')      as person,
  t.category,
  t.description,
  t.qty,
  t.unit_price,
  t.amount,
  t.currency,
  t.settle_status,
  t.posted_by,
  t.voided
from transactions t
join guests g on g.event_seq = t.event_seq
left join guest_members gm on gm.id = t.member_id
where not t.voided
order by t.event_seq, gm.seq_in_team nulls first, t.occurred_at;
