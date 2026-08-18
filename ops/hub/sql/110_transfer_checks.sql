-- ============================================================================
--  110_transfer_checks.sql — 송영 현장 점검(태블릿)
-- ----------------------------------------------------------------------------
--  송영표는 두 사람이 서로 다른 것을 본다(Min 2026-08).
--   · 기사   = 便별 운행표(어느 편·몇 명·어디로). 이름은 필요 없다 → 便·팀 단위 체크.
--   · 미팅/샌딩 직원 = 손님을 맞이하러 가는 사람. **이름 명단**이 필요하다 → 개인 단위 체크.
--  태블릿에서 체크하고, 태블릿이 없으면 인쇄물로 대신한다.
--
--   kind='team'   → ref = event_seq        (기사 화면: 그 팀 승차 완료)
--   kind='member' → ref = guest_members.id (미팅 화면: 그 사람 확인 완료)
--  leg = 'in'(공항→숙소) / 'out'(숙소→공항). 같은 날 왕복이 섞이므로 분리한다.
--  RLS = 읽기 로그인 전체 · 쓰기 front·print·room 영역(프론트·송영 담당).
--  멱등. ⚠ Supabase SQL Editor 수동 실행(또는 MCP apply_migration).
-- ============================================================================

create table if not exists transfer_checks (
  work_date  date   not null,
  leg        text   not null check (leg in ('in','out')),
  kind       text   not null check (kind in ('team','member')),
  ref        text   not null,
  event_seq  bigint,
  done_by    text,
  done_at    timestamptz not null default now(),
  primary key (work_date, leg, kind, ref)
);
create index if not exists idx_transfer_checks_day on transfer_checks(work_date, leg);

alter table transfer_checks enable row level security;
drop policy if exists tfc_sel on transfer_checks;
create policy tfc_sel on transfer_checks for select to authenticated using (true);
drop policy if exists tfc_ins on transfer_checks;
create policy tfc_ins on transfer_checks for insert to authenticated
  with check (has_any_area(array['front','print','room']));
drop policy if exists tfc_upd on transfer_checks;
create policy tfc_upd on transfer_checks for update to authenticated
  using (has_any_area(array['front','print','room'])) with check (has_any_area(array['front','print','room']));
drop policy if exists tfc_del on transfer_checks;
create policy tfc_del on transfer_checks for delete to authenticated
  using (has_any_area(array['front','print','room']));

-- 확인:
--   select leg, kind, count(*) from transfer_checks where work_date = current_date group by 1,2;
