-- ============================================================================
-- 138_area_tree.sql — 접근 권한 세부 영역(부모 그룹 → 자식 화면) 트리
--
--  Min 2026-09 「관리 권한 설정 좀 더 세부적으로 나눠서 체크할 수 있게」「일별 체류 현황만 열고 싶고」.
--  · 기존 영역 키(print·front·room·hk·golf·kitchen·pos·settle·stats·shizu)는 **그룹(부모)** 으로 남고,
--    카드(화면) 단위 **자식 키**가 생긴다(nametag·dinner·frontdesk·room_assign·staycal …). 단일 진실원 = saizen-core.js AREA_TREE.
--  · area_expand(keys) = 보유 키 → 부모면 자식 전부, 자식이면 부모도 포함한 실효 키.
--    has_area / has_any_area / has_any_read_area 가 이 실효 키로 판정한다 → **기존 RLS 정책(그룹 키)은 손대지 않는다**.
--    ⚠ 뜻: 자식 키 하나라도 가지면 그 그룹의 DB 쓰기는 그룹 수준으로 열린다(세부 구분은 화면·카드 단위, DB 보호는 그룹 단위).
--      돈이 걸린 RPC(exec_stats·booking_trend)는 자식 키 'stats_mgmt'(또는 부모 'stats')를 직접 검사해 'staycal'만으론 못 부른다.
--  · 기존 사용자는 부모 키를 가지고 있으므로 접근 변화 없음.
-- ============================================================================

create table if not exists public.area_tree (
  child  text primary key,
  parent text not null
);
alter table public.area_tree enable row level security;
drop policy if exists area_tree_read on public.area_tree;
create policy area_tree_read on public.area_tree for select to authenticated using (true);

--  seed — saizen-core.js AREA_TREE 와 같아야 한다(tests/saizen-core-areas.test.mjs 가 이 파일을 읽어 대조)
insert into public.area_tree(child, parent) values
  ('nametag','print'),('keyslip','print'),('aircover','print'),('dispatch','print'),('dinner','print'),('qrcards','print'),('transfer','print'),('notice','print'),('signage','print'),
  ('frontdesk','front'),('inv_front','front'),
  ('room_assign','room'),('occupancy','room'),('roomstats','room'),('inv_room','room'),
  ('housekeeping','hk'),('inv_hk','hk'),
  ('course','golf'),('cart','golf'),('inv_golf','golf'),
  ('kds','kitchen'),('kds_front','kitchen'),('inv_fnb','kitchen'),
  ('pos_front','pos'),('pos_golf','pos'),('pos_restaurant','pos'),('pos_customer','pos'),
  ('settle_onsite','settle'),('settle_merit','settle'),
  ('stats_mgmt','stats'),('staycal','stats'),
  ('shizu_sheet','shizu'),('inv_shizu','shizu')
on conflict (child) do update set parent = excluded.parent;
delete from public.area_tree where child not in (
  'nametag','keyslip','aircover','dispatch','dinner','qrcards','transfer','notice','signage',
  'frontdesk','inv_front','room_assign','occupancy','roomstats','inv_room','housekeeping','inv_hk',
  'course','cart','inv_golf','kds','kds_front','inv_fnb','pos_front','pos_golf','pos_restaurant','pos_customer',
  'settle_onsite','settle_merit','stats_mgmt','staycal','shizu_sheet','inv_shizu');

create or replace function public.area_expand(p_keys text[])
returns text[] language sql stable set search_path = public as $$
  select coalesce(array_agg(distinct x), '{}'::text[]) from (
    select unnest(coalesce(p_keys,'{}'::text[])) as x
    union select t.child  from area_tree t where t.parent = any(coalesce(p_keys,'{}'::text[]))
    union select t.parent from area_tree t where t.child  = any(coalesce(p_keys,'{}'::text[]))
  ) s;
$$;

--  권한 헬퍼 3종 — 본문만 실효 키로 바꾼다(권한 부여(grant)·security definer 는 create or replace 로 그대로 유지)
create or replace function public.has_any_area(p_areas text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from user_access
    where user_id = auth.uid() and active
      and (role = 'admin' or area_expand(areas) && p_areas)
  );
$$;
create or replace function public.has_area(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from user_access
    where user_id = auth.uid() and active
      and (role in ('admin','manager') or p_area = any(area_expand(areas)))
  );
$$;
create or replace function public.has_any_read_area(p_areas text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from user_access
    where user_id = auth.uid() and active
      and (role = 'admin' or area_expand(areas || read_areas) && p_areas)
  );
$$;

--  돈이 걸린 RPC: 'stats' 부모 또는 'stats_mgmt' 자식만(캘린더 전용 staycal 은 불가) — 본문의 조건식만 치환
do $mig$
declare r record; src text;
begin
  for r in select p.oid, p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('exec_stats','booking_trend') loop
    select prosrc into src from pg_proc where oid = r.oid;
    if position($q$'stats' = any(coalesce(v_areas,'{}'))$q$ in src) > 0 then
      src := replace(src, $q$'stats' = any(coalesce(v_areas,'{}'))$q$, $q$coalesce(v_areas,'{}') && array['stats','stats_mgmt']$q$);
      execute format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path = public as %L',
        r.proname, pg_get_function_arguments(r.oid), pg_get_function_result(r.oid), src);
    end if;
  end loop;
end $mig$;
