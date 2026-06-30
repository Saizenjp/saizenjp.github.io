-- ============================================================================
--  57_shizu_onsen.sql — 志津の宿 別棟 온천 사전신청(개인별)
-- ----------------------------------------------------------------------------
--  志津の宿 予約表(ops shizu.html)의 別棟(吉祥·瑞雲·馬酔木) 개인온천 사전신청.
--   · member_id = guest_members.id(개인). 사전신청한 사람만 행 존재(=applied true).
--   · 객실료 ¥17,000은 本館·別棟 동일. 사전신청 인·박 × ¥2,000(SHZ_ONSEN)만 별도 집계.
--   · 배정 자체는 room.html(rooms 테이블)이 소유 — 이 테이블은 온천 신청 플래그만.
--  RLS: 읽기=로그인 전체 / 쓰기=room·print 영역(또는 admin) — dinner_addons(43)와 동일.
--  멱등 재실행 가능. ⚠ Supabase SQL Editor 수동 실행(또는 MCP). 56 이후.
-- ============================================================================

create table if not exists shizu_onsen (
  member_id   uuid    primary key references guest_members(id) on delete cascade,
  applied     boolean not null default true,
  session_ym  text,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

do $$
declare pol record;
begin
  if to_regclass('public.shizu_onsen') is null then return; end if;
  execute 'alter table public.shizu_onsen enable row level security';
  for pol in select policyname from pg_policies where schemaname='public' and tablename='shizu_onsen' loop
    execute format('drop policy if exists %I on public.shizu_onsen', pol.policyname);
  end loop;
  execute 'create policy shizu_onsen_sel on public.shizu_onsen for select to authenticated using (true)';
  execute format('create policy shizu_onsen_ins on public.shizu_onsen for insert to authenticated with check (has_any_area(%L))', array['room','print']);
  execute format('create policy shizu_onsen_upd on public.shizu_onsen for update to authenticated using (has_any_area(%L)) with check (has_any_area(%L))', array['room','print'], array['room','print']);
  execute format('create policy shizu_onsen_del on public.shizu_onsen for delete to authenticated using (has_any_area(%L))', array['room','print']);
end $$;
