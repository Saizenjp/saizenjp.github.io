-- ============================================================================
--  178_room_rights_rpc.sql — 조기 퇴실·싱글차지·별채 온천 사전신청비를 방배정 권한으로(좁은 서버 함수 3개)
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  무엇이 문제였나
--   방배정 화면(room.html)은 세 가지를 표에 직접 쓴다.
--    · 조기 퇴실 설정·해제 = guest_members 의 actual_dep·actual_dep_reason update (51)
--    · 싱글차지(간지호텔 1인 사용, 1박 4,400엔) = transactions insert(category 'single_charge') · 배정 해제 때 delete (59)
--    · 별채 온천 사전신청비(시즈노야도 별채, 1박 1인 2,000엔) = transactions insert(category 'byeolche_charge') · 배정 해제 때 delete
--   표 쓰기 권한(RLS)은 guest_members = 명단 등록(step1), transactions = 정산·POS(settle·pos) 다(19·46).
--   → 방배정(room·room_assign) 권한만 받은 계정은
--      조기 퇴실 [처리]·[해제]가 0행 반영(「저장되지 않았습니다」), 미배정 상태의 해제 버튼은 0행인데 「해제했습니다」로 알렸다.
--      싱글차지·사전신청비 기록은 거부(「요금 기록 실패」), 배정 해제 때의 삭제는 0행이라 조용히 남아 御請求書 청구가 계속됐다.
--
--  어떻게(RLS 는 그대로 두고, 방배정 권한으로 그 일만 하는 좁은 security definer 함수)
--   권한 = has_any_area(array['room']) — 부모 room 또는 그 자식 키(room_assign·occupancy·staychart·roomstats·inv_room, 138 area_expand)를
--          [수정]으로 가진 활성 계정, 그리고 활성 마스터. [보기]만 받은 계정·차단(active=false) 계정·권한 행 없는 계정·로그인 없음은 거부(42501).
--          rooms 표 쓰기 정책(has_any_area('{room}'))과 같은 선이다.
--   ① room_set_early_checkout(p_member, p_date, p_reason) → integer(반영 행 수)
--        그 명단 행의 actual_dep·actual_dep_reason 두 열만 쓴다. p_date null = 해제(사유도 지운다). 사유는 앞뒤 빈칸을 떼고 200자까지.
--        퇴실일은 체류 기간 안이어야 한다(밖이면 22008). 체류 기간 = 그 팀 예약의 입국일(dep_date) ~ 귀국일(arr_date).
--        그 사람의 배정 행(rooms)이 그보다 넓으면(연장 숙박 등) 그 범위까지 받는다.
--   ② room_fee_record(p_kind, p_seq, p_member, p_room_no, p_nights, p_unit, p_prepaid, p_desc) → uuid(새 거래 id)
--        transactions 한 행. 항목(category)은 'single_charge'·'byeolche_charge' 둘뿐이다(다른 값은 22023).
--        검사: 팀 있음(P0002) · 명단은 그 팀 사람 · 그 팀이 그 방(room_no)에 배정돼 있음 ·
--              별채 사전신청비는 사람 필수이고, 그 사람이 시즈노야도 료칸 별채의 그 방에 배정돼 있어야 함 ·
--              박수 1 ~ 그 팀 체류 박수(최대 60) · 1박 금액 1 ~ 20,000엔 · 설명 1~200자이고 방 이름이 들어 있음(해제 때 찾는 열쇠).
--        금액 = 1박 금액 × 박수(서버가 계산) · currency 'JPY' · posted_by 'front' 고정 ·
--        메리트 선불(settle_status 'prepaid_merit')은 싱글차지만 — 별채 사전신청비는 늘 현장 청구('onsite', 화면도 늘 onsite 로 보낸다).
--   ③ room_fee_clear(p_kind, p_seq, p_room_no, p_member default null) → integer(지운 행 수)
--        그 팀 · 그 항목 · 설명에 방 이름이 든 행만 지운다(화면의 옛 like '%방%' 과 같은 뜻 — 와일드카드 없이 strpos).
--        방 이름은 객실 마스터(room_inventory.room_no)에 있는 이름 그대로여야 한다(비거나 없는 이름이면 22023).
--        방 이름 일부나 괄호 한 글자로 그 팀의 항목이 통째로 지워지지 않게 하려는 것이다. p_member 를 주면 그 사람의 행만 지운다.
--        화면은 별채 사전신청비에 이것을 쓴다(같은 별채 방의 다른 사람 신청비까지 지워지던 것). 싱글차지는 대상자를 따로 고를 수 있어 사람 없이 부른다.
--   트리거는 그대로 돈다: transactions insert/delete → trg_single_charge_charge(single_charge_sync_charge → charge_link_sync, 175)가
--     계산서 줄을 만들거나 지운다(마감한 계산서의 줄·무효 줄은 그대로, 마감 뒤 지우면 「変更差額」 음수 줄 — 175). audit_row 가 이력을 남긴다
--     (누가 = request.jwt.claims 의 email·sub — security definer 함수 안에서도 부른 사람 그대로).
--     security definer 함수 안의 insert/delete 는 함수 소유자 권한이라 RLS 를 건너뛴다. 그 문장의 트리거도 같은 권한으로 돈다
--     (single_charge_sync_charge 는 그 자체가 security definer, charge_link_sync 는 부른 쪽 권한).
--     그래서 방배정 계정에 charges·folios 쓰기 권한이 없어도 계산서 줄이 생기고 지워진다(시험 스크립트가 확인).
--
--  하지 않는 일: RLS·정책 변경 없음(직접 쓰기는 종전처럼 step1·settle/pos 만) · 방(rooms) 단축·해제·복구는 화면이 하던 대로 rooms 표에 직접(room 권한) ·
--   followups(정산 확인 항목)·change_log(방배정 이력) 기록도 화면이 하던 대로 · 과거 데이터 손대지 않음 · 기존 함수 변경 없음(새 함수 3개만).
--  권한 줄: 세 함수 모두 public·anon 회수, authenticated 만 실행 → anon 이 실행할 수 있는 security definer 함수 수 15 그대로(00_VERIFY 139).
--  멱등(create or replace · revoke/grant · comment — 데이터를 바꾸는 문장 없음). 02·03·51·59·138·175 이후.
--  화면: room.html 이 이 함수들을 부른다. 함수가 없을 때(PGRST202, 또는 그 함수 이름이 든 42883 — 이 파일 적용 전 배포)만 옛 직접 쓰기로 돌아간다.
--  옛 번호 파일은 고치지 않는다(51·59 머리말에 「쓰기 경로 = 178 RPC」 한 줄을 붙이는 것은 제안만).
--  되돌리는 법(화면은 함수가 없으면 옛 직접 쓰기로 돌아가므로 이것만으로 종전 상태 — 방배정 권한만 받은 계정은 다시 실패한다):
--    drop function if exists public.room_set_early_checkout(uuid, date, text);
--    drop function if exists public.room_fee_record(text, bigint, uuid, text, integer, integer, boolean, text);
--    drop function if exists public.room_fee_clear(text, bigint, text, uuid);
-- ============================================================================

