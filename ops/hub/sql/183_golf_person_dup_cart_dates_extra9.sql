-- ============================================================================
--  183_golf_person_dup_cart_dates_extra9.sql — 골프 세 가지: 같은 사람 두 조 검수 · 입국·귀국일이 바뀌면 카트 요금 다시 계산 · [9홀 추가] 중복 청구 확인
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  무엇을·왜
--   ① data_audit() 에 「같은 사람이 같은 날 두 조」(golf_two_groups, 오류) 항목을 붙인다(§3-3 검수 짝).
--      golf_dup(143)은 「조원 집합이 같은 조가 두 번」·「같은 자리에 두 조」만 본다 — 한 사람이 조원 구성이 다른 두 조에
--      들어간 경우는 잡지 못했다. 그러면 인쇄물·손님 화면에 이름이 두 번 나오고 인원도 두 번 센다.
--      기준 = golf_group_members(조원 1행 = 1명)의 member_id 가 같은 play_date 에 서로 다른 조 2개 이상 · play_date >= 오늘(JST)−7.
--      조원 칸이 빈 행(member_id 없음)은 세지 않는다. 표본 = 날짜 · 개인 태그 · 조 수 · 조 자리(코스#슬롯 시각) — 이름은 넣지 않는다.
--      (조 하나가 통째로 두 번 저장된 경우는 golf_dup 과 이 항목에 같이 나온다 — 고치면 둘 다 0.)
--   ② 예약의 입국일(dep_date)·귀국일(arr_date)이 바뀌면 그 팀의 전기카트 청구를 다시 계산한다.
--      cart_sync_charge(116·175)는 「입국일·귀국일 라운딩 = 무료」를 cart_bookings 행이 저장될 때만 판정한다 →
--      예약 날짜가 나중에 바뀌면(데이터 등록 재적재·수기 정정) 무료였던 날이 유료가 되거나 그 반대여도 청구가 그대로 남았다.
--      bookings AFTER UPDATE OF dep_date, arr_date 트리거(날짜가 실제로 바뀐 행만 — WHEN 절)가 그 팀의 전기카트 신청 중
--      옛·새 입국일·귀국일에 해당하는 날짜의 행만 무해하게 갱신(set qty = qty — 바뀌는 값은 updated_at 뿐)해 cart_sync_charge 를 다시 돌린다.
--      다른 날짜의 행·전기카트가 아닌 행은 건드리지 않는다(무료일 판정이 달라질 수 없다).
--      트리거 함수는 security definer — 예약을 고치는 계정(데이터 등록 등)에 cart_bookings 쓰기 권한(golf)이 없어도 돈다.
--      마감 계산서 보호(175)는 그대로다 — 청구 줄은 charge_link_sync 만 고치므로 닫힌 계산서(closed·settled)의 줄·무효 줄은
--      손대지 않고, 닫힌 계산서에 이미 있는 금액과의 차액만 열린 계산서에 「（変更差額）」 줄로 낸다(무료가 되면 음수 = 돌려줄 금액).
--      (175 머리말의 「원본 표를 건드려 다시 계산시키는 update 없음」은 175 파일 자체의 일이다. 이 트리거는 날짜가 바뀐 팀·그 날짜의 행만 건드린다.
--       183 적용 전에 이미 날짜가 바뀐 팀의 어긋난 청구는 이 파일이 고치지 않는다 — 아래 「적용 뒤 확인」의 카트 대조로 찾고, 고칠지는 Min 승인.)
--   ③ [9홀 추가] 중복 청구 확인: 코스 배정표(course.html)가 golf_add_charge 를 부르기 전에 그 팀·그날 이미 9홀 추가 청구가 있는지 묻는다.
--      golf 권한은 charges 를 읽지 못하므로(읽기 RLS = settle·pos·front) 좁은 RPC golf_extra_count(p_seq, p_date) 를 둔다 —
--      돌려주는 것 = {lines: 그 팀 그날 9홀 추가 줄 수, players: 인원 합(qty), gross: 금액 합(税込)} 뿐. 다른 팀·줄별 상세 없음.
--      세는 키 = course.html 이 golf_add_charge 에 넘기는 p_link 'golf9:<YYYY-MM-DD>:<조 id>' 의 앞부분 'golf9:<날짜>:'.
--      무효 줄은 빼고, 닫힌 계산서의 줄은 센다(이미 청구된 것이므로). 프론트 POS 에서 직접 넣은 9홀 요금(link_ref 없음)은 세지 않는다.
--      권한 = golf_add_charge 와 같은 선(마스터 또는 golf·front·settle·pos — 자식 키 포함, 차단 계정 불가 — 138).
--   덤) golf_add_charge 전문 재정의(⓪ 검사 뒤): 권한 확인을 coalesce 로(반드시 참·거짓) · 계산서를 새로 열 때 session_ym 을 175 규칙
--      (예약의 세션 월 → 비었으면 입국월 → 당일 손님 방문월 → 이번 달 JST)으로. 종전에는 입국월만 넣어, 세션 월이 입국월과 다른
--      예약은 정산 화면의 월이 어긋났고 예약이 없는 번호(당일 손님 등)는 월이 비어 월별 정산 화면에 그 계산서가 나오지 않았다.
--      그 밖의 로직(계산서 찾기·금액 검사·세액 tax_included·줄 내용·작성자)은 그대로다.
--
--  권한: golf_extra_count = 로그인 사용자만(public·anon 회수). cart_dates_resync = 트리거 전용(public·anon·authenticated 회수).
--        golf_add_charge 권한 그대로(authenticated). data_audit 권한 그대로(로그인만 실행, 본문이 마스터 확인).
--        anon 이 실행할 수 있는 security definer 함수 수 변동 없음(15).
--  실행 순서: 멈출 수 있는 쪽을 먼저 — ⓪ golf_add_charge 본문 검사 → ① data_audit 치환(끝 앵커가 정확히 1번이 아니면 멈춤) → ②③ → 덤.
--             MCP apply_migration 은 한 트랜잭션이라 어디서 멈추면 아무것도 바뀌지 않는다.
--  멱등(⓪ 은 이미 183 판이면 통과 · ① 은 이미 있으면 건너뜀 · create or replace · drop trigger if exists). 00_VERIFY 183(3줄).
--  이 파일이 146·158 의 golf_add_charge 정의를 대체한다(146 머리말에 「golf_add_charge 는 183 이 대체」 한 줄 제안 — 146 을 통째로 다시
--  실행하면 옛 판으로 돌아간다).
--
--  적용 전 확인(읽기 전용)
--   select (length(d) - length(replace(d, E'  return res;\nend $function$', ''))) / length(E'  return res;\nend $function$') as n_end,
--          d like '%''golf_two_groups''%' as already,
--          d ~ '\mgm\s+(record|jsonb|text|int|integer|bigint|date|uuid|numeric)\M' as gm_var
--     from (select pg_get_functiondef('public.data_audit()'::regprocedure) d) x;            -- 1 · f · f
--   (별칭 g·m·t·s 는 143·160 블록이 같은 함수에서 이미 쓴다. gm 이 레코드 변수 이름이면 함수는 만들어져도 실행 때 오류 — gm_var 로 확인.)
--   select md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '[ \t\r\n]+', '', 'g')), length(prosrc)
--     from pg_proc where oid = 'public.golf_add_charge(bigint,text,integer,integer,text)'::regprocedure;
--     -- 4acfcc918254442f8ab375f4cb6557d5 · 1396 (2026-11-21 운영 본문 = 146 + 158 세액 치환)
--
--  되돌리는 법
--   ① data_audit: 적용 직전 select pg_get_functiondef('public.data_audit()'::regprocedure); 결과를 보관해 두었다가 그대로 실행한 뒤
--        revoke all on function public.data_audit() from public, anon;
--        grant execute on function public.data_audit() to authenticated;
--   ② drop trigger if exists trg_cart_dates_bookings on public.bookings;
--      drop function if exists public.cart_dates_resync();
--      (이미 다시 계산된 청구 줄은 그대로 둔다 — 원래 맞아야 했던 금액이다)
--   ③ drop function if exists public.golf_extra_count(bigint, date);
--      golf_add_charge: 적용 직전 pg_get_functiondef 로 떠 둔 정의(146 + 158, 운영 1,396자)를 다시 실행한 뒤
--        revoke all on function public.golf_add_charge(bigint, text, integer, integer, text) from public, anon;
--        grant execute on function public.golf_add_charge(bigint, text, integer, integer, text) to authenticated;
--   화면(course.html)은 golf_extra_count 가 없으면(PGRST202·42883) 묻지 않고 종전대로 돈다 — 되돌려도 화면을 고칠 필요 없다.
--
--  적용 뒤 확인
--   · 00_VERIFY 183 세 줄 · 데이터 검수 화면 [재검수] 한 번(오류 없이 돌고 「같은 사람이 같은 날 두 조」 카드가 나오는지)
--   · select tgname, tgenabled from pg_trigger where tgrelid = 'public.bookings'::regclass and not tgisinternal order by 1;
--       -- trg_bookings_updated · trg_cart_dates_bookings · trg_golf_cleanup_bookings · trg_ot_cleanup_bookings
--   · select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'execute');   -- 15 (불변)
--   · §3-3 다른 모양으로 다시 세기(읽기만) — [재검수] 「같은 사람이 같은 날 두 조」 건수와 같아야 한다(자기 결합으로 센다):
--       select count(*) from (select distinct m1.member_id, g1.play_date
--           from golf_group_members m1 join golf_groups g1 on g1.id = m1.group_id
--           join golf_group_members m2 on m2.member_id = m1.member_id and m2.group_id <> m1.group_id
--           join golf_groups g2 on g2.id = m2.group_id and g2.play_date = g1.play_date
--          where g1.play_date >= (now() at time zone 'Asia/Tokyo')::date - 7) x;
--   · 9홀 추가 확인 대조(마스터로, 표본 팀 하나): golf_extra_count(<팀>, '<YYYY-MM-DD>') 의 lines·players =
--       select count(*), coalesce(sum(qty), 0) from charges
--        where event_seq = <팀> and link_ref like 'golf9:<YYYY-MM-DD>:%' and not coalesce(voided, false);
--   · 카트 무료일 대조(읽기만 — 0행이어야. 나오면 183 전에 날짜가 바뀐 팀이다. 무효로 한 줄이 있는 신청은 175 규칙상 빼고 본다):
--       select cb.event_seq, cb.play_date, cb.qty,
--              coalesce(sum(c.amount + c.tax + c.service_charge) filter (where not coalesce(c.voided, false)), 0) as net,
--              cb.play_date in (b.dep_date, b.arr_date) as free_day
--         from cart_bookings cb join bookings b on b.event_seq = cb.event_seq
--         join cart_types t on t.code = cb.cart_code
--         left join charges c on c.link_ref = 'cart:' || cb.id
--        where cb.cart_code = 'electric' and cb.qty > 0 and cb.play_date >= (now() at time zone 'Asia/Tokyo')::date - 30
--        group by cb.id, cb.event_seq, cb.play_date, cb.qty, b.dep_date, b.arr_date, t.fee_yen
--       having coalesce(bool_or(coalesce(c.voided, false)), false) = false
--          and coalesce(sum(c.amount + c.tax + c.service_charge) filter (where not coalesce(c.voided, false)), 0)
--              <> case when cb.play_date in (b.dep_date, b.arr_date) or coalesce(t.fee_yen, 0) <= 0 then 0 else t.fee_yen * cb.qty end;
--     (선택 · Min 승인 뒤에만) 위에 나온 팀만 다시 계산 — 마감 계산서 보호(175)는 그대로 지켜진다:
--       update cart_bookings c set qty = c.qty where c.cart_code = 'electric' and c.event_seq in (<팀 번호들>);
-- ============================================================================

