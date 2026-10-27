-- ============================================================================
-- 153_area_staychart.sql — 월간 숙박 현황표(staychart) 세부 권한 키 (2026-10-27)
--  Min 2026-10-27 「권한 관리에 월별 객실 현황 체크표 없음. 검수 바람」
--  검수: staychart.html(月間 日別宿泊現況, 2026-10-26 신설)이 「일별 체류 현황」과 같은 occupancy 키를 써서
--        권한 관리에 자기 체크표가 없었다(일별 체류 현황을 주면 같이 열리고, 따로 줄 수는 없었다).
--  ① area_tree 재시드(33행) — room 그룹에 자식 staychart 추가.
--     seed 는 saizen-core.js AREA_TREE 와 같아야 한다(tests/saizen-core-areas.test.mjs 가 이 파일(최신 seed)을 읽어 대조).
--  ② 기존 계정 승계: occupancy 를 가진 계정(수정은 수정·보기는 보기)에 staychart 도 부여 → 보이던 카드가 사라지지 않는다.
--     room 그룹 전체를 가진 계정은 area_expand() 로 자동(승계 불요).
--  DB 쓰기 권한과 무관(staychart 는 읽기 전용 화면) — 이 키는 랜딩 카드·페이지 가드 노출만 정한다.
--  RLS/RPC 변경 없음(anon security definer 12 유지). 멱등.
-- ============================================================================

-- ① area_tree 재시드(33행)
insert into public.area_tree(child, parent) values
  ('nametag','print'),('keyslip','print'),('aircover','print'),('dispatch','print'),('dinner','print'),('qrcards','print'),('transfer','print'),('notice','print'),
  ('frontdesk','front'),('inv_front','front'),
  ('room_assign','room'),('occupancy','room'),('staychart','room'),('roomstats','room'),('inv_room','room'),
  ('housekeeping','hk'),('inv_hk','hk'),
  ('course','golf'),('cart','golf'),('inv_golf','golf'),
  ('kds','kitchen'),('kds_front','kitchen'),('inv_fnb','kitchen'),
  ('pos_front','pos'),('pos_golf','pos'),('pos_restaurant','pos'),('pos_customer','pos'),
  ('settle_onsite','settle'),('settle_merit','settle'),
  ('stats_mgmt','stats'),('staycal','stats'),
  ('shizu_sheet','shizu'),('inv_shizu','shizu')
on conflict (child) do update set parent = excluded.parent;
delete from public.area_tree where child not in ('nametag','keyslip','aircover','dispatch','dinner','qrcards','transfer','notice','frontdesk','inv_front','room_assign','occupancy','staychart','roomstats','inv_room','housekeeping','inv_hk','course','cart','inv_golf','kds','kds_front','inv_fnb','pos_front','pos_golf','pos_restaurant','pos_customer','settle_onsite','settle_merit','stats_mgmt','staycal','shizu_sheet','inv_shizu');

-- ② 기존 계정 승계: occupancy → staychart (areas·read_areas 각각)
update public.user_access
   set areas = array_append(coalesce(areas,'{}'), 'staychart')
 where 'occupancy' = any(coalesce(areas,'{}'))
   and not ('staychart' = any(coalesce(areas,'{}')));
update public.user_access
   set read_areas = array_append(coalesce(read_areas,'{}'), 'staychart')
 where 'occupancy' = any(coalesce(read_areas,'{}'))
   and not ('staychart' = any(coalesce(read_areas,'{}')));

-- 확인
-- select count(*) from area_tree;                                   -- 33
-- select child,parent from area_tree where child='staychart';       -- staychart | room
