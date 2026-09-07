-- ============================================================================
-- 140_signage_area.sql — 안내 모니터(TV 화면)를 별도 권한 그룹으로 분리
--
--  Min 2026-09 「모니터 화면하고 이런 거 따로 하지 말고 섞여 있는 게 쓰기에 괜찮은가?」 → 검수 결과 분리.
--   · 인쇄물(매일 뽑는 출력물)과 안내 모니터(한 번 열어두는 TV 화면·로그인 불필요)는 쓰임이 달라
--     랜딩도 권한도 같은 줄에 섞이면 찾기 어렵다. 138 에서 print 의 자식이던 'signage' 를 **부모(그룹)** 로 올리고
--     화면 4개를 자식으로 둔다: sign_lobby(로비) · sign_course(코스) · sign_dinner(2층 석식) · sign_office(직원용 운영 현황).
--   · DB 쓰기와 무관 — 모니터 RPC(signage_*)는 anon 허용이라 이 키는 **랜딩 카드(링크) 노출만** 정한다. RLS 정책 변경 없음.
--   · 기존 사용자: print 그룹을 가진 계정에 signage 그룹을 자동 승계 → 보이던 카드가 사라지지 않는다.
--     (옛 자식 키 'signage' 를 직접 가진 계정은 그 키가 이제 부모라 그대로 4화면 전부 보인다.)
--  seed 는 saizen-core.js AREA_TREE 와 같아야 한다(tests/saizen-core-areas.test.mjs 가 이 파일(최신 seed)을 읽어 대조).
-- ============================================================================

insert into public.area_tree(child, parent) values
  ('nametag','print'),('keyslip','print'),('aircover','print'),('dispatch','print'),('dinner','print'),('qrcards','print'),('transfer','print'),('notice','print'),
  ('sign_lobby','signage'),('sign_course','signage'),('sign_dinner','signage'),('sign_office','signage'),
  ('frontdesk','front'),('inv_front','front'),
  ('room_assign','room'),('occupancy','room'),('roomstats','room'),('inv_room','room'),
  ('housekeeping','hk'),('inv_hk','hk'),
  ('course','golf'),('cart','golf'),('inv_golf','golf'),
  ('kds','kitchen'),('kds_front','kitchen'),('inv_fnb','kitchen'),
  ('pos_front','pos'),('pos_golf','pos'),('pos_restaurant','pos'),('pos_customer','pos'),
  ('settle_onsite','settle'),('settle_merit','settle'),
  ('stats_mgmt','stats'),('staycal','stats'),
  ('shizu_sheet','shizu'),('inv_shizu','shizu')
on conflict (child) do update set parent = excluded.parent;
delete from public.area_tree where child not in (
  'nametag','keyslip','aircover','dispatch','dinner','qrcards','transfer','notice',
  'sign_lobby','sign_course','sign_dinner','sign_office',
  'frontdesk','inv_front','room_assign','occupancy','roomstats','inv_room','housekeeping','inv_hk',
  'course','cart','inv_golf','kds','kds_front','inv_fnb','pos_front','pos_golf','pos_restaurant','pos_customer',
  'settle_onsite','settle_merit','stats_mgmt','staycal','shizu_sheet','inv_shizu');

--  기존 사용자 승계: 인쇄(print) 그룹 → 안내 모니터(signage) 그룹 (수정은 수정으로, 보기는 보기로)
update public.user_access
   set areas = array_append(coalesce(areas,'{}'), 'signage')
 where 'print' = any(coalesce(areas,'{}'))
   and not ('signage' = any(coalesce(areas,'{}')));
update public.user_access
   set read_areas = array_append(coalesce(read_areas,'{}'), 'signage')
 where 'print' = any(coalesce(read_areas,'{}'))
   and not ('signage' = any(coalesce(read_areas,'{}')))
   and not ('signage' = any(coalesce(areas,'{}')));
