-- ============================================================================
--  30_settle_b2b.sql — 現地精算表(메리트투어 ↔ 사이젠 B2B 정산) 저장층
-- ----------------------------------------------------------------------------
--  · ⑤ 現地精算表(B2B 선계약 금액)은 bookings 기반으로 매번 계산(숙박비=인원×박수×단가,
--    송영비=인원×6000, 단가=숙소별 고정). 계산 결과는 저장하지 않는다.
--  · 사람이 입력하는 두 가지만 영속화:
--      1) settle_remarks   : 행사별 비고(메모) — event_seq당 1행
--      2) settle_deductions : 월별 차감 항목(쿠폰·선납 등) — 자유 다건
--  · 금액(돈) = 민감 데이터 → 읽기·쓰기 모두 'settle' 영역 권한자(+admin/manager)만.
--  · 멱등 재실행 가능.
--  실행: Supabase SQL Editor 에 그대로 붙여넣기.
-- ============================================================================

-- ── 1) 행사별 비고 (現地精算表 備考) ─────────────────────────────────────────
create table if not exists settle_remarks (
  event_seq   bigint       primary key references bookings(event_seq) on delete cascade,
  remark      text,
  updated_by  text,
  updated_at  timestamptz  not null default now(),
  created_at  timestamptz  not null default now()
);

drop trigger if exists trg_settle_remarks_updated on settle_remarks;
create trigger trg_settle_remarks_updated before update on settle_remarks
  for each row execute function set_updated_at();

-- ── 2) 월별 차감 항목 (보증금 쿠폰·장기숙박 쿠폰·선납 등) ────────────────────
create table if not exists settle_deductions (
  id          uuid         primary key default gen_random_uuid(),
  session_ym  text         not null,                 -- 월 세션 "2026-06"
  dtype       text         not null default '기타 선납', -- 유형(보증금 예약 쿠폰 등)
  amount      numeric(14,0) not null default 0,       -- 차감 금액(¥)
  label       text,                                   -- 항목 내용
  target      text,                                   -- 대상 그룹/고객명
  remarks     text,
  updated_by  text,
  sort_no     int          not null default 0,
  updated_at  timestamptz  not null default now(),
  created_at  timestamptz  not null default now()
);
create index if not exists idx_settle_deductions_ym on settle_deductions(session_ym);

drop trigger if exists trg_settle_deductions_updated on settle_deductions;
create trigger trg_settle_deductions_updated before update on settle_deductions
  for each row execute function set_updated_at();

-- ── RLS: 금액=민감 → 읽기·쓰기 모두 settle 영역(또는 admin/manager)만 ─────────
do $$
declare r record; pol record;
begin
  for r in select unnest(array['settle_remarks','settle_deductions']) as tbl loop
    if to_regclass(format('public.%I', r.tbl)) is null then continue; end if;
    execute format('alter table public.%I enable row level security', r.tbl);
    for pol in select policyname from pg_policies where schemaname='public' and tablename=r.tbl loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, r.tbl);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (has_any_area(%L))',
                   r.tbl||'_sel', r.tbl, array['settle']);
    execute format('create policy %I on public.%I for insert to authenticated with check (has_any_area(%L))',
                   r.tbl||'_ins', r.tbl, array['settle']);
    execute format('create policy %I on public.%I for update to authenticated using (has_any_area(%L)) with check (has_any_area(%L))',
                   r.tbl||'_upd', r.tbl, array['settle'], array['settle']);
    execute format('create policy %I on public.%I for delete to authenticated using (has_any_area(%L))',
                   r.tbl||'_del', r.tbl, array['settle']);
  end loop;
end $$;