-- ── ⓪ 적용 전 검사 — golf_add_charge 운영 본문이 146+158 판(2026-11-21 대조)과 같은 로직인가 ─────────────
--   주석과 공백을 뺀 글자의 md5 로 비교한다(175 와 같은 식). 다르면 멈춘다 — 운영에만 있는 로직을 모르고 덮어쓰지 않게.
do $chk$
declare
  v_src  text;
  v_md5  text;
  v_cmt  text := '-' || '-[^' || chr(10) || ']*';
  v_ws   text := '[ ' || chr(9) || chr(13) || chr(10) || ']+';
  v_want constant text := '4acfcc918254442f8ab375f4cb6557d5';
begin
  select p.prosrc into v_src
    from pg_proc p
   where p.oid = to_regprocedure('public.golf_add_charge(bigint,text,integer,integer,text)');
  if v_src is null then
    raise exception '183: golf_add_charge(bigint,text,integer,integer,text) 가 없다 — 146·158 부터 적용';
  end if;
  if v_src like '%from walkins w where w.event_seq = p_seq%' then
    raise notice '183: golf_add_charge 는 이미 183 판이다 — 같은 정의로 다시 만든다';
    return;
  end if;
  v_md5 := md5(regexp_replace(regexp_replace(v_src, v_cmt, '', 'g'), v_ws, '', 'g'));
  if v_md5 <> v_want then
    raise exception '183: golf_add_charge 의 운영 본문이 146+158 판과 다르다(주석·공백을 뺀 md5 = %, 기대 %). pg_get_functiondef 로 뽑아 달라진 줄을 이 파일의 덤 블록에 옮긴 뒤 기대값을 고쳐 다시 실행한다.', v_md5, v_want;
  end if;
