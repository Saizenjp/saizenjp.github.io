-- 86_bookings_reserved_at.sql — 예약 접수일(엠클릭 예약일자) 저장
--   · 목적: 우선예약 기간(예: 2025-09~12 접수) 등 '언제 예약을 받았는가' 기준 통계.
--   · 기존 created_at=임포트 시각, event_no 날짜=출발일 → 접수일과 무관. 별도 컬럼 필요.
--   · step1 임포트가 예약리스트 '예약일자' 컬럼을 birthISO 파싱해 채운다. 없으면 null(과거분).
-- 멱등.
alter table public.bookings add column if not exists reserved_at date;
