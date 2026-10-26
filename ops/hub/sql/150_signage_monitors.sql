-- ============================================================================
-- 150_signage_monitors.sql — 안내 모니터 = 카드 1장(모니터 관리) + 모니터별 설정(레지스트리)
--
--  Min 2026-10-26 「모니터는 2대(1층·2층 엘리베이터 앞), 추후 추가 가능 · 둘 다 같은 정보도, 다른 내용도 띄울 수 있게」
--                 「안내 모니터가 다 나뉘어 있는데 하나의 카드에 들어가서 거기 안에서 모니터를 관리하는 게 낫지 않아?」
--   · 랜딩의 모니터 카드 5장(로비·디지털 월·코스·2층 석식·직원용) → 「안내 모니터」 카드 1장(ops/hub/monitors.html).
--     TV 는 모니터마다 주소 하나(signage.html?monitor=<id>)로 한 번만 열고, 무엇을 띄울지는 관리 화면에서 정한다
--     (TV 가 60초마다 설정을 다시 읽어 달라지면 그 자리에서 다시 연다 → TV 에 가지 않아도 1분 안에 바뀐다).
--   ① area_tree: signage 의 자식 4개(sign_lobby·sign_course·sign_dinner·sign_office)는 카드가 없어졌으므로 제거
--      → signage 는 board 처럼 트리 밖 단일 키. seed 는 saizen-core.js AREA_TREE 와 같아야 한다
--      (tests/saizen-core-areas.test.mjs 가 이 파일(최신 seed)을 읽어 대조) — 32행.
--   ② user_access: 자식 키만 가진 계정은 부모 signage 로 승계(수정은 수정·보기는 보기), 자식 키는 지운다 → 보이던 카드(이제 1장)가 사라지지 않는다.
--   ③ signage_monitors: 설치 장소별 모니터(화면 종류·테마·글자 배율·전환 초·로테이션 화면 …). ⚠ 151 에서 폐지(Min 「아까처럼 나누는 게 낫겠다」) — ①② 만 유효.
--      읽기 = anon 포함(TV 는 로그인 없음 — 화면 종류·배율뿐, 개인정보 없음) · 쓰기 = admin 또는 signage 영역.
--      RPC 추가 없음(anon 실행 가능 security definer 12개 유지 — 139).
--  멱등. Supabase MCP apply_migration 으로 적용.
-- ============================================================================

-- ① area_tree 재시드(32행) — signage 자식 제거
insert into public.area_tree(child, parent) values
  ('nametag','print'),('keyslip','print'),('aircover','print'),('dispatch','print'),('dinner','print'),('qrcards','print'),('transfer','print'),('notice','print'),
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
delete from public.area_tree where child not in ('nametag','keyslip','aircover','dispatch','dinner','qrcards','transfer','notice','frontdesk','inv_front','room_assign','occupancy','roomstats','inv_room','housekeeping','inv_hk','course','cart','inv_golf','kds','kds_front','inv_fnb','pos_front','pos_golf','pos_restaurant','pos_customer','settle_onsite','settle_merit','stats_mgmt','staycal','shizu_sheet','inv_shizu');

-- ② 기존 계정 승계: sign_* 자식 키 → 부모 signage (areas·read_areas 각각), 자식 키 제거
update public.user_access set
  areas = (select coalesce(array_agg(distinct x order by x),'{}'::text[]) from unnest(
             case when coalesce(areas,'{}'::text[]) && array['sign_lobby','sign_course','sign_dinner','sign_office']
                  then array_append(coalesce(areas,'{}'::text[]),'signage') else coalesce(areas,'{}'::text[]) end) x
           where x <> all(array['sign_lobby','sign_course','sign_dinner','sign_office'])),
  read_areas = (select coalesce(array_agg(distinct x order by x),'{}'::text[]) from unnest(
             case when coalesce(read_areas,'{}'::text[]) && array['sign_lobby','sign_course','sign_dinner','sign_office']
                  then array_append(coalesce(read_areas,'{}'::text[]),'signage') else coalesce(read_areas,'{}'::text[]) end) x
           where x <> all(array['sign_lobby','sign_course','sign_dinner','sign_office']))
where coalesce(areas,'{}'::text[]) && array['sign_lobby','sign_course','sign_dinner','sign_office']
   or coalesce(read_areas,'{}'::text[]) && array['sign_lobby','sign_course','sign_dinner','sign_office'];

-- ③ 모니터 레지스트리
create table if not exists public.signage_monitors (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{1,23}$'),   -- TV 주소에 쓰는 짧은 ID(ev1f·ev2f …)
  name_ko     text not null default '',
  name_ja     text not null default '',
  place       text not null default '',                                      -- 설치 장소 메모
  screen      text not null default 'lobby' check (screen in ('lobby','wall','dinner','course','office')),
  params      jsonb not null default '{}'::jsonb,                            -- theme·scale·rot·cut·refresh·rows·dark·panes (signage.html 주소 파라미터와 같은 키)
  sort        int  not null default 0,
  enabled     boolean not null default true,                                 -- 끄면 TV 는 「준비 중」
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.signage_monitors enable row level security;
grant select on public.signage_monitors to anon;
grant select, insert, update, delete on public.signage_monitors to authenticated;
drop policy if exists signage_monitors_read  on public.signage_monitors;
create policy signage_monitors_read  on public.signage_monitors for select to anon, authenticated using (true);
drop policy if exists signage_monitors_write on public.signage_monitors;
create policy signage_monitors_write on public.signage_monitors for all to authenticated
  using (is_admin() or has_any_area(array['signage'])) with check (is_admin() or has_any_area(array['signage']));
drop trigger if exists signage_monitors_updated_at on public.signage_monitors;
create trigger signage_monitors_updated_at before update on public.signage_monitors for each row execute function public.set_updated_at();

-- seed: Min 이 말한 2대(1층·2층 엘리베이터 앞). 추가는 관리 화면에서.
insert into public.signage_monitors(id, name_ko, name_ja, place, screen, params, sort) values
  ('ev1f', '1층 엘리베이터 앞', '1F エレベーター前', '1F', 'lobby',  '{}'::jsonb, 1),
  ('ev2f', '2층 엘리베이터 앞', '2F エレベーター前', '2F', 'dinner', '{}'::jsonb, 2)
on conflict (id) do nothing;
