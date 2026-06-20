-- ============================================================================
--  SaiZen Hub — 18 가입코드(셀프 회원가입 소프트 게이트)
-- ----------------------------------------------------------------------------
--  목적: 현장 담당자가 ops 로그인 화면에서 [회원가입]으로 직접 계정을 만들되,
--        "현장만 아는 가입코드"를 입력해야만 가입되게 한다(외부인 차단).
--        코드는 이 테이블(서버)에만 두고, 공개 JS·저장소엔 절대 넣지 않는다.
--
--  동작: 가입 UI → rpc verify_signup_code(코드) 로 서버에서 일치 확인 →
--        통과 시 supabase.auth.signUp 진행.
--
--  ⚠ 보안 수준: 정적 사이트 특성상 작정한 공격자는 signUp API 직접 호출로
--     우회 가능(소프트 게이트). 강한 보안이 필요하면 Edge Function 으로 전환.
--
--  ⚠ 함께 해야 할 Supabase 설정(대시보드):
--    · Authentication → Providers → Email → "Allow new users to sign up" = ON
--    · 같은 화면 "Confirm email" = OFF  (가입 즉시 로그인되게. ON이면 확인메일 필요)
--
--  실행: Supabase SQL Editor. 17 이후. 멱등.
--  ⚠ 아래 'CHANGE-ME-2026' 을 실제 가입코드로 바꾼 뒤 실행하세요(현장에 공유할 값).
-- ============================================================================

-- 비밀값 보관 테이블 — 직접 SELECT 불가(RLS 기본 거부). 함수로만 접근.
create table if not exists app_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table app_secrets enable row level security;
-- 정책을 만들지 않음 → anon·authenticated 모두 직접 읽기/쓰기 불가.
-- 아래 security definer 함수만 이 테이블을 읽는다.
revoke all on table app_secrets from anon, authenticated;

-- 가입코드 초기값(이미 있으면 유지). ⚠ 아래 값을 실제 코드로 바꿔 실행.
insert into app_secrets(key, value) values ('signup_code', 'CHANGE-ME-2026')
  on conflict (key) do nothing;

-- 코드 검증 함수: 일치하면 true. 코드 자체는 반환하지 않음(노출 방지).
create or replace function verify_signup_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from app_secrets
    where key = 'signup_code' and value = p_code
  );
$$;

-- anon(미로그인)도 가입 전 검증을 호출해야 하므로 실행 권한 부여.
grant execute on function verify_signup_code(text) to anon, authenticated;

-- ── 가입코드 변경(운영 중 바꾸려면 이 줄만 실행) ──
--   update app_secrets set value='새코드', updated_at=now() where key='signup_code';

-- ── 확인 ──
--   select verify_signup_code('테스트값');   -- true/false

-- ============================================================================
--  끝.
-- ============================================================================
