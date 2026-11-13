-- ============================================================
-- 170_security_hardening.sql — 보안 정리 3건 (2026-11-12 승인 「보안 SQL 적용해」)
--   2026-11 전체 검수에서 확인한 것 가운데 화면에 영향이 없는 세 가지.
--   적용 = MCP apply_migration. 보안 수정이라 적용한 뒤에 이 파일로 기록했다.
--   멱등 — 다시 실행해도 같은 상태가 된다.
--
--  ① 백업 표 2개 삭제
--     2026-10-25 코스 배정표 중복 정리 때 `create table … as` 로 만든 백업
--     (_bak_golf_groups_dup_20261025 69행 · _bak_golf_group_members_dup_20261025 236행).
--     public 스키마의 새 표는 anon·authenticated 권한을 기본으로 받고, `create table … as` 는
--     RLS 를 켜지 않는다 → 두 표는 로그인 없이 읽고 쓸 수 있는 상태였다.
--     그날이 지나 되돌릴 일이 없는 백업이라 표를 지운다.
--     ※ 앞으로 백업 표를 만들면 그 자리에서 `alter table … enable row level security` 를 걸고,
--       쓸 일이 끝나면 지운다. 00_VERIFY 170 이 「public 에 RLS 가 꺼진 표 0개」를 본다.
--
--  ② audit_prune(변경 이력 정리) — 권한 확인이 「행 없음」일 때 통과하던 것
--     종전: if not (select … from user_access where user_id = auth.uid() and active) then raise …
--           권한 행이 없거나 비활성이면 서브쿼리가 NULL 이고, `if not NULL` 은 참이 아니라서
--           raise 를 건너뛰었다(1개월 넘은 이력을 지울 수 있었다 — 돈·권한 표의 이력은 본문이 제외).
--     수정: coalesce(…, false) — 활성 마스터일 때만 통과한다. 본문의 나머지는 그대로다.
--     ※ 로그인 정보 없이 부르는 호출(SQL Editor — auth.uid() 가 null)도 이제 거부된다.
--       data_audit 등 다른 마스터 전용 함수와 같은 동작이다.
--
--  ③ take_booking_snapshot(예약 스냅샷) — 로그인 사용자의 실행 권한 회수
--     권한 확인이 없는 security definer 함수라, 로그인한 계정이면 임의 날짜의 스냅샷
--     (예약 추이의 비교 기준)을 덮어쓸 수 있었다. 이 함수를 부르는 화면은 없다 —
--     매일 00:00(JST)의 pg_cron 작업 booking_snapshot_daily 만 부르고, 그 작업은 함수 소유자
--     (postgres)로 실행된다 → authenticated 권한을 회수해도 자동 실행은 그대로다.
-- ============================================================

-- ① 백업 표 삭제 (의존 객체 없음 — FK·뷰·함수·정책 어디에도 참조가 없다)
drop table if exists public._bak_golf_group_members_dup_20261025;
drop table if exists public._bak_golf_groups_dup_20261025;

-- ② audit_prune: 활성 마스터일 때만
create or replace function public.audit_prune(p_months integer default 6)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_n bigint;
begin
  if not coalesce((select role = 'admin' from user_access where user_id = auth.uid() and active), false) then
    raise exception '권한 없음(이력 정리는 마스터 전용)';
  end if;
  with del as (
    delete from audit_log
     where changed_at < now() - make_interval(months => greatest(p_months,1))
       and table_name not in ('charges','payments','folios','transactions','user_access','settle_deductions')
    returning 1)
  select count(*) into v_n from del;
  return v_n;
end $function$;

revoke all on function public.audit_prune(integer) from public, anon;
grant execute on function public.audit_prune(integer) to authenticated;

-- ③ take_booking_snapshot: 화면이 부르지 않는 함수 — 로그인 사용자 권한 회수
revoke all on function public.take_booking_snapshot(date) from public, anon, authenticated;
