-- 44_settle_extras.sql — 現地精算表 팀별 가산/차감(기타) 항목 (MCP 적용 완료)
-- 메리트에서 더/덜 받을 것(별채 사전신청비·싱글차지 등)을 팀 단위로 붙여 합계에 반영.
create table if not exists settle_extras (
  id uuid primary key default gen_random_uuid(),
  event_seq bigint not null references bookings(event_seq) on delete cascade,
  etype text not null default '기타',
  is_add boolean not null default true,        -- true=가산(+) / false=차감(-)
  amount numeric(14,0) not null default 0,
  note text, session_ym text, updated_by text, sort_no int not null default 0,
  updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index if not exists idx_settle_extras_event on settle_extras(event_seq);
create index if not exists idx_settle_extras_ym on settle_extras(session_ym);
drop trigger if exists trg_settle_extras_updated on settle_extras;
create trigger trg_settle_extras_updated before update on settle_extras for each row execute function set_updated_at();
alter table settle_extras enable row level security;
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='settle_extras' loop
    execute format('drop policy if exists %I on public.settle_extras', pol.policyname); end loop;
  create policy settle_extras_sel on public.settle_extras for select to authenticated using (has_any_area(array['settle']));
  create policy settle_extras_ins on public.settle_extras for insert to authenticated with check (has_any_area(array['settle']));
  create policy settle_extras_upd on public.settle_extras for update to authenticated using (has_any_area(array['settle'])) with check (has_any_area(array['settle']));
  create policy settle_extras_del on public.settle_extras for delete to authenticated using (has_any_area(array['settle']));
end $$;
