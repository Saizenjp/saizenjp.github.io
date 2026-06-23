-- ============================================================================
--  31_member_class.sql — 일행별예약 신규 컬럼(T/U/V) 개인 단위 회원 정보 저장
-- ----------------------------------------------------------------------------
--  2026-06 일행별예약 양식 변경: T=고객등급 · U=회원구분 · V=회원권구분 추가.
--   · member_grade (기존, 10_member_grade.sql) = 고객등급(T): '회원권'/'일반고객'
--       → room.html 자동배정의 회원/일반 판정 소스. 그대로 유지.
--   · member_class (신규) = 회원권구분(V): 'EWRCⅡ'·'다이아몬드'… 실제 등급(개인).
--   · member_div   (신규) = 회원구분(U):  '정회원' 등.
--  · passengers·guest_members 양쪽에 추가(개인 단위). 멱등 재실행 가능.
--  ⚠ step1 import 전에 먼저 실행할 것(없으면 신규 컬럼 upsert가 실패).
--  실행: Supabase SQL Editor.
-- ============================================================================

alter table passengers    add column if not exists member_class text;  -- 회원권구분(V) 실제 등급
alter table passengers    add column if not exists member_div   text;  -- 회원구분(U)
alter table guest_members add column if not exists member_class text;
alter table guest_members add column if not exists member_div   text;
