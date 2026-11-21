-- ============================================================================
--  180_pos_submit_order.sql — POS 주문을 한 번에 저장하고, 같은 전송은 두 번 넣지 않는다
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  무엇이 문제였나
--   pos.html 의 [주문 전송](sendCart)은 화면이 요청을 여러 번 나눠 보냈다:
--     계산서 확인·새로 열기(folios) → 청구 줄 넣기(charges, 여러 줄을 한 요청) → 주방·바 티켓 넣기(kitchen_tickets, 따로 한 요청).
--    (가) 청구가 들어간 뒤 응답만 못 받으면(와이파이 끊김·태블릿 잠김) 화면은 「전송 실패 — 다시 누르세요」라 하고
--         장바구니를 남긴다 → 다시 누르면 같은 주문이 두 번 청구되고 주방에도 두 번 나간다.
--    (나) 청구와 티켓이 따로라, 티켓만 실패하면 「청구는 됐는데 주방은 모르는」 주문이 생긴다.
--    (다) 계산서를 화면이 찾고 열어서, 두 단말이 같은 팀을 거의 동시에 보내면 열린 팀 계산서가 둘 생길 수 있다.
--
--  어떻게 고쳤나 — 새 RPC pos_submit_order(...) 하나가 한 트랜잭션에서 한다(하나라도 실패하면 아무것도 남지 않는다)
--    ① 권한 · 입력 검사(팀(예약·당일 손님)이 있는가 · 고른 사람이 그 팀 명단인가 · 수량·단가 범위 · 전송처 · 청구 구분)
--    ② 주문 키 — 화면이 전송마다 만든 uuid. 같은 키가 두 번 오면 넣지 않고 처음 결과를 돌려준다(duplicate = true).
--       같은 키에 다른 내용(팀·지불 방식·사람·줄)이 오면 거부한다(pos_order_key_mismatch — 화면 버그 방어).
--    ③ 계산서 — 서버가 상태를 다시 본다(19차 화면 검사와 같은 뜻): 열린(open) 계산서만 쓴다. 마감(closed)·결제완료(settled)면
--       열린 계산서를 찾고 없으면 새로 연다. 새로 열 때 월(session_ym) = 175 와 같은 규칙
--       (예약의 세션 월 → 비었으면 입국월 → 당일 손님은 방문월 → 화면이 준 월 → 이번 달 JST).
--       같은 팀의 계산서 확인·개설은 팀 번호 잠금(pg_advisory_xact_lock)으로 한 줄로 세운다(이 함수끼리).
--    ④ 청구 줄 — pos.html 과 같은 식: 税込 = 단가 × 수량, 세액 = tax_included(税込, 세율)(158, 버림 — SZCore.taxIncluded 와 같은 값),
--       세율·구분은 SZCore.taxKey 와 같은 정규화(비과세·불과세 → 0% · 과세는 10·8 만 · 과세 0% → 비과세), tax_rate·tax_class 열에 복사.
--       개인 N분의1 = 1엔 단위로 나누고 잔돈은 보낸 순서의 앞사람부터 +1엔, 설명 끝 「 (1/N)」 · 한 사람이면 수량 그대로.
--       link_ref = 'menu:<메뉴 id>'(오늘 주문 목록이 전송처를 되짚는 키 — 종전 그대로).
--    ⑤ 주방·바 티켓 — station 이 kitchen·bar 인 줄만, 수량은 나누지 않은 전체(종전 그대로).
--       티켓의 계산서 칸 = 열린 팀 계산서(개인 지정이라 팀 계산서가 없으면 비움 — 종전 화면과 같은 값).
--
--  주문 키를 어디에 두나 — 새 작은 표 pos_order_keys 를 택했다
--    · 새 표(택함): 키가 기본키라 같은 키가 동시에 두 번 와도 데이터베이스가 하나만 받는다(두 번째는 첫 번째가 끝날 때까지
--      기다렸다가 처음 결과를 받는다). 처음 결과(청구 줄 수·티켓 수·금액·계산서)를 그대로 저장해 돌려준다. 청구 줄을 무효로 하거나
--      계산서를 지워도 키는 남아 다시 들어가지 않는다. 대신 표가 하나 늘고 정리가 필요하다(아래).
--    · charges.source_ref(택하지 않음): 한 주문 = 여러 줄이라 고유 제약을 걸 수 없어 동시 전송을 따로 잠가야 하고,
--      티켓 수·처음 결과를 되살릴 수 없다. 계산서가 지워지면(on delete cascade) 키도 사라져 다시 들어간다.
--      source_ref 는 「서브시스템 행 id」 칸이라 뜻이 섞인다.
--    RLS: 켜고 정책을 두지 않는다 + public·anon·authenticated 표 권한 회수 — 화면은 이 표를 직접 읽거나 쓰지 않는다(함수만 쓴다).
--    정리: 함수가 새 주문을 받을 때마다 30일 지난 키를 지운다(장바구니는 그날 날짜에서만 되살아나 그보다 늦은 재전송은 없다).
--
--  권한 = is_admin() or has_any_area(array['pos'])  (참·거짓 — 행이 없으면 false, 차단 계정(active=false)은 has_any_area 가 false)
--    지금 RLS: 청구(charges·folios) 쓰기 = settle·pos / 티켓(kitchen_tickets) 쓰기 = pos·kitchen.
--    한 번의 전송이 둘 다 해야 하므로 두 선이 겹치는 pos 로 정했다(자식 키 pos_front·pos_golf·pos_restaurant·pos_customer 도
--    area_expand 로 통과 — 138). 정산(settle)만 가진 계정은 지금도 청구만 들어가고 티켓은 실패하던 계정이다.
--  하지 않는 일: RLS 정책 변경 없음(화면의 옛 직접 쓰기 길은 SQL 적용 전 폴백으로 남는다) · 기존 청구·계산서·티켓 변경 없음 ·
--               메뉴 가격 다시 읽기 없음(그 자리에서 넣는 「기타」 금액이 있어 종전처럼 화면이 보낸 단가) · 손님 화면 변경 없음.
--  anon 이 실행할 수 있는 security definer 함수 수 변동 없음(15) — 새 함수는 로그인 사용자만.
--  트리거: charges·kitchen_tickets 의 audit_row 는 그대로 돈다(auth.uid() 는 부른 사람 — JWT 가 같다).
--  멱등(다시 실행해도 같은 결과 · 같은 이름의 다른 인자 판이 있으면 지운다). 138·158·175 이후.
--  되돌리는 법:
--    drop function if exists public.pos_submit_order(uuid, bigint, text, uuid[], jsonb, text, text, text);
--    drop table if exists public.pos_order_keys;
--    → pos.html 은 함수가 없으면(PGRST202·42883) 옛 직접 쓰기로 저절로 돌아간다(화면 되돌림 불필요).
-- ============================================================================

