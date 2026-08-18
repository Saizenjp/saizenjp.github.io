-- ============================================================================
--  114_transfer_stay.sql — 체류중 송영(왕복 셔틀) 구간 추가
-- ----------------------------------------------------------------------------
--  Min 2026-08: 송영표에 **체류중 송영**도 있어야 한다.
--   · 간지호텔 · 시즈노야도 → **야마나미CC 라운딩이 있는 날** 왕복
--   · 쿠주힐즈 → 1분 거리지만 **아침·저녁 기본 왕복**
--   · 중간에 잠깐 오가는 이동은 송영표에서 제외한다.
--  전용 테이블은 만들지 않는다 — 편성은 예약·숙소·라운딩 규칙에서 그날그날 계산하고,
--  현장 점검만 기존 `transfer_checks`(110)에 남긴다. leg 에 왕복 두 구간을 추가한다.
--  멱등. Supabase SQL Editor 수동 실행(또는 MCP apply_migration).
-- ============================================================================

alter table transfer_checks drop constraint if exists transfer_checks_leg_check;
alter table transfer_checks add constraint transfer_checks_leg_check
  check (leg in ('in','out','stay_am','stay_pm'));

-- 확인:
--   select leg, count(*) from transfer_checks group by 1 order by 1;
