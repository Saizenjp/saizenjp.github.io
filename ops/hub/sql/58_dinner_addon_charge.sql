-- ============================================================================
--  58_dinner_addon_charge.sql — 夕食 別注(추가·업그레이드) → 정산(charges) 자동 연동
-- ----------------------------------------------------------------------------
--  목적: dinner.html 의 別注(kind='add'/'upgrade', 가격 있음)을 등록하면 그 팀의
--    御請求書(folios/charges)에 자동으로 청구가 잡히도록 한다(돈이 빠지는 구멍 차단).
--    · 알레르기(kind='allergy')·가격 없음·수량 0 = 청구 대상 아님(주방 발주만).
--    · 업그레이드 price=차액(¥3,000/인 등), 추가=메뉴가. gross=price×qty, 内税 10%.
--    · charges.link_ref='dinner_addon:<id>' 로 1:1 링크 → 수정/삭제 시 자동 재동기화.
--  ⚠ charges.source_ref 는 live DB에서 uuid 타입(스키마 드리프트)이라 텍스트 링크 불가
--    → 서브시스템 링크 전용 텍스트 컬럼 link_ref 를 새로 추가(additive·money 테이블 안전).
--  ⚠ charges 쓰기 RLS=settle·pos 영역뿐이라, dinner(print/room) 사용자는 직접 insert 불가.
--    → 트리거 함수를 SECURITY DEFINER 로 두어 서버단에서 안전히 생성(권한은 dinner_addons
--      INSERT(room·print) 로 이미 게이트됨). 팀 folio 없으면 자동 개설(POS ensureFolio 동일).
--  멱등 재실행 가능. ⚠ Supabase SQL Editor 수동 실행(또는 MCP). 57 이후.
-- ============================================================================

-- 서브시스템 링크 전용 텍스트 컬럼(夕食 별주 등 외부 행과 1:1 연결)
alter table charges add column if not exists link_ref text;
create index if not exists idx_charges_link_ref on charges(link_ref);

create or replace function dinner_addon_sync_charge() returns trigger
language plpgsql security definer set search_path=public as $fn$
declare
  v_folio uuid;
  v_gross numeric;
  v_net   numeric;
  v_tax   numeric;
  v_key   text;
  v_desc  text;
begin
  -- 삭제: 연동 charge 제거
  if (TG_OP = 'DELETE') then
    delete from charges where link_ref = 'dinner_addon:'||OLD.id;
    return OLD;
  end if;

  v_key := 'dinner_addon:'||NEW.id;
  -- 기존 연동 charge 제거 후 재계산(insert/update 공통 — 단순·정확)
  delete from charges where link_ref = v_key;

  -- 청구 대상이 아니면 종료(charge 없음): 알레르기·가격없음·수량0·팀없음
  if NEW.kind not in ('add','upgrade') then return NEW; end if;
  if NEW.price is null or NEW.price <= 0 then return NEW; end if;
  if NEW.qty   is null or NEW.qty   <= 0 then return NEW; end if;
  if NEW.event_seq is null then return NEW; end if;

  -- 팀 folio 확보(없으면 개설) — POS ensureFolio 와 동일 규칙
  select id into v_folio from folios
    where event_seq = NEW.event_seq and subject='team' and status='open'
    order by opened_at limit 1;
  if v_folio is null then
    insert into folios(event_seq, subject, status, session_ym, created_by)
      values (NEW.event_seq, 'team', 'open', NEW.session_ym, coalesce(NEW.created_by,'system'))
      returning id into v_folio;
  end if;

  v_gross := NEW.price * NEW.qty;     -- 税込 합계(단가=최종가)
  v_net   := round(v_gross / 1.1);    -- 税抜 소계
  v_tax   := v_gross - v_net;         -- 内税(10%)
  v_desc  := '夕食'||(case NEW.kind when 'upgrade' then 'アップグレード' else '別注' end)||'）'
             ||coalesce(NEW.item,'')||'（'||to_char(NEW.order_date,'MM/DD')||'）';

  insert into charges(folio_id, event_seq, category, source, description,
    qty, unit_price, amount, tax, service_charge, member_id, link_ref, created_by)
  values (v_folio, NEW.event_seq, '식음', 'restaurant', v_desc,
    NEW.qty, NEW.price, v_net, v_tax, 0, null, v_key, coalesce(NEW.created_by,'system'));

  return NEW;
end $fn$;

drop trigger if exists trg_dinner_addon_charge on dinner_addons;
create trigger trg_dinner_addon_charge
  after insert or update or delete on dinner_addons
  for each row execute function dinner_addon_sync_charge();

-- 기존에 등록돼 있던 가격 있는 別注/업그레이드도 1회 동기화(이미 링크된 건 재계산):
do $back$
declare r record;
begin
  for r in select id from dinner_addons where kind in ('add','upgrade') and price is not null and price > 0 loop
    update dinner_addons set created_at = created_at where id = r.id;   -- no-op UPDATE → 트리거 발동
  end loop;
end $back$;