end $chk$;

-- ── ① data_audit — 「같은 사람이 같은 날 두 조」(golf_two_groups) 항목을 `return res;` 앞에 붙인다 ─────────
--   data_audit() 본문은 운영 적용본이 정본(저장소에 전문 없음). 끝 앵커가 정확히 1번이 아니면 멈춘다. 이미 있으면 건너뜀.
do $do$
declare
  d   text;
  n   int;
  anc constant text := E'  return res;\nend $function$';
  blk text;
begin
  if to_regprocedure('public.data_audit()') is null then
    raise exception '183: data_audit() 가 없다 — 82·129 부터 적용';
  end if;
  d := pg_get_functiondef('public.data_audit()'::regprocedure);
  if d like '%''golf_two_groups''%' then
    raise notice '183: data_audit 에 golf_two_groups 가 이미 있다 — 건너뜀';
    return;
  end if;
  n := (length(d) - length(replace(d, anc, ''))) / length(anc);
  if n <> 1 then
    raise exception '183: data_audit 의 끝(「  return res;」 다음 줄 「end $function$」)이 %번 나온다(1번이어야 한다) — 운영 본문 끝을 확인', n;
  end if;
  blk := $blk$
  -- 같은 사람이 같은 날 두 조 (183) — 조원(golf_group_members) 1명이 같은 날 서로 다른 조 2개 이상 · 최근 7일 이후
  res := res || jsonb_build_object(
    'key','golf_two_groups','sev','error',
    'count',(select count(*) from (
        select g.play_date, m.member_id
          from golf_group_members m join golf_groups g on g.id = m.group_id
         where m.member_id is not null
           and g.play_date >= (now() at time zone 'Asia/Tokyo')::date - 7
         group by g.play_date, m.member_id
        having count(distinct g.id) > 1) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select coalesce(max(gm.event_seq), max(m.event_seq), 0)::bigint as event_seq,
               (g.play_date || ' · ' || coalesce(max(gm.person_tag), '?') || ' · ' || count(distinct g.id) || '조: '
                 || string_agg(distinct coalesce(g.course_code, '-') || '#' || coalesce(g.slot_no::text, '-') || coalesce(' ' || g.tee_time, ''), ' | '
                               order by coalesce(g.course_code, '-') || '#' || coalesce(g.slot_no::text, '-') || coalesce(' ' || g.tee_time, ''))) as detail
          from golf_group_members m join golf_groups g on g.id = m.group_id
          left join guest_members gm on gm.id = m.member_id
         where m.member_id is not null
           and g.play_date >= (now() at time zone 'Asia/Tokyo')::date - 7
         group by g.play_date, m.member_id
        having count(distinct g.id) > 1
         order by g.play_date, 1
         limit 20) s)
  );
