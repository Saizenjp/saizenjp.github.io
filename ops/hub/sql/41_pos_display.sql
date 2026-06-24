-- ============================================================================
--  41_pos_display.sql — 손님 확인 화면(customer display) 연동
-- ----------------------------------------------------------------------------
--  직원 POS(pos.html)에서 「손님 화면 표시」를 누르면 그 팀(event_seq)을 station
--  단위로 기록 → 손님 앞 태블릿(pos_customer.html)이 이 행을 폴링해 해당 팀의
--  청구 내역·합계·잔액을 읽기전용으로 표시. (읽기전용 — 손님은 청구를 못 바꿈)
--   · station = 계산대 식별자(기본 'main'). 계산대가 여럿이면 station별 1행.
--   · 손님 태블릿도 직원 계정(pos/front/settle)으로 로그인된 세션으로 읽는다.
--  멱등. ⚠ Supabase SQL Editor 수동 실행.
-- ============================================================================

create table if not exists pos_display (
  station    text        primary key,
  event_seq  bigint      references bookings(event_seq) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- RLS: 읽기·쓰기 모두 pos/front/settle 영역(또는 admin) — 돈 화면과 동일 범위
do $$
declare pol record;
begin
  if to_regclass('public.pos_display') is null then return; end if;
  execute 'alter table public.pos_display enable row level security';
  for pol in select policyname from pg_policies where schemaname='public' and tablename='pos_display' loop
    execute format('drop policy if exists %I on public.pos_display', pol.policyname);
  end loop;
  execute format('create policy pos_display_sel on public.pos_display for select to authenticated using (has_any_area(%L))', array['pos','front','settle']);
  execute format('create policy pos_display_ins on public.pos_display for insert to authenticated with check (has_any_area(%L))', array['pos','front','settle']);
  execute format('create policy pos_display_upd on public.pos_display for update to authenticated using (has_any_area(%L)) with check (has_any_area(%L))', array['pos','front','settle'], array['pos','front','settle']);
  execute format('create policy pos_display_del on public.pos_display for delete to authenticated using (has_any_area(%L))', array['pos','front','settle']);
end $$;
