-- ============================================================================
-- 139_anon_revoke_recheck.sql — anon 실행 권한 재점검(118·119 원칙의 후속)
--
--  2026-09 배포 후 점검에서 anon 이 실행할 수 있는 security definer 함수가 15개였다.
--  의도한 것 = guest_bill·guest_today(손님 QR, 토큰 검사) + 권한 헬퍼 6(is_admin·has_area·has_any_area·has_read_area·
--  has_any_read_area·me_access — RLS 정책 평가에 필요) + 안내 모니터 4(signage_dinner/lobby/course/office) = 12.
--  의도 밖 3개(booking_trend·marshal_assign_player_no·take_booking_snapshot)는 각 파일에 revoke 가 있었지만 살아 있었다
--  (create or replace 는 기존 권한을 그대로 두므로 뒤에 다시 만든 함수에 옛 PUBLIC 부여가 남는다).
--  → public·anon 에서 명시 회수. ⚠ 새 RPC 를 만들거나 다시 만들 때마다 `revoke … from public, anon` 을 같이 둔다.
-- ============================================================================
revoke execute on function public.booking_trend(text, integer) from public, anon;
grant  execute on function public.booking_trend(text, integer) to authenticated;
revoke execute on function public.marshal_assign_player_no(date, uuid[]) from public, anon;
grant  execute on function public.marshal_assign_player_no(date, uuid[]) to authenticated;
revoke execute on function public.take_booking_snapshot(date) from public, anon;
grant  execute on function public.take_booking_snapshot(date) to authenticated;
