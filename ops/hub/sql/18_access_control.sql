-- ============================================================================
--  SaiZen Hub — 18 접근 권한(3단계 역할 + 카드별 권한)
-- ----------------------------------------------------------------------------
--  역할 3단계:
--    · admin   (마스터)      : 전 카드 + 권한 관리(남의 권한 지정)
--    · manager (관리 담당자)  : 전 카드 접근(통괄), 권한 관리는 불가
--    · staff   (일반 담당자)  : areas 에 지정된 카드만
--  카드(area) 키: step1 room settle notes pos kitchen menu (예정: golf dinner)
--
--  · 새 계정은 기본 staff + areas 비어있음(= 아무 카드도 못 봄, deny by default).
--  · 마스터가 admin.html 에서 각 계정 역할·카드를 지정한다.
--  · UI 게이트는 me_access()로, 서버 차단(RLS 2단계)은 has_area()로 한다.
--
--  실행: Supabase SQL Editor. 17 이후. 멱등.
--  ⚠ 맨 아래 "마스터 지정" 한 줄을 본인 이메일로 바꿔 1회 실행하세요.
-- ============================================================================

create table if not exists user_access (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  role       text        not null default 'staff' check (role in ('admin','manager','staff')),
  areas      text[]      not null default '{}',
  name       text,
  updated_at timestamptz not null default now()
);
alter table user_access enable row level security;

-- 본인 행만 직접 읽기 허용(자기 권한 확인용). 수정은 아래 admin 함수로만.
drop policy if exists ua_self_read on user_access;
create policy ua_self_read on user_access
  for select to authenticated using (user_id = auth.uid());

-- ── 새 가입자 자동 행 생성(기본 staff·권한없음) + 이름 메타 반영 ──
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into user_access(user_id, name)
  values (new.id, new.raw_user_meta_data->>'name')
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_new_user on auth.users;
create trigger trg_new_user after insert on auth.users
  for each row execute function handle_new_user();

-- 이미 가입된 사용자 백필
insert into user_access(user_id, name)
select id, raw_user_meta_data->>'name' from auth.users
on conflict (user_id) do nothing;

-- ── 내 권한 조회(클라이언트 UI 게이트용) ──
create or replace function me_access()
returns table(role text, areas text[])
language plpgsql security definer set search_path = public stable as $$
begin
  return query select ua.role, ua.areas from user_access ua where ua.user_id = auth.uid();
  if not found then
    return query select 'staff'::text, '{}'::text[];
  end if;
end $$;
grant execute on function me_access() to authenticated;

-- ── 영역 접근 판정(RLS 2단계에서 사용) ──
create or replace function has_area(p_area text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(
    select 1 from user_access
    where user_id = auth.uid()
      and (role in ('admin','manager') or p_area = any(areas))
  );
$$;
grant execute on function has_area(text) to authenticated;

create or replace function is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from user_access where user_id = auth.uid() and role = 'admin');
$$;
grant execute on function is_admin() to authenticated;

-- ── 관리자: 전체 사용자 목록(이메일 포함) ──
create or replace function admin_list_users()
returns table(user_id uuid, email text, name text, role text, areas text[])
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '권한 없음(관리자 전용)'; end if;
  return query
    select ua.user_id, u.email::text,
           coalesce(u.raw_user_meta_data->>'name', ua.name) as name,   -- 로그인 시 설정한 이름 우선
           ua.role, ua.areas
    from user_access ua join auth.users u on u.id = ua.user_id
    order by case ua.role when 'admin' then 0 when 'manager' then 1 else 2 end, u.email;
end $$;
grant execute on function admin_list_users() to authenticated;

-- ── 관리자: 권한 지정 ──
create or replace function admin_set_access(p_user uuid, p_role text, p_areas text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '권한 없음(관리자 전용)'; end if;
  if p_role not in ('admin','manager','staff') then raise exception '잘못된 role'; end if;
  update user_access
    set role = p_role, areas = coalesce(p_areas, '{}'), updated_at = now()
  where user_id = p_user;
end $$;
grant execute on function admin_set_access(uuid, text, text[]) to authenticated;

-- ============================================================================
--  ⚠ 마스터(Min) 지정 — 아래 이메일을 본인 로그인 이메일로 바꿔 1회 실행
-- ----------------------------------------------------------------------------
--  update user_access set role='admin', updated_at=now()
--    where user_id = (select id from auth.users where email='MIN-EMAIL@example.com');
-- ============================================================================
--  끝.
-- ============================================================================
