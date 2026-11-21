-- ============================================================================
--  175_charge_line_protect.sql — 연동 청구 줄 보호(마감한 계산서의 줄 · 무효로 한 줄) + 계산서 월(session_ym) 채우기
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  무엇이 문제였나
--   전기카트 신청(cart_bookings)·석식 별주(dinner_addons)·싱글차지(transactions)는 트리거가 그 팀 계산서에
--   청구 줄을 자동으로 만든다(100·116 / 58 / 59, 세액 식은 158). 세 트리거 모두 원본 행이 저장될 때마다
--   「연동 줄을 전부 지우고 열린 계산서에 다시 만드는」 방식이라 두 가지가 틀어졌다.
--    (가) 정산 화면에서 무효로 한 줄이 지워지고, 무효가 아닌 새 줄로 되살아난다.
--    (나) 마감(closed)·결제완료(settled)한 계산서의 줄이 지워지고, 새로 열린 계산서로 옮겨 간다
--         → 받은 돈과 청구가 어긋나고, 끝난 팀이 다시 「미정산」으로 나온다.
--   금액이 그대로인 저장(카트 번호 입력·자동 확정 재저장·옛 파일의 소급용 update)에서도 일어났다.
--   덤으로, 다시 만들 때마다 줄 id 가 바뀌어 그 줄에 지정해 둔 현금/카드도 지워졌다.
--
--  어떻게 고쳤나(안1 — 원본 저장은 막지 않는다)
--   세 트리거가 공통 함수 charge_link_sync() 를 부른다. 이 함수는
--    · 닫힌 계산서(closed·settled)의 줄과 무효 줄은 읽기만 하고 고치지도 지우지도 않는다.
--    · 열린 계산서의 살아 있는 줄 하나만 제자리에서 고친다(줄 id·지정한 현금/카드가 그대로 남는다).
--    · 그 줄이 가져야 할 금액 = 원본이 지금 말하는 청구액 − 닫힌 계산서에 이미 있는 금액.
--        닫힌 계산서에 줄이 없으면 종전과 같은 한 줄 / 있으면 차액만 「…（変更差額）」 줄(줄었으면 음수 = 돌려줄 금액).
--        차액이 0 이면 열린 계산서의 줄을 지운다(종전의 「0 이면 사라짐」과 같다).
--    · 무효로 한 청구 줄이 있는 원본은 더 청구하지 않고, 무효로 한 차감 줄이 있는 원본은 더 차감하지 않는다
--      (되살아나지 않는다 — 다시 받으려면 정산 화면에서 직접 줄을 추가한다).
--    · 팀(예약·당일 손님)이 지워진 뒤에는 새 줄·새 계산서를 만들지 않는다(열린 계산서의 줄만 정리).
--    · 원본의 팀 번호가 바뀌면(번호 정정) 옛 팀의 열린 계산서에 있던 줄은 지우고 새 팀 쪽에 다시 만든다(종전 동작 그대로).
--   안2(마감한 팀은 원본 저장을 예외로 막기)를 택하지 않은 이유: 카트 관리표의 자동 확정·자동 조정은 그날 여러 팀을
--   한 문장으로 저장한다 — 한 팀이 막히면 그날 전 팀의 저장이 통째로 실패하고(화면에는 알림도 없다),
--   방배정 해제 때의 싱글차지 삭제·예약 삭제에 딸린 카트 정리(168)도 같이 막힌다.
--
--  덤: 계산서를 새로 열 때 session_ym 을 반드시 채운다 = 예약의 세션 월(bookings.session_ym, 비었으면 입국월)
--      → 당일 손님은 방문월 → 그래도 없으면 원본 행이 준 월 → 이번 달(JST).
--      싱글차지 트리거(59)는 월을 비운 채 계산서를 열어, 정산 화면(월별 조회: session_ym = 화면의 월)에 그 계산서가
--      나오지 않았다. 이미 비어 있는 계산서도 같은 규칙으로 채운다(⑥).
--
--  하지 않는 일: 이미 틀어진 과거 줄 복구 없음 · charges/folios 행 삭제 없음 · RLS·권한 영역 변경 없음 ·
--               원본 표(cart_bookings 등)를 건드려 다시 계산시키는 update 없음.
--  권한: 새 함수는 트리거 전용(public·anon·authenticated 실행 권한 회수, security definer 아님 — 부르는 트리거 함수의
--        권한으로 돈다). 트리거 함수 3종은 security definer·search_path 그대로. anon 이 실행할 수 있는 security definer 함수 수 변동 없음(15).
--  멱등. 58·59·100·116·158 이후. 100·116·58·59 의 트리거 함수 정의는 이 파일이 대체한다(트리거 자체는 그대로).
--  ⚠ 58·59·100·116 파일을 통째로 다시 실행하지 않는다 — 옛 함수로 되돌아가고, 맨 아래 소급 update 가 줄을 다시 옮긴다.
--  되돌리는 법:
--   ① (권장) 적용 직전에 세 함수의 정의를 떠 둔다 — 되돌릴 때 그 3개를 그대로 다시 실행한다.
--        select pg_get_functiondef(p.oid) from pg_proc p
--         where p.pronamespace = 'public'::regnamespace
--           and p.proname in ('cart_sync_charge','dinner_addon_sync_charge','single_charge_sync_charge');
--   ② 떠 둔 것이 없으면 116 의 cart_sync_charge · 58 의 dinner_addon_sync_charge · 59 의 single_charge_sync_charge 의
--      「create or replace function」 부분만 다시 실행한다(맨 아래 소급 update·do 블록은 실행하지 않는다).
--      ⚠ 116·58 은 세액 두 줄(v_net 줄과 v_tax 줄) 끝의 주석을 지우고 실행한다 — 주석이 남아 있으면 158 ④ 의 치환식이
--         두 줄을 찾지 못해 「세액 식을 찾지 못했다」로 멈춘다(운영에는 주석 없는 판이 들어가 있었다).
--      이어서 158 의 ④ do 블록(세액 식 치환)과 그 아래 revoke 줄을 실행한다.
--   ③ drop function public.charge_link_sync(text,bigint,integer,text,text,text,numeric,integer,uuid,timestamptz,text,text);
--   ⑥ 에서 채운 session_ym 은 되돌리지 않는다(되돌릴 이유가 없다).
-- ============================================================================

