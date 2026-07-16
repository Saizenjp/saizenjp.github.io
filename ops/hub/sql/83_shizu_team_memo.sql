-- 83_shizu_team_memo.sql — 시즈노야도 예약표 現地메모(팀 단위 현장 수기)
--   · 메리트 현지비고(bookings.remark_local)=참고사항(읽기 전용)과 별개.
--   · 현장 담당자가 예약표에서 직접 기재하는 특이사항(長崎市20代·素泊り·以前の常連様·内湯あり 등).
--   · event_seq PK → bookings cascade. RLS: 읽기=로그인 전체 / 쓰기=room·shizu 영역(shizu_memo와 동일).
-- 멱등.
create table if not exists shizu_team_memo (
  event_seq  bigint primary key references bookings(event_seq) on delete cascade,
  note       text,
  updated_by text,
  updated_at timestamptz default now()
);
alter table shizu_team_memo enable row level security;

drop policy if exists shizu_team_memo_sel on shizu_team_memo;
create policy shizu_team_memo_sel on shizu_team_memo
  for select to authenticated using (true);

drop policy if exists shizu_team_memo_ins on shizu_team_memo;
create policy shizu_team_memo_ins on shizu_team_memo
  for insert to authenticated with check (has_any_area(ARRAY['room','shizu']));

drop policy if exists shizu_team_memo_upd on shizu_team_memo;
create policy shizu_team_memo_upd on shizu_team_memo
  for update to authenticated
  using (has_any_area(ARRAY['room','shizu']))
  with check (has_any_area(ARRAY['room','shizu']));

drop policy if exists shizu_team_memo_del on shizu_team_memo;
create policy shizu_team_memo_del on shizu_team_memo
  for delete to authenticated using (has_any_area(ARRAY['room','shizu']));
