-- ════════════════════════════════════════════════════════════════════════
-- 10_member_grade.sql  (09 는 현장정산 09_settlement_core.sql 가 선점 → 10 으로)
-- 일행별예약 "개인 단위" 회원권 구분(고객등급 → 추후 회원권구분) 도입.
--   · 기존 bookings.member_type 은 "팀 단위" 회원권구분 → 그대로 유지.
--   · 여기서는 개인 1명마다 등급을 새로 보관한다(passengers / guest_members).
--      값 예: '회원권' / '일반고객' / (공란)  → 추후 '다이아몬드1' '
--             EWRC이용권' 등 회원권명으로 대체될 예정. 원문 그대로 저장한다.
--      회원 판정은 화면(room.html)에서: 공란·'일반고객'·'일반' = 일반, 그 외 = 회원.
--
-- 또한 STEP2 자동배정을 위해 rooms 에 배정 출처(auto/manual)를 추가한다.
--   · 자동배정은 assign_source='auto' 행만 재정렬한다(수기 배정은 보호).
--
-- PostgreSQL / Supabase 에서 실행. 01~08 실행 완료 상태에서 이어 실행할 것.
-- 멱등: add column if not exists. 여러 번 실행해도 안전.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- 1) 개인 단위 등급 (일행별예약 '고객등급' / 추후 '회원권구분')
alter table passengers     add column if not exists member_grade text;
alter table guest_members  add column if not exists member_grade text;

-- 2) 방배정 출처: 'manual'(수기·기본) / 'auto'(자동배정)
--    기존 행은 전부 수기로 간주(NULL→'manual').
alter table rooms add column if not exists assign_source text not null default 'manual';

commit;

-- 확인용
-- select column_name, data_type from information_schema.columns
--  where table_name in ('passengers','guest_members','rooms')
--    and column_name in ('member_grade','assign_source');
