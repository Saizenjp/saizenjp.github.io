-- ============================================================================
--  121_guest_bill_room.sql — 손님 청구서(bill.html)에 방 번호 추가
-- ----------------------------------------------------------------------------
--  손님이 QR로 여는 청구서 화면에 이름만 있고 방 번호가 없어 "이게 내 방 맞나"
--  확인이 안 됐다(Min 요청). order_tokens 는 팀(event_seq) 단위 1토큰이라(한
--  팀이 방을 여러 개 쓰면 모든 방 카드에 같은 QR이 찍힌다) 특정 방 하나를
--  고를 수 없다 → 오늘 밤 그 팀이 쓰는 방 번호를 전부 모아 보여준다.
--
--  92번 guest_bill 을 대체(create or replace, 번호 이어감). 92번의 만료 로직은 그대로.
--  멱등. Supabase SQL Editor 또는 MCP apply_migration.
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
  rn as (               -- 오늘 밤 그 팀이 쓰는 방 번호(여러 방이면 전부, 중복 제거·정렬)
    select coalesce(jsonb_agg(distinct room_no order by room_no), '[]'::jsonb) rooms
    from rooms
    where event_seq in (select event_seq from v)
      and room_no is not null
      and check_in <= current_date and current_date < check_out
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
      'rooms',    (select rooms from rn),
      'gross',    (select g from b),
      'paid',     (select p from b),
      'balance',  (select d from b),
      'lines',    (select lines from ln)
    ) end;
$$;

revoke execute on function guest_bill(text) from public;
grant execute on function guest_bill(text) to anon, authenticated;

-- 확인:
--   select guest_bill('<체류중 팀 토큰>')->'rooms';   -- ["1310","1311"] 형태
