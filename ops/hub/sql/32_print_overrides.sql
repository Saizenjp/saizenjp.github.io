-- ============================================================================
--  32_print_overrides.sql — 팀 인쇄물 수기 오버라이드(태그코드·인원) 저장
-- ----------------------------------------------------------------------------
--  /app/ tagTeamOverrideMap(태그) + dinnerPaxFor(인원)의 ops(Supabase) 영속화.
--   · 현장에서 팀 단위로 태그코드/인원을 고치면 어느 PC에서든 공유되고
--     航空カバー·夕食 인쇄에 반영. (네임택·手配書는 미적용 — /app/ 동일 범위)
--   · event_seq당 1행. 월 동기화로 정리(bookings cascade).
--   · 멱등 재실행 가능. ⚠ Supabase SQL Editor 수동 실행.
-- ============================================================================

create table if not exists print_overrides (
  event_seq     bigint       primary key references bookings(event_seq) on delete cascade,
  team_tag      text,                       -- 팀 대표 태그코드 오버라이드(전체 코드 "GFな-1Y", 비우면 자동값)
  pax_override  int,                         -- 夕食 인원 오버라이드(null=예약 인원 사용)
  session_ym    text,
  updated_by    text,
  updated_at    timestamptz  not null default now(),
  created_at    timestamptz  not null default now()
);
create index if not exists idx_print_overrides_ym on print_overrides(session_ym);

drop trigger if exists trg_print_overrides_updated on print_overrides;
create trigger trg_print_overrides_updated before update on print_overrides
  for each row execute function set_updated_at();

-- RLS: 태그·인원은 민감정보 아님 → 읽기=로그인 전체 / 쓰기=room 영역(또는 admin/manager)
do $$
declare pol record;
begin
  if to_regclass('public.print_overrides') is null then return; end if;
  execute 'alter table public.print_overrides enable row level security';
  for pol in select policyname from pg_policies where schemaname='public' and tablename='print_overrides' loop
    execute format('drop policy if exists %I on public.print_overrides', pol.policyname);
  end loop;
  execute 'create policy print_overrides_sel on public.print_overrides for select to authenticated using (true)';
  execute format('create policy print_overrides_ins on public.print_overrides for insert to authenticated with check (has_any_area(%L))', array['room']);
  execute format('create policy print_overrides_upd on public.print_overrides for update to authenticated using (has_any_area(%L)) with check (has_any_area(%L))', array['room'], array['room']);
  execute format('create policy print_overrides_del on public.print_overrides for delete to authenticated using (has_any_area(%L))', array['room']);
end $$;
