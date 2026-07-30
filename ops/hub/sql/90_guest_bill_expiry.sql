-- ============================================================================
--  90_guest_bill_expiry.sql — 손님 QR(청구 조회) 토큰 체크아웃 후 자동 무효화
-- ----------------------------------------------------------------------------
--  문제: order_tokens 에 만료가 없어 토큰이 영구 유효. guest_bill 은 anon 허용이라
--        QR 사진이 단톡방에 공유되거나 명패/카드를 찍히면, 체류가 끝난 뒤에도
--        그 팀 대표자명·청구 상세·잔액이 계속 열린다(개인·금액 정보 노출).
--  해결: 토큰 → 예약의 퇴실일(bookings.arr_date) 기준 유예기간(GRACE=7일)이 지나면
--        내역을 돌려주지 않고 {ok:false, expired:true} 만 반환.
--        · 체류 중 + 퇴실 직후(정산 확인·이의 제기 여유)는 그대로 열림.
--        · 카드 재인쇄·토큰 재발급 불필요(RPC 한 곳만 교정 → 기존 QR 그대로 사용).
--        · 서버시각(UTC)과 JST 차(9h)는 유예 7일에 묻혀 영향 없음.
--  ⚠ 만료는 '손님 조회'만 차단. 직원은 로그인 상태로 정산·POS에서 계속 열람 가능.
--  멱등(create or replace). MCP apply_migration 적용.
-- ============================================================================

create or replace function guest_bill(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with t as (          -- 토큰 → 팀 + 퇴실일
    select ot.event_seq, b.arr_date
    from order_tokens ot
    join bookings b on b.event_seq = ot.event_seq
    where ot.token = p_token
  ),
  v as (               -- 유효 토큰만(퇴실 + 7일 이내). 이후 CTE는 전부 v 기준.
    select event_seq from t
    where arr_date is null or current_date <= (arr_date + 7)
  ),
  b as (
    select coalesce(sum(gross_total),0) g, coalesce(sum(paid_total),0) p, coalesce(sum(balance),0) d
    from v_folio_balance where event_seq in (select event_seq from v)
  ),
  tg as (
    select coalesce(team_tag, group_code) tag, rep_name
    from v_folio_balance where event_seq in (select event_seq from v) limit 1
  ),
  ln as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'description', description,
             'qty', qty,
             'amount', coalesce(amount,0)+coalesce(tax,0)+coalesce(service_charge,0)
           ) order by charged_at), '[]'::jsonb) lines
    from charges where event_seq in (select event_seq from v) and voided = false
  )
  select case
    when not exists(select 1 from t) then jsonb_build_object('ok', false)
    -- 토큰은 유효하지만 체류가 끝난 경우 → 만료(화면에 '이용 종료' 안내)
    when not exists(select 1 from v) then jsonb_build_object('ok', false, 'expired', true)
    else jsonb_build_object(
      'ok', true,
      'rep_name', coalesce((select rep_name from tg), (select rep_name from bookings where event_seq in (select event_seq from v) limit 1)),
      'tag',      (select tag from tg),
      'gross',    (select g from b),
      'paid',     (select p from b),
      'balance',  (select d from b),
      'lines',    (select lines from ln)
    ) end;
$$;

grant execute on function guest_bill(text) to anon, authenticated;

-- 확인:
--   select guest_bill('<유효토큰>')->'ok';                        -- 체류중 → true
--   select guest_bill('없는토큰');                                -- {"ok": false}
--   -- 퇴실 8일 지난 팀 토큰 → {"ok": false, "expired": true}