-- ── ⓪ 적용 전 검사 — 바꾸려는 세 함수의 운영 본문이 저장소 본문(116+158 · 58+158 · 59+158)과 같은 로직인가 ──
--   주석과 공백을 뺀 글자의 md5 로 비교한다(운영 본문은 주석이 빠진 채 들어가 있어 글자 그대로의 md5 는 저장소와 다르다).
--   2026-11-20 대조: 운영 cart_sync_charge(2012자) = 116 에서 주석을 빼고 무료일 주석 한 줄만 남긴 판 + 158,
--                    dinner_addon_sync_charge(1588자) = 58 에서 주석을 뺀 판 + 158 — 둘 다 아래 기대값과 맞는다.
--                    single_charge_sync_charge 는 운영 값을 받지 못해 대조하지 못했다(다르면 여기서 멈춘다).
--   다르면 멈춘다 — 운영에만 있는 로직을 이 파일이 모르고 덮어쓰지 않게.
--   (172 가 cart_sync_charge 를 고쳤다면 여기서 멈춘다 — 이 파일은 대수 0 을 「청구 0」으로 처리하므로 172 는 이 함수를 고칠 필요가 없다.)
do $chk$
declare
  r     record;
  v_src text;
  v_md5 text;
  v_cmt text := '-' || '-[^' || chr(10) || ']*';
  v_ws  text := '[ ' || chr(9) || chr(13) || chr(10) || ']+';
begin
  for r in
    select * from (values
      ('cart_sync_charge',          '1e13e7f6b324588c62d1b02de11c97af'),
      ('dinner_addon_sync_charge',  'f412e7de0180b3b5d200ffe4ba912862'),
      ('single_charge_sync_charge', 'acc86d5aff3ab16d15dbef4ba5337c09')
    ) as t(fn, want)
  loop
    select p.prosrc into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.fn and p.pronargs = 0;
    if v_src is null then
      raise notice '175: % 가 없다 — 새로 만든다', r.fn;
      continue;
    end if;
    if v_src like '%charge_link_sync(%' then
      raise notice '175: % 는 이미 175 판이다 — 같은 정의로 다시 만든다', r.fn;
      continue;
    end if;
    v_md5 := md5(regexp_replace(regexp_replace(v_src, v_cmt, '', 'g'), v_ws, '', 'g'));
    if v_md5 <> r.want then
      raise exception '175: % 의 운영 본문이 저장소 본문과 다르다(주석·공백을 뺀 md5 = %, 기대 %). pg_get_functiondef 로 뽑아 달라진 줄을 확인하고, 로직이면 이 파일의 같은 함수에 옮긴 뒤 위 기대값을 고쳐 다시 실행한다.', r.fn, v_md5, r.want;
    end if;
  end loop;
end $chk$;

