-- ============================================================================
-- 124_transfer_dispatch.sql — 송영 배차 입력(차량·기사·출발시각)
--
--  Min 2026-08: 기사용 송영표의 배차칸이 「행선지마다 빈칸」이 아니라
--   **시스템에 입력한 대로** 찍혀야 한다. 배차는 便 단위로 정해지고
--   한 便에 버스가 여러 대일 수 있으므로(대수는 사람이 정한다) seq 로 나눈다.
--
--  grp_key = 화면·인쇄가 便을 묶는 키와 같은 값
--    in/out : '${편명||-}|${시각}'   ·   stay : 숙소명
--  입력이 없는 便은 예전처럼 빈칸으로 인쇄된다(손기입 가능).
--
--  멱등. MCP 적용 완료. 번호 124.
-- ============================================================================
create table if not exists transfer_dispatch (
  id          uuid        primary key default gen_random_uuid(),
  work_date   date        not null,
  leg         text        not null,             -- 'in' | 'out' | 'stay'
  grp_key     text        not null,
  seq         integer     not null default 1,   -- 그 便 안에서 몇 번째 차인가
  vehicle     text, driver text, depart text, dest text, note text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (work_date, leg, grp_key, seq)
);
create index if not exists idx_tdisp_date on transfer_dispatch(work_date, leg);

drop trigger if exists trg_tdisp_updated on transfer_dispatch;
create trigger trg_tdisp_updated before update on transfer_dispatch
  for each row execute function set_updated_at();

alter table transfer_dispatch enable row level security;
-- 읽기=로그인 전체 / 쓰기=front·print·golf
drop policy if exists tdisp_sel on transfer_dispatch;
drop policy if exists tdisp_ins on transfer_dispatch;
drop policy if exists tdisp_upd on transfer_dispatch;
drop policy if exists tdisp_del on transfer_dispatch;
create policy tdisp_sel on transfer_dispatch for select to authenticated using (true);
create policy tdisp_ins on transfer_dispatch for insert to authenticated
  with check ( has_any_area(array['front','print','golf']) );
create policy tdisp_upd on transfer_dispatch for update to authenticated
  using ( has_any_area(array['front','print','golf']) ) with check ( has_any_area(array['front','print','golf']) );
create policy tdisp_del on transfer_dispatch for delete to authenticated
  using ( has_any_area(array['front','print','golf']) );

-- 확인용:
--   select work_date, leg, grp_key, seq, vehicle, driver, depart from transfer_dispatch order by work_date, leg, seq;
