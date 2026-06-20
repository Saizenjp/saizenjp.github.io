-- ============================================================================
--  SaiZen Hub — 17 RLS 강화 (운영 전환: anon 전체허용 → 로그인 사용자 전용)
-- ----------------------------------------------------------------------------
--  목적: 09·11 등에서 개발 편의로 둔 "anon 전체허용" 정책을 거두고,
--        Supabase Auth 로 로그인한 사용자(authenticated)만 읽기·쓰기 가능하게 잠근다.
--        이로써 anon key 가 코드에 공개돼도(프론트 기본값 내장) 로그인 없이는
--        아무 데이터도 못 보고 못 바꾼다.
--
--  ⚠ 실행 전 반드시 (순서 중요):
--    1) 프론트에 로그인 UI 가 배포돼 있어야 한다(saizen-ops.js 의 로그인 컨트롤).
--    2) Supabase Dashboard → Authentication → Users 에서 현장 담당자 계정을
--       1개 이상 미리 만들어 둔다. (계정이 없으면 아무도 로그인 못 해 전원 차단됨)
--    3) 그 뒤 이 파일을 실행한다.
--
--  되돌리기(롤백): 다시 개발 단계로 풀려면 이 파일의 맨 아래 주석 블록 참고.
--
--  실행: Supabase SQL Editor. 01~16 이후. 멱등(재실행 안전).
-- ============================================================================

do $$
declare
  tbl  text;
  pol  record;
  tables text[] := array[
    'bookings','passengers','guests','guest_members','member_codes',
    'room_inventory','rooms','import_log','event_notes','event_note_log',
    'folios','charges','payments','menu_items','kitchen_tickets',
    'dining','rounds','transactions','fee_rules'
  ];
begin
  foreach tbl in array tables loop
    -- 존재하는 테이블만 처리(아직 안 만든 정산 워크스트림 테이블은 건너뜀)
    if to_regclass(format('public.%I', tbl)) is null then
      continue;
    end if;

    -- RLS 활성화
    execute format('alter table public.%I enable row level security', tbl);

    -- 기존 정책 전부 제거(개발용 anon 허용 정책 포함)
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
    end loop;

    -- 로그인 사용자(authenticated) 전용 단일 정책 — anon 은 일절 불가
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      tbl || '_auth_all', tbl
    );
  end loop;
end $$;

-- 확인용: 각 테이블에 authenticated 정책만 남았는지
--   select tablename, policyname, roles from pg_policies
--   where schemaname='public' order by tablename;

-- ============================================================================
--  롤백(개발 단계로 되돌리기) — 필요할 때만 아래를 실행
-- ----------------------------------------------------------------------------
--  do $$
--  declare tbl text; pol record;
--    tables text[] := array['bookings','passengers','guests','guest_members',
--      'member_codes','room_inventory','rooms','import_log','event_notes',
--      'event_note_log','folios','charges','payments','menu_items',
--      'kitchen_tickets','dining','rounds','transactions','fee_rules'];
--  begin
--    foreach tbl in array tables loop
--      if to_regclass(format('public.%I', tbl)) is null then continue; end if;
--      for pol in select policyname from pg_policies
--        where schemaname='public' and tablename=tbl loop
--        execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
--      end loop;
--      execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)', tbl||'_dev_all', tbl);
--    end loop;
--  end $$;
-- ============================================================================
--  끝.
-- ============================================================================