-- ── ① 공통 함수 — 연동 키 하나의 청구 줄을 원본에 맞춘다 ───────────────────────────────
create or replace function public.charge_link_sync(
  p_key        text,
  p_seq        bigint,
  p_gross      integer,
  p_category   text,
  p_source     text,
  p_desc       text,
  p_qty        numeric,
  p_unit       integer,
  p_member     uuid,
  p_charged_at timestamptz,
  p_by         text,
  p_ym         text
) returns void
language plpgsql set search_path = public as $fn$
declare
  v_want   integer := coalesce(p_gross, 0);   -- 원본이 지금 말하는 청구액(税込). 청구 대상이 아니거나 원본이 지워졌으면 0
  v_live   integer;                           -- 닫힌 계산서(closed·settled)에 있는 살아 있는 줄의 합(税込)
  v_cur    integer;                           -- 열린 계산서에 있는 살아 있는 줄의 합(税込)
  v_wpos   boolean;                           -- 무효로 한 청구 줄(0 이상)이 있다
  v_wneg   boolean;                           -- 무효로 한 차감 줄(음수)이 있다
  v_x      integer;                           -- 열린 계산서의 줄이 가져야 할 금액(税込)
  v_hold   boolean := false;
  v_adj    boolean;                           -- 차액 줄인가(닫힌 계산서에 이미 줄이 있다)
  v_parent boolean := false;                  -- 팀(예약·당일 손님)이 아직 있다
  v_line   uuid;
  v_folio  uuid;
  v_ym     text;
  v_tax    integer;
  v_qty    numeric;
  v_unit   integer;
  v_desc   text;
