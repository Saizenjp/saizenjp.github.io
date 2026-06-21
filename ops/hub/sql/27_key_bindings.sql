-- ============================================================================
--  SaiZen Hub — 27 키택(키홀더) ↔ 팀 바인딩 (룸키 QR 모델 1)
-- ----------------------------------------------------------------------------
--  · fob_code = 키홀더 번호 / QR 페이로드(예 K001). 한 fob당 '활성' 바인딩 1개.
--  · 체크인: 팀↔fob 연결(active=true). 방 변경/키 스왑과 무관(팀 단위 바인딩) —
--    재바인딩(다른 팀에 연결)할 때만 기존 active를 내리고 새로 단다.
--  · POS: fob_code로 active 바인딩의 event_seq를 찾아 그 팀 주문화면으로.
--  · 체크아웃: active=false 로 해제 → 키홀더 재사용.
--  실행: Supabase SQL Editor. 01~09 이후. 멱등. RLS는 개발단계(authenticated 전체).
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists key_bindings (
  id         uuid        primary key default gen_random_uuid(),
  fob_code   text        not null,
  event_seq  bigint      references bookings(event_seq) on delete cascade,
  session_ym text,
  active     boolean     not null default true,
  bound_at   timestamptz not null default now(),
  unbound_at timestamptz,
  bound_by   text,
  note       text
);
create index if not exists idx_key_bindings_event on key_bindings(event_seq);
-- 한 fob_code 당 활성 바인딩은 1개만(부분 unique)
create unique index if not exists uq_key_bindings_active on key_bindings(fob_code) where active;

alter table key_bindings enable row level security;
drop policy if exists p_all_key_bindings on key_bindings;
create policy p_all_key_bindings on key_bindings for all to authenticated using (true) with check (true);

-- 확인:  select fob_code, event_seq from key_bindings where active order by fob_code;
-- ============================================================================
--  끝.
-- ============================================================================
