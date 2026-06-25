-- ============================================================================
--  48_admin_list_name_fix.sql — admin_list_users 이름 우선순위 보정
-- ----------------------------------------------------------------------------
--  버그: admin_list_users가 coalesce(auth metadata name, user_access.name)로
--        auth 메타데이터(옛 한글)를 우선 → admin.html에서 이름을 영문으로
--        수정·저장(user_access.name)해도 목록은 한글로 되돌아옴.
--  상단바·me_access는 user_access.name(=acc.name)을 정본으로 사용하므로
--        admin_list_users도 ua.name을 우선하도록 통일(비었을 때만 메타 폴백).
--  멱등. ⚠ Supabase SQL Editor 수동 실행(47 이후) — 이미 MCP로 적용됨.
-- ============================================================================

drop function if exists admin_list_users();
create or replace function admin_list_users()
returns table(user_id uuid, email text, name text, role text, areas text[], read_areas text[], dept text, title text)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '권한 없음(관리자 전용)'; end if;
  return query
    select ua.user_id, u.email::text,
           coalesce(nullif(ua.name, ''), u.raw_user_meta_data->>'name') as name,  -- user_access.name 정본 우선
           ua.role, ua.areas, ua.read_areas, ua.dept, ua.title
    from user_access ua join auth.users u on u.id = ua.user_id
    order by case ua.role when 'admin' then 0 when 'manager' then 1 else 2 end, u.email;
end $$;
grant execute on function admin_list_users() to authenticated;
