-- ============================================================================
--  116_cart_free_day.sql — 전기카트 요금 무료일(입국일·귀국일 라운딩)
-- ----------------------------------------------------------------------------
--  Min 규칙(2026-08):
--   · 인천출발 팀은 **입국일(첫날)에 라운딩해도 카트 무료**.
--   · 부산출발 팀은 **귀국일(마지막날) 라운딩이 무료**.
--   → 결국 **출·귀국 양쪽 날은 카트 요금을 받지 않는다**.
--
--  구현: 100_cart_charge.sql 의 cart_sync_charge() 를 교체한다.
--   play_date 가 그 팀 bookings 의 dep_date(입국일) 또는 arr_date(귀국일)와 같으면
--   청구를 만들지 않는다(기존 청구가 있으면 앞의 delete 로 사라진다).
--   ※ 카트 배정 자체는 그대로 남는다 — 대수·번호는 계속 관리하고 **요금만** 0.
--
--  멱등 재실행 가능. ⚠ Supabase SQL Editor 수동 실행. 100 이후.
-- ============================================================================

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
  v_dep   date;
  v_arr   date;
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

  select dep_date, arr_date into v_dep, v_arr from bookings where event_seq = NEW.event_seq;

  -- ⚠ 무료일 — 입국일(인천편 첫날) · 귀국일(부산편 마지막날) 라운딩은 요금을 받지 않는다.
  if NEW.play_date is not null and (NEW.play_date = v_dep or NEW.play_date = v_arr) then
    return NEW;
  end if;

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
    (NEW.play_date::timestamp + interval '9 hour') at time zone 'Asia/Tokyo',
    coalesce(NEW.created_by,'system'));

  return NEW;
end $fn$;

-- ── 기존 청구 소급 재계산(무료일 청구가 이미 들어가 있으면 사라진다) ──────────
update cart_bookings set updated_at = now() where cart_code = 'electric' and qty > 0;

-- 확인용
--   무료일에 청구가 남아 있지 않은지:
--   select c.link_ref, c.charged_at::date, b.dep_date, b.arr_date
--     from charges c join bookings b on b.event_seq = c.event_seq
--    where c.link_ref like 'cart:%'
--      and (c.charged_at at time zone 'Asia/Tokyo')::date in (b.dep_date, b.arr_date);
--   → 0건이어야 한다.
