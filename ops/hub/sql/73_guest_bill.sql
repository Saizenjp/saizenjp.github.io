-- ============================================================================
--  73_guest_bill.sql — 손님 셀프 결제내역 조회(QR) RPC
-- ----------------------------------------------------------------------------
--  손님이 팀 QR(order_tokens)을 자기 폰으로 찍으면 bill.html 이 열려 그 팀의
--  청구 내역(결제완료·미결제 잔액)을 본다. 손님은 비로그인(anon)이라 folio·charges
--  직접 접근은 RLS로 막혀 있음 → 토큰(추측불가 비밀)로만 그 팀 내역을 돌려주는
--  security definer RPC 로 노출(다른 팀·전체 열람 불가).
--   · 입력=token → order_tokens 에서 event_seq 해석 → 그 팀 folio 합계 + 청구줄.
--   · 금액만 읽기(수정·결제는 직원 POS). 토큰 없으면 {ok:false}.
--  멱등. ⚠ 수동/MCP 적용.
-- ============================================================================

create or replace function guest_bill(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with t as (
    select event_seq from order_tokens where token = p_token
  ),
  b as (
    select coalesce(sum(gross_total),0) g, coalesce(sum(paid_total),0) p, coalesce(sum(balance),0) d
    from v_folio_balance where event_seq in (select event_seq from t)
  ),
  tg as (
    select coalesce(team_tag, group_code) tag, rep_name
    from v_folio_balance where event_seq in (select event_seq from t) limit 1
  ),
  ln as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'description', description,
             'qty', qty,
             'amount', coalesce(amount,0)+coalesce(tax,0)+coalesce(service_charge,0)
           ) order by charged_at), '[]'::jsonb) lines
    from charges where event_seq in (select event_seq from t) and voided = false
  )
  select case
    when not exists(select 1 from t) then jsonb_build_object('ok', false)
    else jsonb_build_object(
      'ok', true,
      'rep_name', coalesce((select rep_name from tg), (select rep_name from bookings where event_seq in (select event_seq from t) limit 1)),
      'tag',      (select tag from tg),
      'gross',    (select g from b),
      'paid',     (select p from b),
      'balance',  (select d from b),
      'lines',    (select lines from ln)
    ) end;
$$;

grant execute on function guest_bill(text) to anon, authenticated;
