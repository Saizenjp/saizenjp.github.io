-- ============================================================================
--  107_hk_done.sql — 객실 청소 진행 상태(완료 체크)
-- ----------------------------------------------------------------------------
--  Min 2026-08: "청소 완료 ○○시까지 진행 · 어디까지 확인되고 뭘 해야 하는지"
--  청소 화면이 '보기 전용'이라 현장이 어디까지 했는지 알 수 없었다.
--  방 × 날짜 × 작업종류 로 완료를 남긴다(누가·언제).
--    kind = 'clean'(퇴실/체류 청소) · 'towel'(타월 교체)
--  행이 있으면 완료, 지우면 미완료 = 토글.
--  RLS: 읽기=로그인 전체 · 쓰기=hk(객실청소) 또는 room 영역.
--  멱등. ⚠ Supabase SQL Editor 수동 실행(또는 MCP). 106 이후.
-- ============================================================================

create table if not exists hk_done (
  work_date    date not null,
  inventory_id uuid not null references room_inventory(id) on delete cascade,
  kind         text not null check (kind in ('clean','towel')),
  done_by      text,
  done_at      timestamptz not null default now(),
  primary key (work_date, inventory_id, kind)
);
create index if not exists idx_hk_done_date on hk_done(work_date);

alter table hk_done enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='hk_done' and policyname='hk_done_read') then
    create policy hk_done_read on hk_done for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='hk_done' and policyname='hk_done_write') then
    create policy hk_done_write on hk_done for all to authenticated
      using (has_any_area(array['hk','room'])) with check (has_any_area(array['hk','room']));
  end if;
end $$;
