-- ============================================================================
-- 122_cart_auto_qty.sql — 카트 대수의 출처 기록(자동 조정 여부)
--
--  배경: 카트 대수는 규칙(인원÷4, 올림)으로 자동으로 채워지는데, 한 번 저장되면
--        인원이 바뀌어도 다시 계산되지 않았다(autoConfirm 은 행이 없는 날만 채운다).
--        예) 전유열팀 10월 — 8/18 에 2대로 저장된 날과 8/25 에 1대로 저장된 날이 섞임.
--
--  변경: 대수가 **규칙이 넣은 값인지 사람이 정한 값인지**를 행에 남긴다.
--        방배정의 rooms.assign_source(auto/manual) 와 같은 발상.
--          true  = 규칙이 넣은 값 → 인원이 바뀌면 화면이 자동으로 맞춘다(요금도 연동)
--          false = 사람이 대수를 직접 입력 → 자동으로 바꾸지 않고 ⚠ 배지로만 알린다
--
--  기존 행은 true: 지금까지 화면이 규칙으로 자동 채워 온 값이고, 실제로 취소·메모 등
--  사람 손길의 흔적이 남은 행이 0건이었다(238행 조회 기준).
--
--  멱등. Supabase SQL Editor 수동 실행 또는 MCP. 번호 122. (MCP 적용 완료)
-- ============================================================================

alter table cart_bookings add column if not exists auto_qty boolean not null default true;

comment on column cart_bookings.auto_qty is
  '대수 출처: true=규칙 자동(인원 바뀌면 자동 조정) / false=사람이 직접 입력(자동 변경 안 함)';

-- 확인용:
--   select play_date, event_seq, qty, auto_qty, cancelled from cart_bookings order by play_date limit 20;
