-- ============================================================================
-- 123_walkin_golf.sql — 당일 골프 손님(워크인): 골프 정보 + 프론트 등록 + QR
--
--  Min 확인(2026-08): **순수 워크인은 없다. 워크인은 전부 골프를 치러 오는 손님이다.**
--   → 조편성이 필요하고(명단이 없어 자동 배정이 안 되므로 사람이 확인해야 한다),
--     골프장·레스토랑·골프샵 여러 곳에서 같은 손님을 알아봐야 하므로 QR 도 준다.
--   → 등록은 **프론트에서** 받는다(Min 결정).
--
--  멱등. MCP 적용 완료. 번호 123.
-- ============================================================================

-- ① 골프 정보 — 조편성에 필요한 최소한만
alter table walkins add column if not exists holes    integer;   -- 9 / 18 / 27
alter table walkins add column if not exists tee_pref text;      -- 희망 티오프 'HH:MM'
alter table walkins add column if not exists course   text;      -- aso/sobo/kuju (비우면 자동)
alter table walkins add column if not exists phone    text;      -- 당일 손님이라 연락 수단이 필요

-- ② order_tokens 가 워크인 번호도 받게
--    워크인은 walkins 에 있고 bookings 에 없다. 한 FK 로 두 테이블을 묶을 수 없으므로
--    FK 를 제거하고, 예약/워크인이 지워질 때 토큰을 정리하는 트리거를 양쪽에 단다.
alter table order_tokens drop constraint if exists order_tokens_event_seq_fkey;
-- create or replace function order_tokens_cleanup() … (본문은 적용본 참조)
-- trigger trg_ot_cleanup_bookings / trg_ot_cleanup_walkins

-- ③ walkin_open 확장 — 권한에 front·golf 추가 + 골프 인자 4개
--    (p_name, p_pax, p_venue, p_date, p_holes, p_tee, p_course, p_phone)

-- ④ walkins 쓰기 권한에 front·golf 추가(등록 화면이 프론트로 가므로)

-- 확인용:
--   select event_seq, walk_date, name, pax, holes, tee_pref, course from walkins order by event_seq;
