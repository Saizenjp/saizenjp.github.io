-- ============================================================================
--  SaiZen Hub — 19 카드별 RLS (영역 권한 기반)
-- ----------------------------------------------------------------------------
--  17의 "로그인=전권(_auth_all)" 정책을 영역(card) 기반으로 교체한다.
--  · 쓰기(ins/upd/del): 해당 카드 영역 권한자만(admin·manager는 무조건 통과)
--  · 읽기(select):
--      - 일반 운영 테이블 = 로그인 사용자 전체(페이지 간 참조 필요)
--      - 민감(돈·정산) = 정산·POS 권한자만   · 회원PII(member_codes) = admin/manager만
--  → 수정 차단 + 민감 데이터 열람 차단까지 DB 차원 enforce.
--
--  카드→테이블(쓰기) 매핑:
--    step1 = bookings passengers guests guest_members import_log
--    room  = room_inventory rooms   · notes = event_notes event_note_log
--    settle= folios charges payments transactions dining rounds fee_rules
--    pos   = folios charges payments transactions kitchen_tickets
--    kitchen = kitchen_tickets   · menu = menu_items
--    member_codes = admin/manager 전용(마스터 데이터)
--  읽기 제한 테이블: folios charges payments transactions dining rounds fee_rules
--                    (정산·POS만) · member_codes(admin/manager만)
--
--  실행: Supabase SQL Editor. 18 이후. 멱등(재실행 안전 — 정책 갱신용 재실행 OK).
--  ⚠ 실행 전 본인이 role='admin' 인지 반드시 확인(아니면 본인 쓰기·읽기도 잠김).
-- ============================================================================

-- 여러 영역 중 하나라도 가지면 true. admin·manager는 무조건 true. 빈 배열=admin/manager 전용.
create or replace function has_any_area(p_areas text[])
returns boolean language sql security definer set search_path = public stable as $$
  select exists(
    select 1 from user_access
    where user_id = auth.uid()
      and (role in ('admin','manager') or areas && p_areas)
  );
$$;
grant execute on function has_any_area(text[]) to authenticated;

do $$
declare
  r   record;
  pol record;
begin
  for r in
    select * from (values
      --  테이블,            쓰기영역,                 읽기개방(true=로그인전체 / false=쓰기영역만)
      ('bookings',        array['step1'],           true),
      ('passengers',      array['step1'],           true),
      ('guests',          array['step1'],           true),
      ('guest_members',   array['step1'],           true),
      ('import_log',      array['step1'],           true),
      ('member_codes',    array[]::text[],          false),  -- admin/manager 전용(읽기·쓰기)
      ('room_inventory',  array['room'],            true),
      ('rooms',           array['room'],            true),
      ('event_notes',     array['notes'],           true),
      ('event_note_log',  array['notes'],           true),
      ('folios',          array['settle','pos'],    false),  -- 돈: 정산·POS만
      ('charges',         array['settle','pos'],    false),
      ('payments',        array['settle','pos'],    false),
      ('transactions',    array['settle','pos'],    false),
      ('dining',          array['settle'],          false),
      ('rounds',          array['settle'],          false),
      ('fee_rules',       array['settle'],          false),
      ('menu_items',      array['menu'],            true),
      ('kitchen_tickets', array['pos','kitchen'],   true)
    ) as t(tbl, areas, read_open)
  loop
    if to_regclass(format('public.%I', r.tbl)) is null then continue; end if;
    execute format('alter table public.%I enable row level security', r.tbl);

    -- 기존 정책 전부 제거(17의 _auth_all·이전 19 정책 포함)
    for pol in select policyname from pg_policies
      where schemaname = 'public' and tablename = r.tbl loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, r.tbl);
    end loop;

    -- 읽기: 개방이면 로그인 전체, 아니면 해당 영역(또는 admin/manager)만
    if r.read_open then
      execute format('create policy %I on public.%I for select to authenticated using (true)',
                     r.tbl || '_sel', r.tbl);
    else
      execute format('create policy %I on public.%I for select to authenticated using (has_any_area(%L))',
                     r.tbl || '_sel', r.tbl, r.areas);
    end if;
    -- 쓰기: 해당 영역(또는 admin/manager)만
    execute format('create policy %I on public.%I for insert to authenticated with check (has_any_area(%L))',
                   r.tbl || '_ins', r.tbl, r.areas);
    execute format('create policy %I on public.%I for update to authenticated using (has_any_area(%L)) with check (has_any_area(%L))',
                   r.tbl || '_upd', r.tbl, r.areas, r.areas);
    execute format('create policy %I on public.%I for delete to authenticated using (has_any_area(%L))',
                   r.tbl || '_del', r.tbl, r.areas);
  end loop;
end $$;

-- 확인: 테이블별 정책
--   select tablename, policyname, cmd, roles from pg_policies
--   where schemaname='public' order by tablename, policyname;

-- ============================================================================
--  롤백(17의 전권 정책으로 되돌리기) — 필요할 때만
-- ----------------------------------------------------------------------------
--  do $$ declare tbl text; pol record;
--    tables text[]:=array['bookings','passengers','guests','guest_members','member_codes',
--      'room_inventory','rooms','import_log','event_notes','event_note_log','folios',
--      'charges','payments','menu_items','kitchen_tickets','dining','rounds','transactions','fee_rules'];
--  begin foreach tbl in array tables loop
--    if to_regclass(format('public.%I',tbl)) is null then continue; end if;
--    for pol in select policyname from pg_policies where schemaname='public' and tablename=tbl loop
--      execute format('drop policy if exists %I on public.%I', pol.policyname, tbl); end loop;
--    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', tbl||'_auth_all', tbl);
--  end loop; end $$;
-- ============================================================================
--  끝.
-- ============================================================================
