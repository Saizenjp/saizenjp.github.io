-- ============================================================================
--  174_child_area_read_perm.sql — 세부 권한(자식 키)·「보기」 권한이 서버에서도 통하게 + 본인 마스터 강등 거부
-- ----------------------------------------------------------------------------
--  2026-11-21 적용 완료(MCP · Min 승인). 순서: 138(area_tree·area_expand)·46(read_areas)·49(active)·104·71·75·77·169·126·78·47·30·44 이후.
--  멱등 — 다시 실행해도 같은 결과(이미 바뀐 함수는 건너뛰고, 정책·admin_set_access 는 같은 내용으로 다시 만든다).
--
--  왜
--   화면(saizen-core areaAllowed)은 138 부터 세부 영역(자식 키)과 「보기」(read_areas)를 알아보는데,
--   서버 몇 군데가 옛 방식(user_access.areas 를 풀지 않고 부모 키와 그대로 비교 · read_areas 는 보지 않음)으로 남아
--   「화면은 열리는데 서버가 거부」하거나 「화면만 막고 서버는 통과」했다(전체 검수에서 넘긴 항목).
--
--  무엇을
--  ① 방 맞바꾸기·시즈 배정 RPC 가 자식 키를 인정
--     room_swap · shizu_swap_rooms · shizu_place · shizu_unassign · shizu_assign_rooms
--     종전: `coalesce(v_areas,'{}') && array['room'(,'shizu')]` — 저장된 키를 그대로 부모 키와 견준다.
--       → 권한 관리에서 「방배정」(room_assign)·「시즈 예약표」(shizu_sheet) 줄만 [수정]으로 받은 계정은
--         화면이 수정 모드로 열리고 rooms 표 쓰기(RLS = has_any_area → area_expand)도 되는데, 이 RPC 만 「권한 없음」.
--     이후: `area_expand(coalesce(v_areas,'{}')) && array[…]` — 138 의 그룹 단위 보호와 같은 선.
--       room 자식(room_assign·occupancy·staychart·roomstats·inv_room)은 rooms 표 쓰기 정책(RLS)과 같다.
--       shizu 자식(shizu_sheet·inv_shizu)은 rooms 를 직접 쓰지는 못하지만(rooms 쓰기 = room 그룹, 19), 이 RPC 들은 종전에도
--       shizu 그룹에 열려 있었으므로 그 자식 줄 [수정]까지 넓어진다(shizu_onsen 쓰기 정책 63 과 같은 선).
--       [보기]만 받은 계정·차단 계정·영역 없는 매니저는 종전대로 거부(areas 만 보고 active 를 본다).
--     shizu_autofill(89 의 래퍼, 같은 꼴)도 무늬가 맞으면 함께 고친다 — 운영 본문을 대조하지 못한 함수라
--       무늬가 다르면 알림(notice)만 남기고 건너뛴다(00_VERIFY 174 둘째 줄이 상태를 보여 준다).
--  ② 통계 RPC 가 「보기」를 인정 — exec_stats · booking_trend · visitor_stats
--     종전: `select role, areas into v_role, v_areas …` — [보기]로 받은 키(read_areas)는 읽지 않는다.
--       → 통계를 [보기]로 받은 계정은 화면이 열리고 집계는 「권한 없음」.
--     이후: `select role, coalesce(areas,'{}') || coalesce(read_areas,'{}') into v_role, v_areas …` — 읽는 줄 하나만 바꾼다.
--       그 아래 조건식(138: `&& array['stats','stats_mgmt']` · 78: `'report' = any(…)`)은 그대로라
--       「체류 캘린더만」(staycal) 받은 계정은 [수정]이든 [보기]든 여전히 집계를 부르지 못한다.
--       (has_any_read_area(array['stats','stats_mgmt']) 로 바꾸지 않는 까닭: area_expand 가 staycal 을 부모 stats 로 풀어
--        캘린더 전용 계정이 통과해 버린다.)
--  ③ admin_set_access 가 본인 마스터 강등을 거부(47 본문 + 확인 한 줄, role null 도 「잘못된 role」로)
--     화면(admin.html saveRow)만 막고 있었다 → RPC 를 직접 부르면 마지막 마스터가 스스로 내려가 마스터 0명이 될 수 있다.
--     본인 차단·마스터 차단은 admin_set_active(49)가 이미 서버에서 거부한다(그대로 둔다).
--  ④ 現地精算表 의 비고·차감·가산 표 읽기 정책 — settle_remarks · settle_deductions · settle_extras
--     종전: select 정책 = has_any_area('{settle}')(쓰기 권한자만) → 정산을 [보기]로 받은 계정은 화면이 열려도
--       비고·차감·가산이 0행으로 돌아와(오류 없음) 차감이 빠진 합계를 본다.
--     이후: select 정책만 has_any_read_area('{settle}')(46 이 다른 돈 표에 쓴 것과 같은 꼴·같은 정책 이름).
--       insert·update·delete 정책은 손대지 않는다(쓰기 = [수정] 권한자만).
--     ⚠ 화면 짝: [보기] 계정에게 줄이 보이게 되면 그 줄의 수정·삭제는 RLS 가 0행으로 거른다(오류가 아니다).
--       settle_merit.html 이 0행을 실패로 알리게 함께 고친다(되읽기 .select('id') — 화면 치환문 참조).
--
--  바꾸지 않는 것
--   area_tree·권한 헬퍼(138) · rooms·guest_members·transactions 정책 · 각 RPC 의 나머지 본문 ·
--   security definer·search_path·실행 권한(로그인 전용 — anon 이 실행할 수 있는 security definer 함수 수 15 그대로).
--   방배정 권한만으로 조기 퇴실·싱글차지를 저장하게 할지는 결정 항목이라 여기서 구현하지 않는다.
--
--  방식
--   ①② = 운영 본문 글자 치환(158·161·163 과 같은 꼴): pg_get_functiondef 를 읽어 권한 확인 줄만 바꾼다.
--     치환 대상 글자가 정확히 1번 나오지 않으면 예외로 멈춘다. MCP apply_migration·SQL Editor 처럼 파일 전체가
--     한 트랜잭션이면 아무것도 바뀌지 않는다(psql 로 문장마다 실행했다면 앞 블록은 적용된 채 남는다 —
--     멱등이라 원인을 고친 뒤 파일을 다시 실행하면 된다).
--     ② 는 v_areas 가 권한 확인 말고 다른 데서 쓰이지 않는지도 본다(본문에 정확히 3번: 선언·읽기·조건).
--   ③ = 전문(47 본문 = 2026-11-20 운영 md5 일치). ④ = 읽기 정책만 다시 만든다.
--   운영 본문 대조(2026-11-20, md5(prosrc)·길이)
--     일치: shizu_swap_rooms(71) · shizu_place(169) · shizu_unassign(77) · admin_set_access(47) · area_expand·has_any_*(138)
--     주석만 빠진 꼴로 일치: room_swap(104 에서 주석뿐인 줄 제거) · shizu_assign_rooms(75 에서 -- 주석 제거) ·
--       visitor_stats(78 에서 주석뿐인 줄 제거) — 권한 확인 줄은 주석이 없어 치환 대상이 그대로 있다.
--     저장소에 맞는 본문 없음: exec_stats(130·131 이 전문을 남기지 않았다) · booking_trend(126+138 로도 길이가 다르다)
--       → 치환 대상 글자가 실제로 있는지는 적용하는 쪽이 확인한다(없으면 이 파일이 예외로 멈춘다).
--
--  되돌리는 법
--   ① ② : 각 do 블록의 c_old 와 c_new 를 서로 바꿔 한 번 실행한다(같은 글자 치환을 거꾸로).
--   ③ : 47_access_fn_reconcile.sql 의 admin_set_access 정의를 다시 실행한다.
--   ④ : 세 표의 <표>_sel 정책을 지우고 `using (has_any_area('{settle}'))` 로 다시 만든다(30·44 의 select 정책).
--  확인: 00_VERIFY 174 행(5줄).
-- ============================================================================

