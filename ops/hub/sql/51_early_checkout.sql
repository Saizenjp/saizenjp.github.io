-- ============================================================================
--  51_early_checkout.sql — 조기 퇴실(개인 단위)
-- ----------------------------------------------------------------------------
--  목적: 팀 전체가 아니라 1~2명만 예정보다 일찍 귀국하는 현장 케이스.
--    · guest_members.actual_dep = 그 사람의 실제 퇴실일(null=예정대로 끝까지 체류).
--      방배정(room.html)에서 그 사람 rooms.check_out 을 이 날짜로 단축해 침대를 해제,
--      夕食 식수도 actual_dep 이후로는 그 사람을 제외(현장 실인원 반영).
--    · actual_dep_reason = 사유(선택, 손기입).
--    · B2B 정산(settle_merit)은 불변 — 환불은 현장 御請求書(별도 시스템).
--  멱등. ⚠ Supabase SQL Editor 수동 실행(50 이후). (MCP로도 적용)
-- ============================================================================

alter table guest_members add column if not exists actual_dep date;
alter table guest_members add column if not exists actual_dep_reason text;

comment on column guest_members.actual_dep is '조기 퇴실 실제일(null=예정대로). room.html에서 설정, 식수·침대 반영';