-- ── ① 주문 키 표 ─────────────────────────────────────────────────────────────
create table if not exists public.pos_order_keys (
  order_key   uuid        primary key,              -- 화면이 전송마다 만든 키
  event_seq   bigint      not null,                 -- 그 주문의 팀 번호
  payload_md5 text        not null,                 -- 보낸 내용(팀·지불 방식·사람·줄)의 md5 — 같은 키에 다른 내용이면 거부
  result      jsonb,                                -- 처음 결과(같은 키가 다시 오면 이것을 돌려준다)
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_pos_order_keys_created on public.pos_order_keys(created_at);
alter table public.pos_order_keys enable row level security;   -- 정책 없음 = 화면에서 직접 읽기·쓰기 불가(함수만)
revoke all on table public.pos_order_keys from public, anon, authenticated;
comment on table public.pos_order_keys is
  'POS 주문 키(180) — pos_submit_order 가 같은 전송을 두 번 넣지 않게 기록한다. RLS 켜짐·정책 없음(함수 전용). 30일 지난 행은 함수가 지운다.';

-- ── ② 같은 이름의 다른 인자 판 정리(초안·옛 판이 남아 있으면 PostgREST 가 어느 것을 부를지 헷갈린다) ─────────
do $drop$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = 'pos_submit_order'
       and p.oid is distinct from to_regprocedure('public.pos_submit_order(uuid,bigint,text,uuid[],jsonb,text,text,text)')::oid
  loop
    raise notice '180: 같은 이름의 다른 인자 판 % 를 지운다', r.sig;
    execute 'drop function ' || r.sig;
  end loop;
end $drop$;

-- ── ③ 주문 전송 RPC ───────────────────────────────────────────────────────────
--   p_lines = [{menu_id, category, source, station, name, qty, unit_price, tax_rate, tax_class}, …] (pos.html 장바구니 줄)
--   p_mode  = 'team'(팀 공통) | 'split'(개인 지정 — p_payers 순서대로 나눈다)
--   반환    = {ok, order_key, event_seq, mode, team_folio, member_folios{사람 id: 계산서 id}, charges, tickets, total, duplicate}
create or replace function public.pos_submit_order(
  p_key      uuid,
  p_seq      bigint,
  p_mode     text,
  p_payers   uuid[],
  p_lines    jsonb,
  p_team_tag text default null,
  p_ym       text default null,
  p_by       text default null
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_claims  jsonb;
  v_by      text;
  v_k       integer := 0;
  v_md5     text;
  v_prev    record;
  v_ym      text;
  v_found   boolean;
  v_team    uuid;
  v_mf      jsonb := '{}'::jsonb;
  v_fid     uuid;
  v_mid     uuid;
  v_i       integer;
  v_l       jsonb;
  v_name    text;
  v_qty     integer;
  v_unit    integer;
  v_gross   integer;
  v_cls     text;
  v_rate    integer;
  v_station text;
  v_cat     text;
  v_src     text;
  v_link    text;
  v_desc    text;
  v_base    integer;
  v_rem     integer;
  v_share   integer;
  v_tax     integer;
  v_nc      integer := 0;
  v_nt      integer := 0;
  v_total   integer := 0;
  v_result  jsonb;
begin
  -- 권한 — 참·거짓으로 판정(청구 settle·pos 와 티켓 pos·kitchen 이 겹치는 pos)
  if not (coalesce(is_admin(), false) or coalesce(has_any_area(array['pos']), false)) then
    raise exception 'pos_submit_order: 권한 없음 — POS 권한이 필요합니다' using errcode = '42501';
  end if;

  -- 입력 검사
  if p_key is null then
    raise exception 'pos_submit_order: 주문 키가 없다' using errcode = '22023';
  end if;
  if p_seq is null or p_seq < 1 or p_seq > 2147483647 then
    raise exception 'pos_submit_order: 팀 번호가 잘못됐다(%)', p_seq using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('team', 'split') then
    raise exception 'pos_submit_order: 지불 방식은 team·split 중 하나(%)', p_mode using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'pos_submit_order: 주문 줄이 없다(배열이 아니다)' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) not between 1 and 200 then
    raise exception 'pos_submit_order: 주문 줄이 없다(1~200줄)' using errcode = '22023';
  end if;

  -- 팀이 있는가(예약 → 당일 손님) + 계산서를 새로 열 때 쓸 월(175 와 같은 규칙)
  select coalesce(nullif(b.session_ym, ''), to_char(b.dep_date, 'YYYY-MM')) into v_ym
    from bookings b where b.event_seq = p_seq;
  v_found := found;
  if not v_found then
    select to_char(w.walk_date, 'YYYY-MM') into v_ym
      from walkins w where w.event_seq = p_seq;
    v_found := found;
  end if;
  if not v_found then
    raise exception 'pos_submit_order: 팀 %(예약·당일 손님)이 없다', p_seq using errcode = '22023';
  end if;
  v_ym := coalesce(v_ym,
                   case when p_ym ~ '^[0-9]{4}-[0-9]{2}$' then p_ym end,
                   to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM'));

  -- 개인 지정: 1~60명 · 겹침 없음 · 모두 그 팀 명단
  if p_mode = 'split' then
    v_k := coalesce(array_length(p_payers, 1), 0);
    if v_k not between 1 and 60 then
      raise exception 'pos_submit_order: 지불할 사람을 1~60명 고른다(%명)', v_k using errcode = '22023';
    end if;
    if (select count(distinct u.x) from unnest(p_payers) as u(x)) <> v_k then
      raise exception 'pos_submit_order: 지불할 사람이 겹치거나 비었다' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(p_payers) as u(x)
                where not exists (select 1 from guest_members gm where gm.id = u.x and gm.event_seq = p_seq)) then
      raise exception 'pos_submit_order: 지불할 사람이 팀 % 명단에 없다', p_seq using errcode = '22023';
    end if;
  end if;

  -- 작성자 = 화면이 준 이름 → 로그인 이름 → 이메일 → 'pos'
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_by := left(coalesce(nullif(btrim(p_by), ''),
                        nullif(v_claims -> 'user_metadata' ->> 'name', ''),
                        nullif(v_claims ->> 'email', ''),
                        'pos'), 100);

  -- 주문 키 — 같은 키는 한 번만(동시에 두 번 오면 두 번째는 첫 번째가 끝날 때까지 기다린다)
  v_md5 := md5(jsonb_build_object(
             'seq',    p_seq,
             'mode',   p_mode,
             'payers', case when p_mode = 'split' then to_jsonb(p_payers) else '[]'::jsonb end,
             'lines',  p_lines)::text);
  insert into pos_order_keys(order_key, event_seq, payload_md5, created_by)
  values (p_key, p_seq, v_md5, v_by)
  on conflict (order_key) do nothing;
  if not found then
    select k.event_seq, k.payload_md5, k.result into v_prev
      from pos_order_keys k where k.order_key = p_key;
    if v_prev.event_seq is distinct from p_seq or v_prev.payload_md5 is distinct from v_md5 or v_prev.result is null then
      raise exception 'pos_submit_order: 같은 주문 키로 다른 주문이 왔다(pos_order_key_mismatch) — 장바구니를 확인하고 다시 보낸다'
        using errcode = '22023';
    end if;
    return v_prev.result || jsonb_build_object('duplicate', true);
  end if;
  delete from pos_order_keys where created_at < now() - interval '30 days';   -- 정리(30일)

  -- 계산서 — 같은 팀은 한 줄로 세운다(이 함수끼리). 열린(open) 것만 쓴다
  perform pg_advisory_xact_lock(180, hashtext(p_seq::text));

  select f.id into v_team
    from folios f
   where f.event_seq = p_seq and f.subject = 'team' and f.status = 'open'
   order by f.opened_at, f.id
   limit 1;
  if v_team is null and p_mode = 'team' then
    insert into folios(event_seq, subject, status, session_ym, created_by)
    values (p_seq, 'team', 'open', v_ym, v_by)
    returning id into v_team;
  end if;

  if p_mode = 'split' then
    for v_i in 1 .. v_k loop
      v_mid := p_payers[v_i];
      v_fid := null;
      select f.id into v_fid
        from folios f
       where f.event_seq = p_seq and f.subject = 'member' and f.member_id = v_mid and f.status = 'open'
       order by f.opened_at, f.id
       limit 1;
      if v_fid is null then
        insert into folios(event_seq, subject, member_id, status, session_ym, created_by)
        values (p_seq, 'member', v_mid, 'open', v_ym, v_by)
        returning id into v_fid;
      end if;
      v_mf := v_mf || jsonb_build_object(v_mid::text, v_fid);
    end loop;
  end if;

  -- 줄마다: 청구(팀 1줄 / 한 사람 1줄 / N명 N줄) + 주방·바 티켓(전체 수량 1장)
  for v_l in select e.value from jsonb_array_elements(p_lines) as e(value) loop
    if jsonb_typeof(v_l) <> 'object' then
      raise exception 'pos_submit_order: 주문 줄 모양이 잘못됐다' using errcode = '22023';
    end if;
    v_name := btrim(coalesce(v_l ->> 'name', ''));
    if v_name = '' or length(v_name) > 200 then
      raise exception 'pos_submit_order: 품목 이름이 비었거나 너무 길다' using errcode = '22023';
    end if;
    if coalesce(v_l ->> 'qty', '') !~ '^[0-9]{1,3}$' then
      raise exception 'pos_submit_order: 수량이 잘못됐다(%)', v_l ->> 'qty' using errcode = '22023';
    end if;
    v_qty := (v_l ->> 'qty')::integer;
    if coalesce(v_l ->> 'unit_price', '') !~ '^[0-9]{1,8}$' then
      raise exception 'pos_submit_order: 단가가 잘못됐다(%)', v_l ->> 'unit_price' using errcode = '22023';
    end if;
    v_unit := (v_l ->> 'unit_price')::integer;
    if v_qty < 1 or v_unit < 1 or v_unit::bigint * v_qty > 10000000 then
      raise exception 'pos_submit_order: 수량·단가 범위 밖(수량 1~999 · 단가 1엔 이상 · 한 줄 1천만 엔 이하)' using errcode = '22023';
    end if;
    v_gross := v_unit * v_qty;
    v_station := v_l ->> 'station';
    if v_station is null or v_station not in ('kitchen', 'bar', 'none') then
      raise exception 'pos_submit_order: 전송처(station)는 kitchen·bar·none 중 하나(%)', v_station using errcode = '22023';
    end if;
    v_cat := nullif(btrim(coalesce(v_l ->> 'category', '')), '');
    if v_cat is null then
      raise exception 'pos_submit_order: 청구 구분(category)이 없다' using errcode = '22023';
    end if;
    v_src  := coalesce(nullif(btrim(coalesce(v_l ->> 'source', '')), ''), 'etc');
    v_link := case when nullif(btrim(coalesce(v_l ->> 'menu_id', '')), '') is null then null
                   else 'menu:' || btrim(v_l ->> 'menu_id') end;
    -- 세율·구분 정규화 — SZCore.taxKey 와 같은 규칙
    v_cls  := case when v_l ->> 'tax_class' in ('exempt', 'outside') then v_l ->> 'tax_class' else 'taxable' end;
    v_rate := case when coalesce(v_l ->> 'tax_rate', '') ~ '^[0-9]{1,3}$' then (v_l ->> 'tax_rate')::integer else 10 end;
    if v_cls <> 'taxable' then
      v_rate := 0;
    elsif v_rate not in (8, 10) then
      v_rate := case when v_rate = 0 then 0 else 10 end;
    end if;
    if v_cls = 'taxable' and v_rate = 0 then v_cls := 'exempt'; end if;
    v_desc := v_name || case when v_qty > 1 then ' ×' || v_qty else '' end;

    if p_mode = 'team' or v_k = 1 then
      if p_mode = 'team' then
        v_fid := v_team;  v_mid := null;
      else
        v_mid := p_payers[1];  v_fid := (v_mf ->> (v_mid::text))::uuid;
      end if;
      v_tax := tax_included(v_gross, v_rate);
      insert into charges(folio_id, event_seq, member_id, category, source, description,
                          qty, unit_price, amount, tax, tax_rate, tax_class, service_charge, link_ref, created_by)
      values (v_fid, p_seq, v_mid, v_cat, v_src, v_desc,
              v_qty, v_unit, v_gross - v_tax, v_tax, v_rate, v_cls, 0, v_link, v_by);
      v_nc    := v_nc + 1;
      v_total := v_total + v_gross;
    else
      v_base := v_gross / v_k;              -- 양수 정수 나눗셈 = 버림(JS Math.floor 와 같다)
      v_rem  := v_gross - v_base * v_k;     -- 잔돈은 앞사람부터 +1엔
      for v_i in 1 .. v_k loop
        v_share := v_base + case when v_i <= v_rem then 1 else 0 end;
        continue when v_share <= 0;
        v_mid := p_payers[v_i];
        v_fid := (v_mf ->> (v_mid::text))::uuid;
        v_tax := tax_included(v_share, v_rate);
        insert into charges(folio_id, event_seq, member_id, category, source, description,
                            qty, unit_price, amount, tax, tax_rate, tax_class, service_charge, link_ref, created_by)
        values (v_fid, p_seq, v_mid, v_cat, v_src, v_desc || ' (1/' || v_k || ')',
                1, v_share, v_share - v_tax, v_tax, v_rate, v_cls, 0, v_link, v_by);
        v_nc    := v_nc + 1;
        v_total := v_total + v_share;
      end loop;
    end if;

    if v_station in ('kitchen', 'bar') then
      insert into kitchen_tickets(folio_id, event_seq, team_tag, station, item_name, qty, created_by)
      values (v_team, p_seq, nullif(btrim(coalesce(p_team_tag, '')), ''), v_station, v_name, v_qty, v_by);
      v_nt := v_nt + 1;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'ok', true, 'order_key', p_key, 'event_seq', p_seq, 'mode', p_mode,
    'team_folio', v_team, 'member_folios', v_mf,
    'charges', v_nc, 'tickets', v_nt, 'total', v_total);
  update pos_order_keys set result = v_result where order_key = p_key;
  return v_result || jsonb_build_object('duplicate', false);
