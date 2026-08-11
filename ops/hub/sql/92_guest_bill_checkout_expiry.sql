-- ============================================================================
--  92_guest_bill_checkout_expiry.sql — 손님 QR 만료 기준을 '체크아웃'으로 교체
-- ----------------------------------------------------------------------------
--  90번은 '퇴실일 + 7일' 날짜만 봤다. 그런데 실제 업무 사실은 날짜가 아니라
--  「담당자가 체크아웃을 눌렀다」이다(Min 결정):
--    · 잔액이 남아 있는데 7일이 지나 손님이 조회를 못 하거나,
--    · 이미 다 내고 떠났는데 일주일이나 열려 있거나 — 둘 다 실제와 어긋난다.
--  → 91번에서 guests.check_status 를 쓰기 시작했으므로 그걸 1차 기준으로 삼는다.
--
--  만료 조건(둘 중 하나라도 해당하면 만료):
--    ① guests.check_status = '체크아웃'            ← 주 기준(담당자 버튼)
--    ② 퇴실일(bookings.arr_date) + 7일 경과        ← 백스톱
--  ②를 남기는 이유: 현장이 체크아웃 버튼을 누르지 않고 넘어가면 QR이 영구 유효가 된다.
--  버튼 누락이 곧 개인정보·금액 노출로 이어지지 않게 하는 안전망이다.
--
--  ⚠ 만료는 '손님 조회'만 차단. 직원은 로그인 상태로 정산·POS에서 계속 열람 가능.
--  ⚠ 카드 재인쇄·토큰 재발급 불필요 — 이 RPC 한 곳만 교정(기존 QR 그대로 사용).
--  멱등(create or replace). 90번을 대체한다. 번호 92.
-- ============================================================================

create or replace function guest_bill(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with t as (          -- 토큰 → 팀 + 퇴실일 + 체크아웃 상태
    select ot.event_seq,
           b.arr_date,
           coalesce(g.check_status, '') as cs
    from order_tokens ot
    join bookings b on b.event_seq = ot.event_seq
    left join guests g on g.event_seq = ot.event_seq
    where ot.token = p_token
  ),
  v as (               -- 유효 토큰만. 이후 CTE는 전부 v 기준.
    select event_seq from t
    where cs <> '체크아웃'                                        -- ① 담당자 체크아웃
      and (arr_date is null or current_date <= (arr_date + 7))    -- ② 날짜 백스톱
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
    -- 토큰은 유효하지만 체크아웃됨(또는 퇴실 7일 경과) → 만료(화면에 '이용 종료' 안내)
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
--   select guest_bill('<체류중 팀 토큰>')->'ok';     -- true
--   -- 그 팀을 프런트에서 체크아웃 처리한 뒤 다시:
--   select guest_bill('<같은 토큰>');                -- {"ok": false, "expired": true}
--   select guest_bill('없는토큰');                   -- {"ok": false}