-- ── ⓪ 적용 전 검사 — 이 파일이 쓰는 열·헬퍼가 있는가 ───────────────────────────────
--   plpgsql 은 함수를 만들 때 열을 검사하지 않는다 — 없으면 화면이 처음 부를 때 터진다. 여기서 먼저 멈춘다.
do $chk$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'guest_members' and column_name = 'actual_dep_reason') then
    raise exception '178: guest_members.actual_dep·actual_dep_reason 이 없다 — 51 을 먼저 적용한다';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'transactions' and column_name = 'settle_status') then
    raise exception '178: transactions.settle_status 가 없다 — 03 을 먼저 적용한다';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'rooms' and column_name = 'inventory_id') then
    raise exception '178: rooms.inventory_id 가 없다 — 02 를 먼저 적용한다';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'room_inventory' and column_name = 'zone') then
    raise exception '178: room_inventory.zone 이 없다 — 02 를 먼저 적용한다';
  end if;
  if to_regprocedure('public.has_any_area(text[])') is null or to_regprocedure('public.area_expand(text[])') is null then
    raise exception '178: has_any_area·area_expand 가 없다 — 138 을 먼저 적용한다';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_single_charge_charge' and not tgisinternal) then
    raise notice '178: 싱글차지 → 청구 트리거(trg_single_charge_charge, 59·175)가 없다 — 거래는 기록되지만 계산서 줄이 생기지 않는다';
  end if;
end $chk$;

-- ── ① 조기 퇴실 설정·해제 — 그 명단 행의 actual_dep·actual_dep_reason 만 ──────────────────
create or replace function public.room_set_early_checkout(
  p_member uuid,
  p_date   date,
  p_reason text default null
) returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_seq bigint;
  v_dep date;
  v_arr date;
  v_n   integer;
