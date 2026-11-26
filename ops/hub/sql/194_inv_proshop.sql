-- ============================================================================
--  194_inv_proshop.sql — 골프샵 재고(재고 화면의 새 부서) · 골프샵 권한 묶음
--  상태: 적용 완료(2026-11-26, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  Min 2026-11-26 「골프샵 재고관리도 추가해줘」「골프샵은 골프 코스 관리 등과는 완전 별개」.
--
--  ① 권한 트리에 새 묶음 proshop(골프샵) + 자식 inv_proshop(골프샵 재고) — 40행 재시드.
--     골프(golf) 묶음 아래가 아니다: 코스·카트 권한을 가진 사람이 골프샵 재고를 보거나 고치지 않는다(그 반대도).
--  ② 재고 표(inv_items·inv_txns·inv_suppliers)의 부서 값 'proshop' 은 SQL 191 의 판정이 그대로 받는다
--     (inv_can_read = inv_proshop 수정·보기 또는 정산 · inv_can_write = inv_proshop 수정 · 관리자 통과) — 정책·함수 변경 없음.
--     inv_move 도 inv_can_write(부서) 로 판정한다(191).
--
--  멱등. 되돌리기: area_tree 에서 inv_proshop 행 삭제(그 부서 품목이 있으면 관리자만 보게 된다).
-- ============================================================================

-- ── ⓪ 적용 전 확인 ─────────────────────────────────────────────────────────────
do $chk$
begin
  if to_regclass('public.area_tree') is null then raise exception '194: area_tree 가 없다'; end if;
  if to_regprocedure('public.inv_can_read(text)') is null or to_regprocedure('public.inv_can_write(text)') is null then
    raise exception '194: inv_can_read·inv_can_write 가 없다 — SQL 191 먼저';
  end if;
  if (select count(*) from public.area_tree) not in (39, 40) then
    raise exception '194: area_tree 가 % 행 — 192 재시드(39행) 뒤가 아니다', (select count(*) from public.area_tree);
  end if;
end $chk$;

-- ── ① 권한 트리 재시드(40행) ───────────────────────────────────────────────────
insert into public.area_tree(child, parent) values
  ('nametag','print'),('keyslip','print'),('aircover','print'),('dispatch','print'),('dinner','print'),('qrcards','print'),('transfer','print'),('notice','print'),
  ('frontdesk','front'),('inv_front','front'),
  ('room_assign','room'),('occupancy','room'),('staychart','room'),('roomstats','room'),('inv_room','room'),
  ('housekeeping','hk'),('inv_hk','hk'),
  ('course','golf'),('cart','golf'),('inv_golf','golf'),
  ('kds','kitchen'),('kds_front','kitchen'),('inv_fnb','kitchen'),
  ('pos_front','pos'),('pos_golf','pos'),('pos_restaurant','pos'),('pos_customer','pos'),
  ('settle_onsite','settle'),('settle_merit','settle'),('settle_report','settle'),
  ('stats_mgmt','stats'),('staycal','stats'),
  ('shizu_sheet','shizu'),('inv_shizu','shizu'),
  ('partner_kumamoto','partner'),('partner_trial','partner'),
  ('sales_fnb','sales'),('sales_front','sales'),('sales_golf','sales'),
  ('inv_proshop','proshop')
on conflict (child) do update set parent = excluded.parent;

-- ── ② 적용 뒤 확인 ─────────────────────────────────────────────────────────────
do $post$
begin
  if (select count(*) from public.area_tree) <> 40 or not exists (select 1 from public.area_tree where child = 'inv_proshop' and parent = 'proshop') then
    raise exception '194: area_tree 가 40행(inv_proshop → proshop)이 아니다';
  end if;
end $post$;

notify pgrst, 'reload schema';