$blk$;
  d := replace(d, anc, blk || anc);
  execute d;
end $do$;
revoke all on function public.data_audit() from public, anon;
grant execute on function public.data_audit() to authenticated;

-- ── ② 예약 입국일·귀국일 변경 → 그 팀 전기카트 청구 다시 계산 ─────────────────────────────
create or replace function public.cart_dates_resync() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  -- 무료일(입국일·귀국일, 116) 판정이 달라질 수 있는 행 = 옛·새 입국일·귀국일에 라운딩하는 전기카트 신청뿐.
  -- 값은 바꾸지 않는다(updated_at 만 set_updated_at 이 고친다) — trg_cart_charge → cart_sync_charge(175)가 청구 줄을 맞춘다.
  update cart_bookings c
     set qty = c.qty
   where c.event_seq = new.event_seq
     and c.cart_code = 'electric'
     and c.play_date in (old.dep_date, old.arr_date, new.dep_date, new.arr_date);
  return null;
end $fn$;
revoke all on function public.cart_dates_resync() from public, anon, authenticated;

drop trigger if exists trg_cart_dates_bookings on public.bookings;
create trigger trg_cart_dates_bookings
  after update of dep_date, arr_date on public.bookings
  for each row
  when (old.dep_date is distinct from new.dep_date or old.arr_date is distinct from new.arr_date)
  execute function public.cart_dates_resync();

