-- ============================================================================
--  49_account_block.sql — 계정 차단(비활성) 토글
-- ----------------------------------------------------------------------------
--  목적: admin.html 에서 담당자 계정을 즉시 「차단/해제」(되돌리기 쉬운 소프트 차단).
--    · user_access.active=false → 권한 판정 함수 전부 false(서버 RLS 차단)
--      + me_access 가 active=false 반환 → 페이지 가드가 전면 차단 오버레이.
--    · 마스터(admin)·본인 계정은 차단 불가(자기 잠금 방지). 영구 말소는 Dashboard.
--  멱등. ⚠ Supabase SQL Editor 수동 실행(48 이후). (이미 MCP로 적용)
-- ============================================================================

alter table user_access add column if not exists active boolean not null default true;

-- ── 권한 판정 함수에 active 게이트 추가(비활성=전부 false) ──
create or replace function has_area(p_area text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(
    select 1 from user_access
    where user_id = auth.uid() and active
      and (role in ('admin','manager') or p_area = any(areas))
  );
$$;

create or replace function has_any_area(p_areas text[])
returns boolean language sql security definer set search_path = public stable as $$
  select exists(
    select 1 from user_access
    where user_id = auth.uid() and active
      and (role = 'admin' or areas && p_areas)
  );
$$;

create or replace function has_any_read_area(p_areas text[])
returns boolean language sql security definer set search_path = public stable as $$
  select exists(
    select 1 from user_access
    where user_id = auth.uid() and active
      and (role = 'admin' or (areas || read_areas) && p_areas)
  );
$$;

-- ── me_access: active 포함 반환(가드가 비활성 차단 판단) ──
drop function if exists me_access();
create or replace function me_access()
returns table(role text, areas text[], read_areas text[], name text, dept text, title text, active boolean)
language plpgsql security definer set search_path = public stable as $$
begin
  return query select ua.role, ua.areas, ua.read_areas, ua.name, ua.dept, ua.title, ua.active
               from user_access ua where ua.user_id = auth.uid();
  if not found then
    return query select 'staff'::text, '{}'::text[], '{}'::text[], ''::text, ''::text, ''::text, true;
  end if;
end $$;
grant execute on function me_access() to authenticated;

-- ── admin_list_users: active 포함(목록에 차단 상태 표기) ──
drop function if exists admin_list_users();
create or replace function admin_list_users()
returns table(user_id uuid, email text, name text, role text, areas text[], read_areas text[], dept text, title text, active boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '권한 없음(관리자 전용)'; end if;
  return query
    select ua.user_id, u.email::text,
           coalesce(nullif(ua.name, ''), u.raw_user_meta_data->>'name') as name,
           ua.role, ua.areas, ua.read_areas, ua.dept, ua.title, ua.active
    from user_access ua join auth.users u on u.id = ua.user_id
    order by case ua.role when 'admin' then 0 when 'manager' then 1 else 2 end, u.email;
end $$;
grant execute on function admin_list_users() to authenticated;

-- ── admin_set_active: 차단/해제(마스터·본인 보호) ──
create or replace function admin_set_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '권한 없음(관리자 전용)'; end if;
  if p_user = auth.uid() then raise exception '본인 계정은 차단할 수 없습니다'; end if;
  if exists(select 1 from user_access where user_id = p_user and role = 'admin') then
    raise exception '마스터(admin) 계정은 차단할 수 없습니다 — 영구 처리는 Supabase Dashboard에서';
  end if;
  update user_access set active = coalesce(p_active, true), updated_at = now()
  where user_id = p_user;
end $$;
grant execute on function admin_set_active(uuid, boolean) to authenticated;
