-- 119. RPC 실행 권한을 PUBLIC 에서 회수 (2026-08) — 118 과 한 쌍
--  🔴 118 에서 anon 만 회수했더니 **그대로 호출됐다**. 원인 = Postgres 는 함수 EXECUTE 를
--     기본으로 PUBLIC 에 부여하고 anon 은 PUBLIC 을 상속하므로, anon 만 revoke 해도 소용이 없다.
--     → PUBLIC 에서 회수하고 authenticated 에만 다시 부여한다.
--     (앞으로 새 RPC 를 만들 때도 같은 함정을 조심할 것: revoke ... from public 이 정답)
--
--  적용 후 실측(anon 역할): match_group_codes·today_summary·audit_feed·exec_stats 모두 차단,
--    guest_bill 은 호출 가능(손님 QR 청구서 — 의도), bookings 직접조회 0행(RLS 정상).
--    authenticated 는 그대로 사용 가능(각 함수의 내부 가드가 역할·영역을 판정).

do $$
declare f record;
begin
  -- 로그인 후에만 쓰는 RPC
  for f in
    select p.oid::regprocedure sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.proname in (
        'match_group_codes','today_summary','exec_stats','visitor_stats',
        'data_audit','audit_prune','audit_feed',
        'admin_list_users','admin_set_access','admin_set_active',
        'set_check_status','room_swap','event_note_set','dispatch_set_memo',
        'shizu_place','shizu_unassign','shizu_swap_rooms','shizu_assign_rooms','shizu_autofill',
        'gc_missing_codes','resync_group_codes')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant  execute on function %s to authenticated',  f.sig);
  end loop;

  -- 트리거 전용 함수 — 사람이 직접 부를 일이 없다(트리거는 테이블 소유자로 돈다)
  for f in
    select p.oid::regprocedure sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('audit_row','handle_new_user','set_updated_at',
        'cart_sync_charge','dinner_addon_sync_charge','single_charge_sync_charge',
        'rooms_capacity_guard','rooms_fill_facility','_shizu_autofill_impl')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;

  -- 손님 QR 청구서는 미로그인이 써야 한다
  for f in
    select p.oid::regprocedure sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'guest_bill'
  loop
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