-- ── ③ 9홀 추가 중복 확인 RPC — 그 팀 그날의 9홀 추가 줄 수·인원·합계만 ──────────────────────────
create or replace function public.golf_extra_count(p_seq bigint, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_pfx text;
  v_n   bigint;
  v_q   numeric;
  v_g   bigint;
begin
  if not coalesce(is_admin() or has_any_area(array['golf','front','settle','pos']), false) then
    raise exception 'permission denied (golf_extra_count)';
  end if;
  if p_seq is null or p_date is null then
    return jsonb_build_object('lines', 0, 'players', 0, 'gross', 0);
  end if;
  -- course.html 이 golf_add_charge 에 넘기는 p_link = 'golf9:' + 날짜(YYYY-MM-DD) + ':' + 조 id
  v_pfx := 'golf9:' || to_char(p_date, 'YYYY-MM-DD') || ':';
  select count(*),
         coalesce(sum(c.qty), 0),
         coalesce(sum(coalesce(c.amount, 0) + coalesce(c.tax, 0) + coalesce(c.service_charge, 0)), 0)
    into v_n, v_q, v_g
    from charges c
   where c.event_seq = p_seq
     and left(c.link_ref, length(v_pfx)) = v_pfx
     and not coalesce(c.voided, false);
  return jsonb_build_object('lines', v_n, 'players', v_q, 'gross', v_g);
end $function$;
revoke all on function public.golf_extra_count(bigint, date) from public, anon;
grant execute on function public.golf_extra_count(bigint, date) to authenticated;
comment on function public.golf_extra_count(bigint, date) is
  '코스 배정표 [9홀 추가] 중복 확인(183) — 그 팀 그날 9홀 추가 청구 줄 수·인원·합계(무효 제외). 권한 = golf_add_charge 와 같음.';

-- ── 덤 golf_add_charge — 권한 확인 coalesce · 새 계산서 월(session_ym) = 175 규칙 ─────────────────
create or replace function public.golf_add_charge(p_seq bigint, p_desc text, p_price integer, p_qty integer, p_link text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare v_folio uuid; v_ym text; v_gross int; v_tax int; v_id uuid; v_by text;
begin
  if not coalesce(is_admin() or has_any_area(array['golf','front','settle','pos']), false) then
    raise exception 'permission denied (golf_add_charge)';
  end if;
  if p_price is null or p_price < 0 or p_qty is null or p_qty < 1 then raise exception 'bad amount'; end if;
  v_by := coalesce(nullif(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'name',''),
                   current_setting('request.jwt.claims', true)::jsonb->>'email');
  select id into v_folio from folios where event_seq = p_seq and subject = 'team' and status = 'open' order by opened_at limit 1;
  if v_folio is null then
    -- 183: 계산서 월 = 175 규칙(예약의 세션 월 → 입국월 → 당일 손님 방문월 → 이번 달 JST)
    select coalesce(nullif(b.session_ym, ''), to_char(b.dep_date, 'YYYY-MM')) into v_ym from bookings b where b.event_seq = p_seq;
    if v_ym is null then
      select to_char(w.walk_date, 'YYYY-MM') into v_ym from walkins w where w.event_seq = p_seq;
    end if;
    v_ym := coalesce(v_ym, to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM'));
    insert into folios(event_seq, subject, status, session_ym, created_by) values (p_seq, 'team', 'open', v_ym, v_by) returning id into v_folio;
  end if;
  v_gross := p_price * p_qty; v_tax := tax_included(v_gross, 10);   -- 158: 소비세 공통 함수(버림)
  insert into charges(folio_id, event_seq, member_id, category, source, description, qty, unit_price, amount, tax, service_charge, link_ref, created_by)
  values (v_folio, p_seq, null, '라운딩', 'golf', p_desc || case when p_qty > 1 then ' ×'||p_qty else '' end,
          p_qty, p_price, v_gross - v_tax, v_tax, 0, p_link, v_by)
  returning id into v_id;
  return v_id;
end $function$;
revoke all on function public.golf_add_charge(bigint, text, integer, integer, text) from public, anon;
grant execute on function public.golf_add_charge(bigint, text, integer, integer, text) to authenticated;

notify pgrst, 'reload schema';

-- ── 확인용(읽기만) ─────────────────────────────────────────────────────────
--   select prosrc like '%''golf_two_groups''%' from pg_proc where oid = 'public.data_audit()'::regprocedure;            -- t
--   select proname, prosecdef, proconfig, has_function_privilege('anon', oid, 'execute') as anon,
--          has_function_privilege('authenticated', oid, 'execute') as auth
--     from pg_proc where proname in ('golf_extra_count','golf_add_charge','cart_dates_resync');
--     -- golf_extra_count t · {search_path=public} · f · t / golf_add_charge t · … · f · t / cart_dates_resync t · … · f · f
--   select golf_extra_count(<팀 번호>, '<YYYY-MM-DD>');   -- 로그인(golf 이상) 계정으로: {"lines":…,"players":…,"gross":…}
