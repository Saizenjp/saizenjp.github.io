-- ============================================================================
--  68_shizu_memo.sql — 시즈노야도 예약표 날짜별 담당자 메모(영속)
-- ----------------------------------------------------------------------------
--  予約表 到着/メモ 칸을 세션 한정이 아니라 저장되게. 날짜(그날 밤) 단위.
--  RLS: 읽기=로그인 전체 / 쓰기=room·shizu 영역(+admin 자동).
--  멱등. ⚠ 수동/MCP 적용.
-- ============================================================================

create table if not exists public.shizu_memo(
  memo_date date primary key,
  note text,
  updated_by text,
  updated_at timestamptz default now()
);
alter table public.shizu_memo enable row level security;
drop policy if exists shizu_memo_sel on public.shizu_memo;
create policy shizu_memo_sel on public.shizu_memo for select to authenticated using (true);
drop policy if exists shizu_memo_ins on public.shizu_memo;
create policy shizu_memo_ins on public.shizu_memo for insert to authenticated with check (has_any_area(array['room','shizu']));
drop policy if exists shizu_memo_upd on public.shizu_memo;
create policy shizu_memo_upd on public.shizu_memo for update to authenticated using (has_any_area(array['room','shizu'])) with check (has_any_area(array['room','shizu']));
