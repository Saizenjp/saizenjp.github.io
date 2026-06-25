-- ============================================================================
--  47_access_fn_reconcile.sql — 46 보정: me_access/admin_list_users/admin_set_access 통일
-- ----------------------------------------------------------------------------
--  46에서 me_access·admin_list_users를 재생성하며 name/dept/title 컬럼이 빠진 회귀 보정.
--  admin_set_access는 read_areas 포함 단일 7-arg로 통일(중복 오버로드 제거 → 모호성 방지).
--  멱등. ⚠ Supabase SQL Editor 수동 실행(46 이후).
-- ============================================================================

-- me_access: role·areas·read_areas + name·dept·title 전체 반환
drop function if exists me_access();
create or replace function me_access()
returns table(role text, areas text[], read_areas text[], name text, dept text, title text)
language plpgsql security definer set search_path = public stable as $$
begin
  return query select ua.role, ua.areas, ua.read_areas, ua.name, ua.dept, ua.title
               from user_access ua where ua.user_id = auth.uid();
  if not found then
    return query select 'staff'::text, '{}'::text[], '{}'::text[], ''::text, ''::text, ''::text;
  end if;
end $$;
grant execute on function me_access() to authenticated;

-- admin_list_users: dept·title·read_areas 포함
drop function if exists admin_list_users();
create or replace function admin_list_users()
returns table(user_id uuid, email text, name text, role text, areas text[], read_areas text[], dept text, title text)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '권한 없음(관리자 전용)'; end if;
  return query
    select ua.user_id, u.email::text,
           coalesce(u.raw_user_meta_data->>'name', ua.name) as name,
           ua.role, ua.areas, ua.read_areas, ua.dept, ua.title
    from user_access ua join auth.users u on u.id = ua.user_id
    order by case ua.role when 'admin' then 0 when 'manager' then 1 else 2 end, u.email;
end $$;
grant execute on function admin_list_users() to authenticated;

-- admin_set_access: 중복 오버로드 제거 후 read_areas 포함 단일 함수
drop function if exists admin_set_access(uuid, text, text[], text[]);
drop function if exists admin_set_access(uuid, text, text[], text, text, text);
create or replace function admin_set_access(
  p_user uuid, p_role text, p_areas text[],
  p_name text default null, p_dept text default null, p_title text default null,
  p_read_areas text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '권한 없음(관리자 전용)'; end if;
  if p_role not in ('admin','manager','staff') then raise exception '잘못된 role'; end if;
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
grant execute on function admin_set_access(uuid, text, text[], text, text, text, text[]) to authenticated;
