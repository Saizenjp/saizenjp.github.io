-- ============================================================================
--  108_qr_reissue.sql — 주문 QR 카드 재발급(분실 대응)
-- ----------------------------------------------------------------------------
--  카드를 잃어버리면 그 QR을 주운 사람이 그 팀 청구내역(bill.html)을 볼 수 있다.
--  → 같은 팀에 새 토큰을 발급하고 **옛 토큰은 그 즉시 무효**로 만든다.
--   · order_tokens 는 event_seq PK 1행 = 그 팀의 현재 토큰. 재발급 = 그 행의
--     token 을 새 값으로 **UPDATE**(삭제+삽입이 아니라 갱신이라 토큰 없는 순간이 없다).
--     옛 토큰 문자열은 어디에도 남지 않으므로 스캔·조회가 즉시 실패한다.
--   · **주문·정산 내역은 그대로**: charges·folios·payments 는 event_seq 로 묶여 있고
--     토큰을 참조하지 않는다(토큰은 '그 팀을 여는 열쇠'일 뿐).
--   · 62 에는 select/insert/delete 정책만 있어 UPDATE 가 RLS 로 막혀 있었다 → 추가.
--   · 발급·재발급 권한에 front·settle 추가: 카드 분실은 프론트가 받고, 정산 화면에서
--     청구서 QR을 손님 폰으로 보여줄 때 토큰이 없으면 그 자리에서 발급해야 한다.
--   · 재발급 이력(누가·언제·몇 번째)은 change_log(entity='qr_token') 에 남긴다.
--  멱등. ⚠ Supabase SQL Editor 수동 실행(또는 MCP apply_migration).
-- ============================================================================

alter table order_tokens add column if not exists reissued_at   timestamptz;
alter table order_tokens add column if not exists reissue_count int not null default 0;

-- 발급(insert): 인쇄·객실 + 프론트·정산
drop policy if exists ot_ins on order_tokens;
create policy ot_ins on order_tokens for insert to authenticated
  with check (has_any_area(array['print','room','front','settle']));

-- 갱신(재발급): 발급과 같은 권한. 옛 토큰은 이 UPDATE 즉시 무효가 된다.
drop policy if exists ot_upd on order_tokens;
create policy ot_upd on order_tokens for update to authenticated
  using      (has_any_area(array['print','room','front','settle']))
  with check (has_any_area(array['print','room','front','settle']));

-- 확인:
--   select event_seq, left(token,8)||'…' tok, reissue_count, reissued_at
--     from order_tokens order by reissued_at desc nulls last limit 10;