-- ── ① 방 맞바꾸기·시즈 배정 RPC — 권한 확인을 실효 키(area_expand)로 ──────────────
do $mig$
declare
  r record; d text; n int;
  c_old constant text := $q$coalesce(v_areas,'{}') && array[$q$;
  c_new constant text := $q$area_expand(coalesce(v_areas,'{}')) && array[$q$;
begin
  if to_regprocedure('public.area_expand(text[])') is null then
    raise exception '174 ①: area_expand(text[]) 없음 — 138 먼저';
  end if;
  for r in
    select * from (values
      ('public.room_swap(uuid[],uuid[])',                            true),
      ('public.shizu_swap_rooms(uuid[],text,uuid,uuid[],text,uuid)', true),
      ('public.shizu_place(jsonb)',                                  true),
      ('public.shizu_unassign(uuid[])',                              true),
      ('public.shizu_assign_rooms(jsonb,date,date)',                 true),
      ('public.shizu_autofill(text)',                                false)
    ) as t(sig, must)
  loop
    if to_regprocedure(r.sig) is null then
      if r.must then raise exception '174 ①: % 없음', r.sig; end if;
      raise notice '174 ①: % 없음 — 건너뜀', r.sig;
      continue;
    end if;
    d := pg_get_functiondef(to_regprocedure(r.sig)::oid);
    if position(c_new in d) > 0 then
      raise notice '174 ①: % already applied', r.sig;
      continue;
    end if;
    n := (length(d) - length(replace(d, c_old, ''))) / length(c_old);
    if n <> 1 then
      if r.must then
        raise exception '174 ①: % 의 권한 확인 줄이 예상과 다르다(무늬 %번 — 1번이어야 한다) — 운영 본문 확인', r.sig, n;
      end if;
      raise notice '174 ①: % 의 권한 확인 줄이 예상과 다르다(무늬 %번) — 건너뜀', r.sig, n;
      continue;
    end if;
    execute replace(d, c_old, c_new);
  end loop;
end $mig$;

-- ── ② 통계 RPC — 「보기」(read_areas)로 받은 키도 함께 읽는다 ─────────────────────
do $mig$
declare
  r record; d text; src text; n int; nv int;
  c_old constant text := 'select role, areas into v_role, v_areas';
  c_new constant text := $q$select role, coalesce(areas,'{}') || coalesce(read_areas,'{}') into v_role, v_areas$q$;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'user_access' and column_name = 'read_areas') then
    raise exception '174 ②: user_access.read_areas 없음 — 46 먼저';
  end if;
  for r in
    select * from (values
      ('public.exec_stats(date,date)'),
      ('public.booking_trend(text,integer)'),
      ('public.visitor_stats(date,date,text)')
    ) as t(sig)
  loop
    if to_regprocedure(r.sig) is null then
      raise exception '174 ②: % 없음', r.sig;
    end if;
    d := pg_get_functiondef(to_regprocedure(r.sig)::oid);
    if position(c_new in d) > 0 then
      raise notice '174 ②: % already applied', r.sig;
      continue;
    end if;
    select p.prosrc into src from pg_proc p where p.oid = to_regprocedure(r.sig)::oid;
    n  := (length(d)   - length(replace(d,   c_old,     ''))) / length(c_old);
    nv := (length(src) - length(replace(src, 'v_areas', ''))) / length('v_areas');
    if n <> 1 or nv <> 3 then
      raise exception '174 ②: % 의 권한 확인 줄이 예상과 다르다(읽는 줄 %번 · v_areas %번 — 1번 · 3번이어야 한다) — 운영 본문 확인', r.sig, n, nv;
    end if;
    execute replace(d, c_old, c_new);
  end loop;
end $mig$;

-- ── ③ admin_set_access — 본인 마스터 강등을 서버에서도 거부(47 본문 + 확인 한 줄) ──
create or replace function public.admin_set_access(
  p_user uuid, p_role text, p_areas text[],
  p_name text default null, p_dept text default null, p_title text default null,
  p_read_areas text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '권한 없음(관리자 전용)'; end if;
  if p_role is null or p_role not in ('admin','manager','staff') then raise exception '잘못된 role'; end if;
  if p_user = auth.uid() and p_role <> 'admin' then
    raise exception '본인 계정의 마스터 권한은 스스로 내릴 수 없습니다(다른 마스터가 변경해야 합니다)';
  end if;
  update user_access
    set role = p_role,
        areas = coalesce(p_areas, '{}'),
        read_areas = coalesce(p_read_areas, '{}'),
        name = coalesce(p_name, name),
        dept = coalesce(p_dept, dept),
        title = coalesce(p_title, title),
        updated_at = now()
  where user_id = p_user;
end $$;

-- ── ④ 現地精算表 비고·차감·가산 — 읽기 정책만 「보기」 권한까지(쓰기 정책은 그대로) ──
do $mig$
declare t text;
begin
  if to_regprocedure('public.has_any_read_area(text[])') is null then
    raise exception '174 ④: has_any_read_area(text[]) 없음 — 46·138 먼저';
  end if;
  foreach t in array array['settle_remarks','settle_deductions','settle_extras'] loop
    if to_regclass('public.' || t) is null then
      raise exception '174 ④: 표 % 없음 — 30·44 먼저', t;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_sel', t);
    execute format('create policy %I on public.%I for select to authenticated using (has_any_read_area(%L))',
                   t || '_sel', t, array['settle']);
  end loop;
end $mig$;

-- ── 실행 권한 — 로그인 전용 그대로(118·119 와 같은 상태를 다시 적는다) ─────────────
revoke all on function public.room_swap(uuid[], uuid[]) from public, anon;
grant execute on function public.room_swap(uuid[], uuid[]) to authenticated;
revoke all on function public.shizu_swap_rooms(uuid[], text, uuid, uuid[], text, uuid) from public, anon;
grant execute on function public.shizu_swap_rooms(uuid[], text, uuid, uuid[], text, uuid) to authenticated;
revoke all on function public.shizu_place(jsonb) from public, anon;
grant execute on function public.shizu_place(jsonb) to authenticated;
revoke all on function public.shizu_unassign(uuid[]) from public, anon;
grant execute on function public.shizu_unassign(uuid[]) to authenticated;
revoke all on function public.shizu_assign_rooms(jsonb, date, date) from public, anon;
grant execute on function public.shizu_assign_rooms(jsonb, date, date) to authenticated;
revoke all on function public.exec_stats(date, date) from public, anon;
grant execute on function public.exec_stats(date, date) to authenticated;
revoke all on function public.booking_trend(text, integer) from public, anon;
grant execute on function public.booking_trend(text, integer) to authenticated;
revoke all on function public.visitor_stats(date, date, text) from public, anon;
grant execute on function public.visitor_stats(date, date, text) to authenticated;
revoke all on function public.admin_set_access(uuid, text, text[], text, text, text, text[]) from public, anon;
grant execute on function public.admin_set_access(uuid, text, text[], text, text, text, text[]) to authenticated;
do $mig$
begin
  if to_regprocedure('public.shizu_autofill(text)') is not null then
    execute 'revoke all on function public.shizu_autofill(text) from public, anon';
    execute 'grant execute on function public.shizu_autofill(text) to authenticated';
  end if;
end $mig$;

-- 확인(읽기 전용)
-- select proname, prosrc like '%area_expand(coalesce(v_areas%' as child_ok from pg_proc
--  where pronamespace = 'public'::regnamespace
--    and proname in ('room_swap','shizu_swap_rooms','shizu_place','shizu_unassign','shizu_assign_rooms','shizu_autofill');   -- 모두 true
-- select proname, prosrc like '%coalesce(read_areas,''{}'') into v_role, v_areas%' as read_ok from pg_proc
--  where pronamespace = 'public'::regnamespace and proname in ('exec_stats','booking_trend','visitor_stats');              -- 모두 true
-- select tablename, policyname, cmd, qual, with_check from pg_policies
--  where schemaname = 'public' and tablename in ('settle_remarks','settle_deductions','settle_extras') order by 1, 2;       -- _sel 만 has_any_read_area
-- select count(*) from pg_proc where proname = 'admin_set_access';                                                          -- 1 (옛 오버로드 없음)
-- select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute');                         -- 15 (불변)
