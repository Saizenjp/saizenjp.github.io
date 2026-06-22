-- ════════════════════════════════════════════════════════════════
-- 28_access_requests.sql — 가입(계정 발급) 요청
--   처음 접속한 사람이 로그인 카드에서 "가입 요청"을 보내면 여기 쌓이고,
--   마스터(admin)가 admin.html 에서 검토 후 Supabase 에서 초대를 발급한다.
--   ※ 자가 회원가입은 계속 OFF. 이 테이블은 '요청'일 뿐 계정이 아니다.
--   멱등(idempotent). 수동 실행. 번호 28.
-- ════════════════════════════════════════════════════════════════

create table if not exists access_requests (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  dept        text,
  message     text,
  status      text not null default 'pending',   -- pending / approved / rejected
  created_at  timestamptz not null default now(),
  handled_by  text,
  handled_at  timestamptz
);
create index if not exists idx_access_requests_status on access_requests(status, created_at desc);

-- 테이블 권한(Supabase: anon/authenticated 역할에 명시적 grant 필요)
grant insert on access_requests to anon, authenticated;
grant select, update, delete on access_requests to authenticated;

alter table access_requests enable row level security;

-- ── 제출: 미로그인(anon) 포함 누구나 등록 가능 (요청일 뿐, 계정 아님) ──
drop policy if exists ar_insert_any on access_requests;
create policy ar_insert_any on access_requests
  for insert to anon, authenticated
  with check (true);

-- ── 조회: admin·manager 만 ──
drop policy if exists ar_read_admin on access_requests;
create policy ar_read_admin on access_requests
  for select to authenticated
  using (exists(select 1 from user_access where user_id = auth.uid() and role in ('admin','manager')));

-- ── 상태 처리(승인/거절 표시): admin·manager 만 ──
drop policy if exists ar_update_admin on access_requests;
create policy ar_update_admin on access_requests
  for update to authenticated
  using   (exists(select 1 from user_access where user_id = auth.uid() and role in ('admin','manager')))
  with check (exists(select 1 from user_access where user_id = auth.uid() and role in ('admin','manager')));

-- ── 삭제: admin 만 ──
drop policy if exists ar_delete_admin on access_requests;
create policy ar_delete_admin on access_requests
  for delete to authenticated
  using (exists(select 1 from user_access where user_id = auth.uid() and role = 'admin'));
