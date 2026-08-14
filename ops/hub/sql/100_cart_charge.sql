-- ============================================================================
--  100_cart_charge.sql — 전기카트 사전신청 → 정산(charges) 자동 연동
-- ----------------------------------------------------------------------------
--  Min 결정(2026-08): 청구 시점 = **라운딩 당일** · 요금 대상 = **전기카트만**(가솔린 0).
--
--  방식(판단 위임받아 결정):
--   · 배치(스케줄러) 없이 **트리거로 즉시 생성하되, 청구일을 play_date 로 찍는다**.
--     → 御請求書·정산 화면은 날짜로 보여주므로 실질적으로 「그날 청구」가 된다.
--     → 크론이 없어도 확정적이고, 대수 수정·취소가 그 자리에서 반영된다.
--   · 금액 = **남은 신청 대수(qty) × cart_types.fee_yen**. 취소분(cancelled)은 이미 qty 에서
--     빠져 있으므로 자연히 청구에서 제외된다.
--   · charges.link_ref = 'cart:<cart_bookings.id>' 로 1:1 링크 → 수정/삭제 자동 재동기화.
--   · charges 쓰기 RLS 는 settle·pos 영역뿐이라 golf 사용자는 직접 insert 불가
--     → SECURITY DEFINER (58_dinner_addon_charge 와 같은 구조). 권한은 cart_bookings 쓰기로 게이트.
--   · B2B 정산(現地精算表)과 **무관** — 현장 추가요금이다.
--
--  멱등 재실행 가능. ⚠ Supabase SQL Editor 수동 실행. 58·93·95 이후.
-- ============================================================================

alter table charges add column if not exists link_ref text;
create index if not exists idx_charges_link_ref on charges(link_ref);

create or replace function cart_sync_charge() returns trigger
language plpgsql security definer set search_path=public as $fn$
declare
  v_folio uuid;
  v_fee   numeric;
  v_gross numeric;
  v_net   numeric;
  v_tax   numeric;
  v_key   text;
  v_ym    text;
begin
  if (TG_OP = 'DELETE') then
    delete from charges where link_ref = 'cart:'||OLD.id;
    return OLD;
  end if;

  v_key := 'cart:'||NEW.id;
  delete from charges where link_ref = v_key;      -- 재계산(단순·정확)

  -- 청구 대상: 전기카트 · 남은 대수 1 이상 · 요금 있는 종류만
  if NEW.cart_code is distinct from 'electric' then return NEW; end if;
  if NEW.qty is null or NEW.qty <= 0 then return NEW; end if;
  if NEW.event_seq is null then return NEW; end if;

  select fee_yen into v_fee from cart_types where code = NEW.cart_code;
  if v_fee is null or v_fee <= 0 then return NEW; end if;   -- 가솔린 등 무료 종류

  -- 팀 folio 확보(없으면 개설) — POS ensureFolio 와 동일 규칙
  select id into v_folio from folios
    where event_seq = NEW.event_seq and subject='team' and status='open'
    order by opened_at limit 1;
  if v_folio is null then
    select to_char(dep_date,'YYYY-MM') into v_ym from bookings where event_seq = NEW.event_seq;
    insert into folios(event_seq, subject, status, session_ym, created_by)
      values (NEW.event_seq, 'team', 'open', v_ym, coalesce(NEW.created_by,'system'))
      returning id into v_folio;
  end if;

  v_gross := v_fee * NEW.qty;        -- 税込(현장 요금표가 최종가)
  v_net   := round(v_gross / 1.1);   -- 税抜 소계
  v_tax   := v_gross - v_net;        -- 内税 10%

  insert into charges(folio_id, event_seq, category, source, description,
    qty, unit_price, amount, tax, service_charge, member_id, link_ref,
    charged_at, created_by)
  values (v_folio, NEW.event_seq, '라운딩', 'golf',
    '電動カート 事前申請（'||to_char(NEW.play_date,'MM/DD')||'）',
    NEW.qty, v_fee, v_net, v_tax, 0, null, v_key,
    -- ⚠ 청구일 = 라운딩 당일(JST 09:00 로 고정 — 날짜만 의미 있음)
    (NEW.play_date::timestamp + interval '9 hour') at time zone 'Asia/Tokyo',
    coalesce(NEW.created_by,'system'));

  return NEW;
end $fn$;

drop trigger if exists trg_cart_charge on cart_bookings;
create trigger trg_cart_charge
  after insert or update or delete on cart_bookings
  for each row execute function cart_sync_charge();

-- ── 기존 저장분 소급 반영(한 번만 필요) ─────────────────────────────────────
--   이미 들어가 있는 전기카트 신청에도 청구를 만든다. 트리거를 태우기 위해 무해한 update.
update cart_bookings set updated_at = now() where cart_code = 'electric' and qty > 0;

-- 확인용
--   select c.charged_at::date, c.description, c.qty, c.unit_price, c.amount + c.tax as gross
--     from charges c where c.link_ref like 'cart:%' order by 1 desc limit 30;
--   · 대수를 바꾸거나 취소하면 이 목록이 따라 바뀐다. 0 이 되면 사라진다.