end $fn$;

comment on function public.pos_submit_order(uuid, bigint, text, uuid[], jsonb, text, text, text) is
  'POS 주문 전송(180) — 열린 계산서 확인·개설 + 청구 줄(tax_included·N분의1) + 주방·바 티켓을 한 트랜잭션. 같은 주문 키는 한 번만 넣고 처음 결과를 돌려준다(pos_order_keys). 권한 admin 또는 pos.';

-- ── ④ 권한 — 로그인 사용자만(anon 불가) ─────────────────────────────────────────
revoke all on function public.pos_submit_order(uuid, bigint, text, uuid[], jsonb, text, text, text) from public, anon;
grant execute on function public.pos_submit_order(uuid, bigint, text, uuid[], jsonb, text, text, text) to authenticated;

-- ── 확인용(읽기만) ───────────────────────────────────────────────────────
--   select proname, prosecdef, proconfig from pg_proc where proname = 'pos_submit_order';            -- 1행 · t · {search_path=public}
--   select has_function_privilege('anon', 'public.pos_submit_order(uuid,bigint,text,uuid[],jsonb,text,text,text)', 'execute');   -- f
--   select count(*), max(created_at) from pos_order_keys;                                             -- 받은 주문 수(30일)
--   같은 키가 두 번 온 적이 있는지는 남지 않는다(두 번째는 아무것도 쓰지 않는다).