begin
  if not coalesce(has_any_area(array['room']), false) then
    raise exception '권한 없음(방배정)' using errcode = '42501';
  end if;
  if p_member is null then
    raise exception '명단 행(p_member)이 비었다' using errcode = '22023';
  end if;

  select gm.event_seq into v_seq from guest_members gm where gm.id = p_member;
  if not found then
    raise exception '명단에 없는 사람이다(%)', p_member using errcode = 'P0002';
  end if;

  -- 퇴실일은 체류 기간 안(입국일 ~ 귀국일). 그 사람의 배정 행이 더 넓으면(연장 숙박 등) 그 범위까지.
  --   예약·배정 행이 모두 없으면 그쪽 끝은 보지 않는다(least·greatest 는 NULL 을 무시한다)
  if p_date is not null then
    select b.dep_date, b.arr_date into v_dep, v_arr from bookings b where b.event_seq = v_seq;
    select least(v_dep, min(r.check_in)), greatest(v_arr, max(r.check_out)) into v_dep, v_arr
      from rooms r where r.member_id = p_member;
    if (v_dep is not null and p_date < v_dep) or (v_arr is not null and p_date > v_arr) then
      raise exception '퇴실일 % 이 체류 기간(% ~ %) 밖이다', p_date, v_dep, v_arr using errcode = '22008';
    end if;
  end if;

  update guest_members
     set actual_dep        = p_date,
         actual_dep_reason = case when p_date is null then null
                                  else nullif(left(btrim(coalesce(p_reason, '')), 200), '') end
   where id = p_member;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

-- ── ② 싱글차지·별채 온천 사전신청비 기록 — transactions 한 행(항목 두 가지로 고정) ────────────────
create or replace function public.room_fee_record(
  p_kind    text,
  p_seq     bigint,
  p_member  uuid,
  p_room_no text,
  p_nights  integer,
  p_unit    integer,
  p_prepaid boolean,
  p_desc    text
) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  v_desc text := btrim(coalesce(p_desc, ''));
  v_room text := coalesce(p_room_no, '');
  v_dep  date;
  v_arr  date;
  v_id   uuid;
begin
  if not coalesce(has_any_area(array['room']), false) then
    raise exception '권한 없음(방배정)' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('single_charge', 'byeolche_charge') then
    raise exception '이 함수는 싱글차지(single_charge)·별채 사전신청비(byeolche_charge)만 기록한다(받은 값 %)', p_kind using errcode = '22023';
  end if;
  if p_seq is null or not exists (select 1 from guests g where g.event_seq = p_seq) then
    raise exception '팀이 없다(%)', p_seq using errcode = 'P0002';
  end if;
  if p_member is not null
     and not exists (select 1 from guest_members gm where gm.id = p_member and gm.event_seq = p_seq) then
    raise exception '그 팀의 명단이 아니다(%)', p_member using errcode = '22023';
  end if;
  if p_kind = 'byeolche_charge' and p_member is null then
    raise exception '별채 사전신청비는 사람(p_member)을 정해야 한다' using errcode = '22023';
  end if;
  -- 그 팀이 그 방에 배정돼 있어야 한다(객실 마스터의 이름 또는 배정 행에 적힌 이름).
  --   별채 사전신청비는 시즈노야도 료칸 별채의 방이고, 그 사람의 배정 행이어야 한다(화면이 별채에 넣은 직후에만 기록하는 것과 같은 뜻)
  if btrim(v_room) = '' or not exists (
       select 1 from rooms r left join room_inventory i on i.id = r.inventory_id
        where r.event_seq = p_seq and v_room in (i.room_no, r.room_no)
          and (p_kind = 'single_charge'
               or (i.facility = '시즈노야도 료칸' and i.zone = '별채' and r.member_id = p_member))) then
    raise exception '그 팀(별채 사전신청비는 그 사람)이 배정된 방이 아니다(%)', v_room using errcode = '22023';
  end if;
  select b.dep_date, b.arr_date into v_dep, v_arr from bookings b where b.event_seq = p_seq;
  if p_nights is null or p_nights < 1 or p_nights > 60
     or (v_dep is not null and v_arr is not null and p_nights > (v_arr - v_dep)) then
    raise exception '박수 % 가 맞지 않다(1 ~ 체류 박수 %)', p_nights, (v_arr - v_dep) using errcode = '22023';
  end if;
  if p_unit is null or p_unit < 1 or p_unit > 20000 then
    raise exception '1박 금액 % 이 범위(1 ~ 20,000엔) 밖이다', p_unit using errcode = '22023';
  end if;
  if v_desc = '' or length(v_desc) > 200 or strpos(v_desc, v_room) = 0 then
    raise exception '설명이 비었거나 200자를 넘거나 방 이름(%)이 들어 있지 않다', v_room using errcode = '22023';
  end if;

  insert into transactions(event_seq, member_id, category, description, qty, unit_price, amount,
                           currency, posted_by, settle_status)
  values (p_seq, p_member, p_kind, v_desc, p_nights, p_unit, p_unit * p_nights,
          'JPY', 'front',
          case when p_kind = 'single_charge' and coalesce(p_prepaid, false) then 'prepaid_merit' else 'onsite' end)
  returning id into v_id;
  return v_id;
