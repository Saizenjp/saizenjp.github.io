-- ============================================================================
--  SaiZen Hub — 04 RLS 정책 갱신 (publishable/anon key 호환)
-- ----------------------------------------------------------------------------
--  배경: 01·02 SQL의 정책은 'to authenticated'(로그인 사용자)만 허용.
--        그런데 publishable key(또는 anon key)로 접속하면 역할이 'anon'이라
--        쓰기가 RLS에 막힘 → "new row violates row-level security policy".
--  해결: 모든 운영 테이블 정책을 anon + authenticated 둘 다 허용으로 재생성.
--        (RLS는 켜둔 채 허용 대상만 확장. 단일 운영팀 전제의 1단계 기준.)
--  01·02·03 실행 후 마지막에 실행. 멱등.
-- ============================================================================

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'bookings','passengers','member_codes','guests','guest_members',
    'rooms','rounds','dining','transactions','room_inventory','fee_rules'
  ] loop
    -- 기존 정책 제거 후 anon+authenticated 허용으로 재생성
    execute format('drop policy if exists %I on %I', 'p_all_'||tbl, tbl);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      'p_all_'||tbl, tbl
    );
  end loop;
end $$;
