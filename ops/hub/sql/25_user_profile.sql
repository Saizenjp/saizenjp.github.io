-- ============================================================================
--  SaiZen Hub — 25 계정 프로필(부서·직급) + me_access/admin RPC 확장
-- ----------------------------------------------------------------------------
--  · 마스터가 아이디 부여 시 이름(작성자)·부서·직급을 기본 세팅 → 공지/기록에 자동 사용.
--  · user_access 에 dept(부서 키)·title(직급) 추가. 이름은 마스터설정(ua.name) 우선,
--    없으면 본인이 첫 로그인에 넣은 user_metadata.name 폴백.
--  · me_access/admin_list_users 반환열 확장(반환형 변경 → drop 후 재생성).
--  · admin_set_access 에 p_name·p_dept·p_title 추가(기존 3인자 시그니처는 drop).
--  실행: Supabase SQL Editor. 18 이후. 멱등.
-- ============================================================================

alter table user_access add column if not exists dept  text;
alter table user_access add column if not exists title text;

-- ── 내 권한·프로필 조회(클라이언트 UI·작성자 기본값용) ──
drop function if exists me_access();
create function me_access()
returns table(role text, areas text[], name text, dept text, title text)
language plpgsql security definer set search_path = public stable as $$
begin
  return query
    select ua.role, ua.areas,
           coalesce(ua.name, (select raw_user_meta_data->>'name' from auth.users where id=auth.uid())),
           ua.dept, ua.title
    from user_access ua where ua.user_id = auth.uid();
  if not found then
    return query select 'staff'::text, '{}'::text[], null::text, null::text, null::text;
  end if;
end $$;
grant execute on function me_access() to authenticated;

-- ── 관리자: 전체 사용자 목록(부서·직급 포함) ──
drop function if exists admin_list_users();
create function admin_list_users()
returns table(user_id uuid, email text, name text, role text, areas text[], dept text, title text)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '권한 없음(관리자 전용)'; end if;
  return query
    select ua.user_id, u.email::text,
           coalesce(ua.name, u.raw_user_meta_data->>'name') as name,
           ua.role, ua.areas, ua.dept, ua.title
    from user_access ua join auth.users u on u.id = ua.user_id
    order by case ua.role when 'admin' then 0 when 'manager' then 1 else 2 end, u.email;
end $$;
grant execute on function admin_list_users() to authenticated;

-- ── 관리자: 권한 지정(이름·부서·직급 포함) ──
drop function if exists admin_set_access(uuid, text, text[]);
create function admin_set_access(p_user uuid, p_role text, p_areas text[],
                                 p_name text default null, p_dept text default null, p_title text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '권한 없음(관리자 전용)'; end if;
  if p_role not in ('admin','manager','staff') then raise exception '잘못된 role'; end if;
  update user_access
     set role=p_role, areas=coalesce(p_areas,'{}'),
         name=nullif(p_name,''), dept=nullif(p_dept,''), title=nullif(p_title,''),
         updated_at=now()
   where user_id=p_user;
end $$;
grant execute on function admin_set_access(uuid, text, text[], text, text, text) to authenticated;

-- ============================================================================
--  끝.
-- ============================================================================
