-- ============================================================================
--  43_dinner_addons.sql — 夕食 別注(추가/업그레이드 메뉴) + 알레르기·식이제한
-- ----------------------------------------------------------------------------
--  夕食オーダー 발주용. 해당 날짜(order_date) + 팀(event_seq) 단위로
--   · kind='add'      추가메뉴(기본 석식에 더해 별도 주문 — 석식 수량 영향 없음)
--   · kind='upgrade'  업그레이드메뉴(기본 석식 대신 → 그 인원만큼 석식 기본 수량에서 차감)
--   · kind='allergy'  알레르기/식이제한(고기·생선·돼지고기·기타 — 인쇄물 빨강 강조)
--  인쇄: 「別注）刺身盛¥7,500×1台 ←DJわ④名」 형식(빨강 굵게).
--  멱등 재실행 가능. ⚠ Supabase SQL Editor 수동 실행.
--  RLS: 읽기=로그인 전체 / 쓰기=room·print 영역(또는 admin/manager) — print_overrides(32/38)와 동일.
-- ============================================================================

create table if not exists dinner_addons (
  id          bigint generated always as identity primary key,
  order_date  date    not null,                                   -- 발주 날짜(석식일)
  event_seq   bigint  references bookings(event_seq) on delete cascade,
  kind        text    not null check (kind in ('add','upgrade','allergy')),
  item        text    not null,                                   -- 메뉴명 또는 알레르기 내용
  price       int,                                                -- 단가(¥) — add/upgrade
  qty         int,                                                -- 수량(인분·台 등)
  unit        text,                                               -- '人前' | '台' 등
  note        text,
  session_ym  text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_dinner_addons_date on dinner_addons(order_date);
create index if not exists idx_dinner_addons_seq  on dinner_addons(event_seq);

do $$
declare pol record;
begin
  if to_regclass('public.dinner_addons') is null then return; end if;
  execute 'alter table public.dinner_addons enable row level security';
  for pol in select policyname from pg_policies where schemaname='public' and tablename='dinner_addons' loop
    execute format('drop policy if exists %I on public.dinner_addons', pol.policyname);
  end loop;
  execute 'create policy dinner_addons_sel on public.dinner_addons for select to authenticated using (true)';
  execute format('create policy dinner_addons_ins on public.dinner_addons for insert to authenticated with check (has_any_area(%L))', array['room','print']);
  execute format('create policy dinner_addons_upd on public.dinner_addons for update to authenticated using (has_any_area(%L)) with check (has_any_area(%L))', array['room','print'], array['room','print']);
  execute format('create policy dinner_addons_del on public.dinner_addons for delete to authenticated using (has_any_area(%L))', array['room','print']);
end $$;