end $fn$;

-- ── ③ 배정 해제 때 그 요금 지우기 — 그 팀·그 항목·그 방(·그 사람)만 ─────────────────────────
create or replace function public.room_fee_clear(
  p_kind    text,
  p_seq     bigint,
  p_room_no text,
  p_member  uuid default null
) returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_n integer;
begin
  if not coalesce(has_any_area(array['room']), false) then
    raise exception '권한 없음(방배정)' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('single_charge', 'byeolche_charge') then
    raise exception '이 함수는 싱글차지(single_charge)·별채 사전신청비(byeolche_charge)만 지운다(받은 값 %)', p_kind using errcode = '22023';
  end if;
  if p_seq is null or btrim(coalesce(p_room_no, '')) = '' then
    raise exception '팀·방 이름이 비었다(비우면 그 팀의 항목이 전부 지워진다)' using errcode = '22023';
  end if;
  -- 방 이름은 객실 마스터에 있는 이름 그대로 — 이름 일부·괄호 같은 한 글자로 그 팀 항목이 통째로 지워지지 않게
  if not exists (select 1 from room_inventory i where i.room_no = p_room_no) then
    raise exception '객실 마스터에 없는 방 이름이다(%) — 방 이름 일부로는 지우지 않는다', p_room_no using errcode = '22023';
  end if;

  delete from transactions t
   where t.event_seq = p_seq
     and t.category  = p_kind
     and strpos(coalesce(t.description, ''), p_room_no) > 0
     and (p_member is null or t.member_id = p_member);
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

-- ── ④ 권한 — 로그인 사용자만(비로그인·public 회수). 권한 확인은 함수 안(has_any_area) ──────────────────
revoke all on function public.room_set_early_checkout(uuid, date, text) from public, anon;
grant execute on function public.room_set_early_checkout(uuid, date, text) to authenticated;
revoke all on function public.room_fee_record(text, bigint, uuid, text, integer, integer, boolean, text) from public, anon;
grant execute on function public.room_fee_record(text, bigint, uuid, text, integer, integer, boolean, text) to authenticated;
revoke all on function public.room_fee_clear(text, bigint, text, uuid) from public, anon;
grant execute on function public.room_fee_clear(text, bigint, text, uuid) to authenticated;

comment on function public.room_set_early_checkout(uuid, date, text) is
  '조기 퇴실 설정·해제(178) — 방배정 권한(room 또는 자식 키). 그 명단 행의 actual_dep·actual_dep_reason 만. 퇴실일은 체류 기간(예약·그 사람 배정 행) 안. 반영 행 수.';
comment on function public.room_fee_record(text, bigint, uuid, text, integer, integer, boolean, text) is
  '싱글차지·별채 온천 사전신청비 기록(178) — 방배정 권한. category 는 single_charge·byeolche_charge 만. 배정된 방(별채비는 그 사람의 별채 방)·같은 팀·박수·금액 범위 검사. 새 거래 id.';
comment on function public.room_fee_clear(text, bigint, text, uuid) is
  '배정 해제 때 싱글차지·별채 사전신청비 삭제(178) — 방배정 권한. 방 이름은 객실 마스터 이름 그대로. 그 팀·그 항목·설명에 방 이름이 든 행(·p_member 면 그 사람)만. 지운 행 수.';

-- ── 확인용(읽기만) ───────────────────────────────────────────────────────
--   select p.proname, p.prosecdef, p.proconfig,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
--          has_function_privilege('anon', p.oid, 'execute')          as anon_exec
--     from pg_proc p where p.pronamespace = 'public'::regnamespace
--      and p.proname in ('room_set_early_checkout','room_fee_record','room_fee_clear');
--   -- 3행 · prosecdef t · search_path=public · auth_exec t · anon_exec f
