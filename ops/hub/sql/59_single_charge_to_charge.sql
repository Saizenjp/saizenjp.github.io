-- ============================================================================
--  59_single_charge_to_charge.sql — 싱글차지(1인 사용 추가요금) → 정산(charges) 자동 연동
-- ----------------------------------------------------------------------------
--  배경(구멍): room.html 의 싱글차지(간지·시즈노야도 1인 사용 ¥4,400/박 등)는
--    transactions(category='single_charge') 에만 기록됐는데, 御請求書·프론트데스크 잔액은
--    charges 기반 v_folio_balance 만 읽어서 **체크아웃 청구서에 안 잡히던** 누락.
--  처리: 58(夕食 別注)과 동일 패턴 — settle_status<>'prepaid_merit'(현장청구) 건만
--    그 팀 folio/charges 로 자동 동기화. 메리트 선불분(prepaid_merit)·voided 는 청구 없음.
--    · gross=amount(税込), 内税 10%. category='숙박'(룸 부대), source='room'.
--    · charges.link_ref='transaction:<id>' 1:1 → 수정/삭제/선불전환 시 자동 재동기화.
--      (room.html 이 미배정 해제 시 transactions 행을 delete → 트리거가 charge 도 제거)
--  SECURITY DEFINER: charges 쓰기 RLS(settle·pos) 우회. 권한은 transactions INSERT(room)로 게이트.
--  멱등. ⚠ Supabase SQL Editor 수동 실행(또는 MCP). 58 이후. (link_ref 컬럼은 58에서 추가됨)
-- ============================================================================

create or replace function single_charge_sync_charge() returns trigger
language plpgsql security definer set search_path=public as $fn$
declare
  v_folio uuid;
  v_gross numeric;
  v_net   numeric;
  v_tax   numeric;
  v_key   text;
begin
  if (TG_OP = 'DELETE') then
    delete from charges where link_ref = 'transaction:'||OLD.id;
    return OLD;
  end if;

  v_key := 'transaction:'||NEW.id;
  delete from charges where link_ref = v_key;

  -- 싱글차지 + 현장청구만 청구(메리트 선불·voided·금액0·팀없음 = 청구 없음)
  if NEW.category is distinct from 'single_charge' then return NEW; end if;
  if NEW.settle_status = 'prepaid_merit' then return NEW; end if;
  if coalesce(NEW.voided,false) then return NEW; end if;
  if NEW.amount is null or NEW.amount <= 0 then return NEW; end if;
  if NEW.event_seq is null then return NEW; end if;

  select id into v_folio from folios
    where event_seq = NEW.event_seq and subject='team' and status='open'
    order by opened_at limit 1;
  if v_folio is null then
    insert into folios(event_seq, subject, status, created_by)
      values (NEW.event_seq, 'team', 'open', coalesce(NEW.posted_by,'system'))
      returning id into v_folio;
  end if;

  v_gross := NEW.amount;
  v_net   := round(v_gross / 1.1);
  v_tax   := v_gross - v_net;

  insert into charges(folio_id, event_seq, category, source, description,
    qty, unit_price, amount, tax, service_charge, member_id, link_ref, created_by)
  values (v_folio, NEW.event_seq, '숙박', 'room', coalesce(NEW.description,'シングルチャージ'),
    coalesce(NEW.qty,1), coalesce(NEW.unit_price, v_gross), v_net, v_tax, 0, NEW.member_id, v_key,
    coalesce(NEW.posted_by,'system'));

  return NEW;
end $fn$;

drop trigger if exists trg_single_charge_charge on transactions;
create trigger trg_single_charge_charge
  after insert or update or delete on transactions
  for each row execute function single_charge_sync_charge();

-- 기존 현장청구 싱글차지도 1회 동기화(이미 링크된 건 재계산):
do $back$
declare r record;
begin
  for r in select id from transactions
           where category='single_charge' and coalesce(settle_status,'onsite')<>'prepaid_merit'
                 and coalesce(voided,false)=false and coalesce(amount,0)>0 loop
    update transactions set updated_at = now() where id = r.id;   -- no-op UPDATE → 트리거 발동
  end loop;
end $back$;