begin
  if p_key is null then return; end if;

  -- 원본의 팀 번호가 바뀌었으면(번호 정정 등) 옛 팀의 열린 계산서에 남은 줄은 지운다 — 아래에서 새 팀 쪽에 다시 만든다(종전 동작).
  --   닫힌 계산서의 줄·무효 줄은 여기서도 그대로 둔다.
  if p_seq is not null then
    delete from charges c using folios f
     where f.id = c.folio_id and f.status = 'open'
       and c.link_ref = p_key and not coalesce(c.voided, false)
       and c.event_seq is distinct from p_seq;
  end if;

  select coalesce(sum(c.amount + c.tax + c.service_charge)
                    filter (where not coalesce(c.voided, false) and f.status <> 'open'), 0),
         coalesce(sum(c.amount + c.tax + c.service_charge)
                    filter (where not coalesce(c.voided, false) and f.status =  'open'), 0),
         coalesce(bool_or(coalesce(c.voided, false) and (c.amount + c.tax + c.service_charge) >= 0), false),
         coalesce(bool_or(coalesce(c.voided, false) and (c.amount + c.tax + c.service_charge) <  0), false)
    into v_live, v_cur, v_wpos, v_wneg
    from charges c
    join folios f on f.id = c.folio_id
   where c.link_ref = p_key;

  v_x := v_want - v_live;

  -- 무효로 한 방향으로는 새로 만들지도 늘리지도 않는다(무효 줄이 되살아나지 않게)
  if v_wpos and v_x > greatest(v_cur, 0) then v_x := greatest(v_cur, 0); v_hold := true; end if;
  if v_wneg and v_x < least(v_cur, 0)    then v_x := least(v_cur, 0);    v_hold := true; end if;
  if v_hold and v_x = v_cur then return; end if;

  -- 팀이 아직 있는가(예약 → 당일 손님). 계산서를 새로 열 때 쓸 월도 같이 구한다
  if v_x <> 0 and p_seq is not null then
    select coalesce(nullif(b.session_ym, ''), to_char(b.dep_date, 'YYYY-MM')) into v_ym
      from bookings b where b.event_seq = p_seq;
    v_parent := found;
    if not v_parent then
      select to_char(w.walk_date, 'YYYY-MM') into v_ym
        from walkins w where w.event_seq = p_seq;
      v_parent := found;
    end if;
  end if;

  -- 더 받을·돌려줄 금액이 없거나 팀이 지워졌다 → 열린 계산서의 살아 있는 줄만 지운다(닫힌 계산서·무효 줄은 그대로)
  if v_x = 0 or not v_parent then
    delete from charges c using folios f
     where f.id = c.folio_id and f.status = 'open'
       and c.link_ref = p_key and not coalesce(c.voided, false);
    return;
  end if;

  v_adj  := (v_x <> v_want);
  v_tax  := tax_included(v_x, 10);
  v_qty  := case when v_adj then 1 else coalesce(p_qty, 1) end;
  v_unit := case when v_adj then v_x else coalesce(p_unit, v_x) end;
  v_desc := case when v_adj then coalesce(p_desc, '') || '（変更差額）' else p_desc end;

  select c.id into v_line
    from charges c
    join folios f on f.id = c.folio_id
   where c.link_ref = p_key and not coalesce(c.voided, false) and f.status = 'open'
   order by c.created_at, c.id
   limit 1;

  if v_line is not null then
    -- 열린 계산서에 줄이 여럿이면(마감을 푼 경우 등) 하나로 모은다
    delete from charges c using folios f
     where f.id = c.folio_id and f.status = 'open'
       and c.link_ref = p_key and not coalesce(c.voided, false) and c.id <> v_line;
    -- 제자리 수정 — 달라진 것이 있을 때만 쓴다(줄 id·계산서·현금/카드 지정·작성자는 그대로)
    update charges c
       set qty = v_qty, unit_price = v_unit, amount = v_x - v_tax, tax = v_tax, service_charge = 0,
           description = v_desc, member_id = p_member,
           charged_at = case when v_adj or p_charged_at is null then c.charged_at else p_charged_at end
     where c.id = v_line
       and (c.qty, c.unit_price, c.amount, c.tax, c.service_charge, c.description, c.member_id, c.charged_at)
           is distinct from
           (v_qty, v_unit, v_x - v_tax, v_tax, 0, v_desc, p_member,
            case when v_adj or p_charged_at is null then c.charged_at else p_charged_at end);
    return;
  end if;

  -- 열린 계산서에 줄이 없다 → 팀의 열린 계산서를 찾거나 새로 연다(월을 반드시 채운다)
  select id into v_folio from folios
   where event_seq = p_seq and subject = 'team' and status = 'open'
   order by opened_at, id
   limit 1;
  if v_folio is null then
    insert into folios(event_seq, subject, status, session_ym, created_by)
    values (p_seq, 'team', 'open',
            coalesce(v_ym, nullif(p_ym, ''), to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM')),
            coalesce(p_by, 'system'))
    returning id into v_folio;
  end if;

  insert into charges(folio_id, event_seq, category, source, description,
    qty, unit_price, amount, tax, service_charge, member_id, link_ref, charged_at, created_by)
  values (v_folio, p_seq, p_category, p_source, v_desc,
    v_qty, v_unit, v_x - v_tax, v_tax, 0, p_member, p_key,
    case when v_adj or p_charged_at is null then now() else p_charged_at end,
    coalesce(p_by, 'system'));
end $fn$;

comment on function public.charge_link_sync(text, bigint, integer, text, text, text, numeric, integer, uuid, timestamptz, text, text) is
  '연동 청구 줄 동기화(175) — 전기카트·석식 별주·싱글차지 트리거 전용. 닫힌 계산서의 줄과 무효 줄은 손대지 않고, 열린 계산서의 줄 하나만 제자리에서 고친다(차액은 変更差額 줄).';

-- ── ② 전기카트 신청 → 청구(100·116 대체). 청구 대상 판정은 종전 그대로 ───────────────────────
create or replace function public.cart_sync_charge() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  r      record;
  v_fee  integer;
  v_dep  date;
  v_arr  date;
  v_want integer := 0;
begin
  if (TG_OP = 'DELETE') then r := OLD; else r := NEW; end if;

  -- 청구 대상: 전기카트 · 남은 대수 1 이상 · 요금 있는 종류 · 무료일(입국일·귀국일, 116) 아님. 신청이 지워졌으면 0
  if TG_OP <> 'DELETE' and r.cart_code = 'electric' and r.qty > 0 and r.event_seq is not null then
    select dep_date, arr_date into v_dep, v_arr from bookings where event_seq = r.event_seq;
    select fee_yen into v_fee from cart_types where code = r.cart_code;
    if r.play_date is not null and (r.play_date = v_dep or r.play_date = v_arr) then
      v_want := 0;
    elsif v_fee is null or v_fee <= 0 then
      v_want := 0;
    else
      v_want := v_fee * r.qty;
    end if;
  end if;

  -- 청구일 = 라운딩 당일(JST 09:00 — 날짜만 의미 있음)
  perform charge_link_sync('cart:' || r.id, r.event_seq, v_want, '라운딩', 'golf',
    '電動カート 事前申請（' || to_char(r.play_date, 'MM/DD') || '）',
    r.qty, coalesce(v_fee, 0), null,
    (r.play_date::timestamp + interval '9 hour') at time zone 'Asia/Tokyo',
    coalesce(r.created_by, 'system'), null);

  if (TG_OP = 'DELETE') then return OLD; end if;
  return NEW;
end $fn$;

-- ── ③ 석식 별주(추가·업그레이드) → 청구(58 대체) ─────────────────────────────────────
create or replace function public.dinner_addon_sync_charge() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  r      record;
  v_want integer := 0;
begin
  if (TG_OP = 'DELETE') then r := OLD; else r := NEW; end if;

  -- 청구 대상: 추가·업그레이드 · 가격 있음 · 수량 1 이상 · 팀 있음(알레르기는 주방 발주만). 별주가 지워졌으면 0
  if TG_OP <> 'DELETE' and r.kind in ('add', 'upgrade') and r.price > 0 and r.qty > 0 and r.event_seq is not null then
    v_want := r.price * r.qty;
  end if;

  perform charge_link_sync('dinner_addon:' || r.id, r.event_seq, v_want, '식음', 'restaurant',
    '夕食' || (case r.kind when 'upgrade' then 'アップグレード' else '別注' end) || '）'
      || coalesce(r.item, '') || '（' || to_char(r.order_date, 'MM/DD') || '）',
    r.qty, r.price, null, null,
    coalesce(r.created_by, 'system'), r.session_ym);

  if (TG_OP = 'DELETE') then return OLD; end if;
  return NEW;
end $fn$;

-- ── ④ 싱글차지 → 청구(59 대체) ───────────────────────────────────────────────
create or replace function public.single_charge_sync_charge() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  r      record;
  v_want integer := 0;
begin
  if (TG_OP = 'DELETE') then r := OLD; else r := NEW; end if;

  -- 청구 대상: 싱글차지 · 현장 청구(메리트 선불 아님) · 무효 아님 · 금액 있음 · 팀 있음. 거래가 지워졌으면 0
  if TG_OP <> 'DELETE' and r.category = 'single_charge' and r.settle_status is distinct from 'prepaid_merit'
     and not coalesce(r.voided, false) and r.amount > 0 and r.event_seq is not null then
    v_want := round(r.amount)::integer;
  end if;

  perform charge_link_sync('transaction:' || r.id, r.event_seq, v_want, '숙박', 'room',
    coalesce(r.description, 'シングルチャージ'), coalesce(r.qty, 1),
    coalesce(round(r.unit_price)::integer, v_want), r.member_id, null,
    coalesce(r.posted_by, 'system'), null);

  if (TG_OP = 'DELETE') then return OLD; end if;
  return NEW;
end $fn$;

-- ── ⑤ 권한 — 네 함수 모두 직접 실행 불가(트리거 전용) ─────────────────────────────────
revoke all on function public.charge_link_sync(text, bigint, integer, text, text, text, numeric, integer, uuid, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.cart_sync_charge()          from public, anon, authenticated;
revoke all on function public.dinner_addon_sync_charge()  from public, anon, authenticated;
revoke all on function public.single_charge_sync_charge() from public, anon, authenticated;

-- ── ⑥ 월(session_ym)이 빈 계산서 채우기 — 정산 화면(월별 조회)에 나오게 ──────────────────────
--   예약이 있으면 예약의 세션 월(비었으면 입국월), 당일 손님이면 방문월. 어디에도 없는 번호의 계산서는 그대로 둔다.
update public.folios f
   set session_ym = coalesce(nullif(b.session_ym, ''), to_char(b.dep_date, 'YYYY-MM'))
  from public.bookings b
 where b.event_seq = f.event_seq
   and coalesce(f.session_ym, '') = ''
   and coalesce(nullif(b.session_ym, ''), to_char(b.dep_date, 'YYYY-MM')) is not null;

update public.folios f
   set session_ym = to_char(w.walk_date, 'YYYY-MM')
  from public.walkins w
 where w.event_seq = f.event_seq
   and coalesce(f.session_ym, '') = '';

-- ── 확인용(읽기만) ───────────────────────────────────────────────────────
--   select proname, prosecdef, proconfig from pg_proc
--    where proname in ('charge_link_sync','cart_sync_charge','dinner_addon_sync_charge','single_charge_sync_charge');
--   select count(*) from folios where coalesce(session_ym,'') = '';        -- 0 (예약·당일 손님이 없는 번호만 남는다)
--   연동 키 하나에 줄이 둘 이상인 것(차액 줄이 생긴 원본) 보기:
--   select link_ref, count(*), sum(amount + tax + service_charge) as gross
--     from charges where link_ref ~ '^(cart|dinner_addon|transaction):' group by 1 having count(*) > 1;
