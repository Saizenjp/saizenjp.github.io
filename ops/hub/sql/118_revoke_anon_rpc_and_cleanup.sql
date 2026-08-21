-- 118. 미로그인(anon)이 부를 수 있던 RPC 정리 + 죽은 테이블·함수 제거 (2026-08)
--  배경: 테이블 직접 조회는 RLS 로 막혀 있다(anon 으로 bookings·member_codes 조회 = 0행 확인).
--   그러나 SECURITY DEFINER RPC 는 RLS 를 우회하므로 **실행 권한 자체**를 회수해야 한다.
--   실측(anon 역할로 직접 호출):
--     match_group_codes(['김동선620606']) → 'HJみ'   (이름+생년으로 회원 여부·그룹코드 확인)
--     today_summary()  → 그날 매출·체크인 현황이 그대로 반환
--     audit_feed()     → 변경 이력 5행
--  ⚠ 이 파일만으로는 부족하다 — 119 를 반드시 함께 적용할 것(아래 참고).
--
--  남겨 두는 것: guest_bill(손님 QR 청구서 = anon 이 써야 함) ·
--   RLS 정책이 평가에 쓰는 권한 헬퍼(is_admin·has_area·has_any_area·has_read_area·
--   has_any_read_area·me_access) — 회수하면 정책 평가가 오류가 된다.

-- ① anon 실행 권한 회수
revoke execute on function public.match_group_codes(text[])                from anon;
revoke execute on function public.today_summary()                          from anon;
revoke execute on function public.audit_feed(text, text, integer, integer) from anon;
revoke execute on function public.data_audit()                             from anon;
revoke execute on function public.audit_prune(integer)                     from anon;
revoke execute on function public.exec_stats(date, date)                   from anon;
revoke execute on function public.visitor_stats(date, date, text)          from anon;
revoke execute on function public.admin_list_users()                       from anon;
revoke execute on function public.admin_set_active(uuid, boolean)          from anon;
revoke execute on function public.set_check_status(bigint[], text, text)   from anon;
revoke execute on function public.room_swap(uuid[], uuid[])                from anon;
revoke execute on function public.shizu_unassign(uuid[])                   from anon;
revoke execute on function public.shizu_place(jsonb)                       from anon;

-- ② 트리거 전용 함수 — 사람이 직접 부를 일이 없다
revoke execute on function public.audit_row()                  from anon, authenticated;
revoke execute on function public.handle_new_user()            from anon, authenticated;
revoke execute on function public.cart_sync_charge()           from anon, authenticated;
revoke execute on function public.dinner_addon_sync_charge()   from anon, authenticated;
revoke execute on function public.single_charge_sync_charge()  from anon, authenticated;

-- ③ search_path 고정(어드바이저 function_search_path_mutable)
alter function public.set_updated_at()        set search_path = public, pg_temp;
alter function public.rooms_capacity_guard()  set search_path = public, pg_temp;
alter function public.rooms_fill_facility()   set search_path = public, pg_temp;

-- ④ 폐기된 가입코드 기능 잔재 제거(초대 방식 채택으로 2026-07 폐기)
drop function if exists public.verify_signup_code(text);
drop table    if exists public.app_secrets;

-- ⑤ 만들어만 두고 한 번도 쓰지 않은 빈 테이블 제거
--   (전부 0행 · 화면 코드에서 from('…') 참조 0 · FK 참조 0 을 확인하고 지운다.
--    transactions 는 room.html 이 실제로 쓰므로 남긴다.)
drop table if exists public.key_bindings;
drop table if exists public.shizu_onsen;
drop table if exists public.shizu_water_fill;
drop table if exists public.rounds;
drop table if exists public.dining;
