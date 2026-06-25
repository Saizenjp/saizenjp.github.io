-- ============================================================================
--  46_read_write_areas.sql — 영역별 '읽기/쓰기' 권한 분리
-- ----------------------------------------------------------------------------
--  기존: user_access.areas = 쓰기(=읽기 겸용) 영역.
--  추가: read_areas = '읽기 전용' 영역(쓰기는 areas, 읽기는 areas ∪ read_areas).
--   · 예) 프론트 직원에게 settle 'read_areas'만 주면 정산 조회는 되고 수정은 불가.
--   · admin/manager 처리·쓰기 정책은 기존(has_any_area) 그대로 — 하위호환.
--   · 민감 테이블 SELECT 정책만 읽기권한(has_any_read_area)로 교체. 기본값 read_areas='{}'
--     → 적용 즉시 기존 동작과 동일(아무도 추가 읽기권한 없음).
--  멱등 재실행 가능. ⚠ Supabase SQL Editor 수동 실행(19·39 이후).
-- ============================================================================

alter table user_access add column if not exists read_areas text[] not null default '{}';

-- 읽기권한 판정: admin 자동, 그 외 (쓰기영역 ∪ 읽기영역)이 대상과 겹치면 true.
create or replace function has_any_read_area(p_areas text[])
returns boolean language sql security definer set search_path = public stable as $$
  select exists(
    select 1 from user_access
    where user_id = auth.uid()
      and (role = 'admin' or (areas || read_areas) && p_areas)
  );
$$;
grant execute on function has_any_read_area(text[]) to authenticated;

create or replace function has_read_area(p_area text)
returns boolean language sql security definer set search_path = public stable as $$
  select has_any_read_area(array[p_area]);
$$;
grant execute on function has_read_area(text) to authenticated;

-- ── 민감 테이블 SELECT 정책을 읽기권한(has_any_read_area)로 교체(쓰기 정책은 불변) ──
--   각 테이블의 현재 읽기 허용 영역(19 + 39)을 그대로 유지하되 read_areas도 인정.
do $$
declare r record;
begin
  for r in select * from (values
    ('folios',       array['settle','pos','front']),
    ('charges',      array['settle','pos','front']),
    ('payments',     array['settle','pos','front']),
    ('transactions', array['settle','pos']),
    ('dining',       array['settle']),
    ('rounds',       array['settle']),
    ('fee_rules',    array['settle']),
    ('member_codes', array[]::text[])
  ) as t(tbl, areas) loop
    if to_regclass('public.'||r.tbl) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', r.tbl||'_sel', r.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (has_any_read_area(%L))',
                   r.tbl||'_sel', r.tbl, r.areas);
  end loop;
end $$;

-- ── me_access: read_areas 포함 반환 ──
drop function if exists me_access();
create or replace function me_access()
returns table(role text, areas text[], read_areas text[])
language plpgsql security definer set search_path = public stable as $$
begin
  return query select ua.role, ua.areas, ua.read_areas from user_access ua where ua.user_id = auth.uid();
  if not found then
    return query select 'staff'::text, '{}'::text[], '{}'::text[];
  end if;
end $$;
grant execute on function me_access() to authenticated;

-- ── admin_list_users: read_areas 포함 ──
drop function if exists admin_list_users();
create or replace function admin_list_users()
returns table(user_id uuid, email text, name text, role text, areas text[], read_areas text[])
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '권한 없음(관리자 전용)'; end if;
  return query
    select ua.user_id, u.email::text,
           coalesce(u.raw_user_meta_data->>'name', ua.name) as name,
           ua.role, ua.areas, ua.read_areas
    from user_access ua join auth.users u on u.id = ua.user_id
    order by case ua.role when 'admin' then 0 when 'manager' then 1 else 2 end, u.email;
end $$;
grant execute on function admin_list_users() to authenticated;

-- ── admin_set_access: 읽기영역 인자 추가(4-arg 신규, 기존 3-arg 유지) ──
create or replace function admin_set_access(p_user uuid, p_role text, p_areas text[], p_read_areas text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '권한 없음(관리자 전용)'; end if;
  if p_role not in ('admin','manager','staff') then raise exception '잘못된 role'; end if;
  update user_access
    set role = p_role, areas = coalesce(p_areas, '{}'), read_areas = coalesce(p_read_areas, '{}'), updated_at = now()
  where user_id = p_user;
end $$;
grant execute on function admin_set_access(uuid, text, text[], text[]) to authenticated;
