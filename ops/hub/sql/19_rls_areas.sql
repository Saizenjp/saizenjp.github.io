-- ============================================================================
--  SaiZen Hub — 19 카드별 RLS (읽기=로그인 전체 / 쓰기=영역 권한자만)
-- ----------------------------------------------------------------------------
--  17의 "로그인=전권(_auth_all)" 정책을 영역(card) 기반으로 교체한다.
--  · 읽기(select)  : 로그인 사용자 전체 허용(페이지 간 데이터 참조에 필요)
--  · 쓰기(ins/upd/del): 해당 카드 영역 권한자만(admin·manager는 무조건 통과)
--  → "함부로 수정 못하게"를 DB 차원에서 enforce. UI 카드 게이트는 별도(saizen-ops).
--
--  카드→테이블 매핑:
--    step1(데이터등록) = bookings passengers guests guest_members import_log
--    room(방배정)      = room_inventory rooms
--    notes(팀메모)     = event_notes event_note_log
--    settle(정산)      = folios charges payments transactions dining rounds fee_rules
--    pos(POS)          = folios charges payments transactions kitchen_tickets
--    kitchen(주방)     = kitchen_tickets
--    menu(메뉴)        = menu_items
--    member_codes      = admin/manager 전용(마스터 데이터)
--
--  실행: Supabase SQL Editor. 18 이후. 멱등.
--  ⚠ 실행 전 본인이 role='admin' 인지 반드시 확인(아니면 본인 쓰기도 전부 잠김).
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
      ('bookings',        array['step1']),
      ('passengers',      array['step1']),
      ('guests',          array['step1']),
      ('guest_members',   array['step1']),
      ('import_log',      array['step1']),
      ('member_codes',    array[]::text[]),   -- admin/manager 전용
      ('room_inventory',  array['room']),
      ('rooms',           array['room']),
      ('event_notes',     array['notes']),
      ('event_note_log',  array['notes']),
      ('folios',          array['settle','pos']),
      ('charges',         array['settle','pos']),
      ('payments',        array['settle','pos']),
      ('transactions',    array['settle','pos']),
      ('dining',          array['settle']),
      ('rounds',          array['settle']),
      ('fee_rules',       array['settle']),
      ('menu_items',      array['menu']),
      ('kitchen_tickets', array['pos','kitchen'])
    ) as t(tbl, areas)
  loop
    if to_regclass(format('public.%I', r.tbl)) is null then continue; end if;
    execute format('alter table public.%I enable row level security', r.tbl);

    -- 기존 정책 전부 제거(17의 _auth_all 포함)
    for pol in select policyname from pg_policies
      where schemaname = 'public' and tablename = r.tbl loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, r.tbl);
    end loop;

    -- 읽기: 로그인 사용자 전체
    execute format('create policy %I on public.%I for select to authenticated using (true)',
                   r.tbl || '_sel', r.tbl);
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
