-- ============================================================================
--  SaiZen Hub — 설치 상태 종합 점검 (01~40 전체)
--  Supabase SQL Editor 에 붙여넣고 Run → 각 항목 ✅/❌ 한눈에.
--  (to_regclass / information_schema 사용 → 객체가 없어도 에러 없이 동작)
--  ❌ 가 보이면 괄호 안 번호 파일을 SQL Editor 에서 실행하세요.
-- ============================================================================
select 구분, 항목, 상태
from (
  -- ── 01 코어 스키마 (테이블 + updated_at 트리거 함수) ──
  select 1 ord,'01 코어' as 구분,'bookings'      as 항목, case when to_regclass('public.bookings')      is not null then '✅ 있음' else '❌ 없음 (01)' end as 상태
  union all select 1,'01 코어','passengers',     case when to_regclass('public.passengers')     is not null then '✅ 있음' else '❌ 없음 (01)' end
  union all select 1,'01 코어','guests',         case when to_regclass('public.guests')         is not null then '✅ 있음' else '❌ 없음 (01)' end
  union all select 1,'01 코어','guest_members',  case when to_regclass('public.guest_members')  is not null then '✅ 있음' else '❌ 없음 (01)' end
  union all select 1,'01 코어','member_codes',   case when to_regclass('public.member_codes')   is not null then '✅ 있음' else '❌ 없음 (01)' end
  union all select 1,'01 코어','room_inventory', case when to_regclass('public.room_inventory') is not null then '✅ 있음' else '❌ 없음 (01)' end
  union all select 1,'01 코어','rooms',          case when to_regclass('public.rooms')          is not null then '✅ 있음' else '❌ 없음 (01)' end
  union all select 1,'01 코어','fn set_updated_at', case when to_regprocedure('public.set_updated_at()') is not null then '✅ 있음' else '❌ 없음 (01)' end

  -- ── 02 객실 마스터 시드 / fee_rules ──
  union all select 2,'02 객실','fee_rules',              case when to_regclass('public.fee_rules') is not null then '✅ 있음' else '❌ 없음 (02)' end
  union all select 2,'02 객실','room_inventory 시드(>0)', case when coalesce((select count(*) from room_inventory),0) > 0 then '✅ '||(select count(*) from room_inventory)::text||'실' else '❌ 비어있음 (02)' end

  -- ── 04 RLS anon 정책 ──
  union all select 4,'04 RLS','bookings 정책', case when exists(select 1 from pg_policies where schemaname='public' and tablename='bookings') then '✅ 있음' else '❌ 없음 (04)' end

  -- ── 05 야마나미 실제 객실 ──
  union all select 5,'05 호텔동','야마나미 1301호', case when exists(select 1 from room_inventory where facility='야마나미리조트' and room_no='1301호') then '✅ 있음' else '❌ 없음 (05)' end

  -- ── 06 rooms 배정 컬럼 ──
  union all select 6,'06 배정','rooms.member_id',    case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='rooms' and column_name='member_id')    then '✅ 있음' else '❌ 없음 (06)' end
  union all select 6,'06 배정','rooms.inventory_id', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='rooms' and column_name='inventory_id') then '✅ 있음' else '❌ 없음 (06)' end

  -- ── 08 import_log ──
  union all select 8,'08 이력','import_log', case when to_regclass('public.import_log') is not null then '✅ 있음' else '❌ 없음 (08)' end

  -- ── 09 정산 코어 (테이블 + 뷰) ──
  union all select 9,'09 정산','folios',       case when to_regclass('public.folios')       is not null then '✅ 있음' else '❌ 없음 (09)' end
  union all select 9,'09 정산','charges',      case when to_regclass('public.charges')      is not null then '✅ 있음' else '❌ 없음 (09)' end
  union all select 9,'09 정산','payments',     case when to_regclass('public.payments')     is not null then '✅ 있음' else '❌ 없음 (09)' end
  union all select 9,'09 정산','rounds',       case when to_regclass('public.rounds')       is not null then '✅ 있음' else '❌ 없음 (09)' end
  union all select 9,'09 정산','dining',       case when to_regclass('public.dining')       is not null then '✅ 있음' else '❌ 없음 (09)' end
  union all select 9,'09 정산','transactions', case when to_regclass('public.transactions') is not null then '✅ 있음' else '❌ 없음 (09)' end
  union all select 9,'09 정산','view v_folio_balance',          case when to_regclass('public.v_folio_balance')          is not null then '✅ 있음' else '❌ 없음 (09)' end
  union all select 9,'09 정산','view v_folio_lines',            case when to_regclass('public.v_folio_lines')            is not null then '✅ 있음' else '❌ 없음 (09)' end
  union all select 9,'09 정산','view v_folio_summary',          case when to_regclass('public.v_folio_summary')          is not null then '✅ 있음' else '❌ 없음 (09)' end
  union all select 9,'09 정산','view v_settlement_by_category', case when to_regclass('public.v_settlement_by_category') is not null then '✅ 있음' else '❌ 없음 (09)' end

  -- ── 10 방배정 등급/소스 컬럼 ──
  union all select 10,'10 방배정','passengers.member_grade',    case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='passengers'    and column_name='member_grade')  then '✅ 있음' else '❌ 없음 (10)' end
  union all select 10,'10 방배정','guest_members.member_grade', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='guest_members' and column_name='member_grade')  then '✅ 있음' else '❌ 없음 (10)' end
  union all select 10,'10 방배정','rooms.assign_source',        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='rooms'         and column_name='assign_source') then '✅ 있음' else '❌ 없음 (10)' end

  -- ── 11~13 POS·주방·메뉴 ──
  union all select 11,'11 메뉴','menu_items',           case when to_regclass('public.menu_items')      is not null then '✅ 있음' else '❌ 없음 (11)' end
  union all select 12,'12 주방','menu_items.station',   case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='menu_items' and column_name='station') then '✅ 있음' else '❌ 없음 (12)' end
  union all select 12,'12 주방','kitchen_tickets',      case when to_regclass('public.kitchen_tickets') is not null then '✅ 있음' else '❌ 없음 (12)' end
  union all select 13,'13 메뉴시드','menu_items 시드(>0)', case when coalesce((select count(*) from menu_items),0) > 0 then '✅ '||(select count(*) from menu_items)::text||'건' else '❌ 비어있음 (13)' end

  -- ── 14 import 변경이력 ──
  union all select 14,'14 이력','import_log.changes', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='import_log' and column_name='changes') then '✅ 있음' else '❌ 없음 (14)' end

  -- ── 15 시즈노야도 실제 객실명 ──
  union all select 15,'15 시즈노','志津(실제명 적용)',          case when exists(select 1 from room_inventory where facility='시즈노야도 료칸' and room_no='志津')    then '✅ 적용됨' else '❌ 미적용 (15)' end
  union all select 15,'15 시즈노','구 placeholder(본관 1호)',  case when exists(select 1 from room_inventory where facility='시즈노야도 료칸' and room_no='본관 1호') then '⚠ 잔존 → 15 재실행' else '✅ 없음' end

  -- ── 16 팀 운영 주석 ──
  union all select 16,'16 운영주석','event_notes',    case when to_regclass('public.event_notes')    is not null then '✅ 있음' else '❌ 없음 (16)' end
  union all select 16,'16 운영주석','event_note_log', case when to_regclass('public.event_note_log') is not null then '✅ 있음' else '❌ 없음 (16)' end

  -- ── 17~19 RLS 강화 / 접근권한 ──
  union all select 18,'18 권한','user_access',           case when to_regclass('public.user_access') is not null then '✅ 있음' else '❌ 없음 (18)' end
  union all select 18,'18 권한','fn is_admin',           case when exists(select 1 from pg_proc where proname='is_admin')      then '✅ 있음' else '❌ 없음 (18)' end
  union all select 18,'18 권한','fn me_access',          case when exists(select 1 from pg_proc where proname='me_access')     then '✅ 있음' else '❌ 없음 (18)' end
  union all select 19,'19 RLS','fn has_any_area',        case when exists(select 1 from pg_proc where proname='has_any_area')  then '✅ 있음' else '❌ 없음 (19)' end
  union all select 19,'19 RLS','folios 영역화(anon차단)', case when exists(select 1 from pg_policies where tablename='folios' and policyname='folios_sel') then '✅ 적용' else '❌ 미적용 (17~19)' end

  -- ── 20 주방 접수단계 ──
  union all select 20,'20 주방','kitchen_tickets.accepted_at', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='kitchen_tickets' and column_name='accepted_at') then '✅ 있음' else '❌ 없음 (20)' end

  -- ── 21 보드/요약 ──
  union all select 21,'21 보드','announcements',         case when to_regclass('public.announcements') is not null then '✅ 있음' else '❌ 없음 (21)' end
  union all select 21,'21 보드','fn today_summary',      case when exists(select 1 from pg_proc where proname='today_summary') then '✅ 있음' else '❌ 없음 (21)' end

  -- ── 25 프로필 부서 ──
  union all select 25,'25 프로필','user_access.dept',    case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='user_access' and column_name='dept') then '✅ 있음' else '❌ 없음 (25)' end

  -- ── 27 키택 / 28 가입요청 / 29 변경이력 ──
  union all select 27,'27 키택','key_bindings',          case when to_regclass('public.key_bindings')    is not null then '✅ 있음' else '❌ 없음 (27)' end
  union all select 28,'28 가입','access_requests',       case when to_regclass('public.access_requests') is not null then '✅ 있음' else '❌ 없음 (28)' end
  union all select 29,'29 이력','change_log',            case when to_regclass('public.change_log')      is not null then '✅ 있음' else '❌ 없음 (29)' end

  -- ── 30 B2B 정산 저장 ──
  union all select 30,'30 정산B2B','settle_remarks',     case when to_regclass('public.settle_remarks')    is not null then '✅ 있음' else '❌ 없음 (30)' end
  union all select 30,'30 정산B2B','settle_deductions',  case when to_regclass('public.settle_deductions') is not null then '✅ 있음' else '❌ 없음 (30)' end

  -- ── 31 회원등급(⚠ step1 import 전 먼저 적용 필요) ──
  union all select 31,'31 회원등급','passengers.member_class',    case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='passengers'    and column_name='member_class') then '✅ 있음' else '❌ 없음 (31·import전필수)' end
  union all select 31,'31 회원등급','guest_members.member_class', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='guest_members' and column_name='member_class') then '✅ 있음' else '❌ 없음 (31·import전필수)' end

  -- ── 32 인쇄 오버라이드 / 35 제외 / 37 팀묶기 ──
  union all select 32,'32 인쇄OV','print_overrides',          case when to_regclass('public.print_overrides') is not null then '✅ 있음' else '❌ 없음 (32)' end
  union all select 35,'35 인쇄OV','print_overrides.excluded',     case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='print_overrides' and column_name='excluded')     then '✅ 있음' else '❌ 없음 (35)' end
  union all select 37,'37 인쇄OV','print_overrides.dining_group', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='print_overrides' and column_name='dining_group') then '✅ 있음' else '❌ 없음 (37)' end

  -- ── 33 객실폐쇄 / 36 재고 ──
  union all select 33,'33 폐쇄','room_closures', case when to_regclass('public.room_closures') is not null then '✅ 있음' else '❌ 없음 (33)' end
  union all select 36,'36 재고','inv_items',     case when to_regclass('public.inv_items')     is not null then '✅ 있음' else '❌ 없음 (36)' end
  union all select 36,'36 재고','inv_txns',      case when to_regclass('public.inv_txns')      is not null then '✅ 있음' else '❌ 없음 (36)' end

  -- ── 39 정산뷰 보안 / 40 정원 트리거 (이번 배포 보안 수정) ──
  union all select 39,'39 보안','v_folio_balance security_invoker', case when exists(select 1 from pg_class where relname='v_folio_balance' and reloptions @> array['security_invoker=on']) then '✅ 적용' else '❌ 미적용 (39·뷰RLS우회)' end
  union all select 39,'39 보안','folios 읽기 front 포함',           case when exists(select 1 from pg_policies where tablename='folios' and policyname='folios_sel' and qual like '%front%') then '✅ 적용' else '⚠ 미적용 (39)' end
  union all select 40,'40 정원','trg_rooms_capacity', case when exists(select 1 from pg_trigger where tgname='trg_rooms_capacity' and not tgisinternal) then '✅ 있음' else '❌ 없음 (40·더블부킹차단)' end

  -- ── 50 정산 결제수단 / 51 조기퇴실 / 52 확인필요(후속조치) ──
  union all select 50,'50 정산','charges.pay_method',      case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='charges' and column_name='pay_method') then '✅ 있음' else '❌ 없음 (50)' end
  union all select 51,'51 조기퇴실','guest_members.actual_dep', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='guest_members' and column_name='actual_dep') then '✅ 있음' else '❌ 없음 (51)' end
  union all select 52,'52 후속조치','followups',            case when to_regclass('public.followups') is not null then '✅ 있음' else '❌ 없음 (52)' end
  union all select 53,'53 경영통계','exec_stats() RPC',     case when exists(select 1 from pg_proc where proname='exec_stats') then '✅ 있음' else '❌ 없음 (53)' end
  union all select 54,'54 공지삭제','announcements.author_uid', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='announcements' and column_name='author_uid') then '✅ 있음' else '❌ 없음 (54)' end
  union all select 54,'54 공지삭제','ann_delete 정책',       case when exists(select 1 from pg_policies where tablename='announcements' and policyname='ann_delete') then '✅ 있음' else '❌ 없음 (54)' end
  union all select 55,'55 방문통계','visitor_stats() RPC',   case when exists(select 1 from pg_proc where proname='visitor_stats') then '✅ 있음' else '❌ 없음 (55)' end
  union all select 56,'56 운영팀','print_overrides.team_group', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='print_overrides' and column_name='team_group') then '✅ 있음' else '❌ 없음 (56)' end
  union all select 57,'57 시즈온천','shizu_onsen',          case when to_regclass('public.shizu_onsen') is not null then '✅ 있음' else '❌ 없음 (57)' end
  union all select 63,'63 시즈영역분리','shizu_onsen ins=room/shizu', case when exists(select 1 from pg_policies where schemaname='public' and tablename='shizu_onsen' and policyname='shizu_onsen_ins' and coalesce(with_check,'') like '%shizu%') then '✅ 적용' else '❌ 미적용 (63)' end
  union all select 64,'64 비고일본어','bookings.remark_ja', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='remark_local_ja') then '✅ 있음' else '❌ 없음 (64)' end
  union all select 65,'65 그룹코드영역','member_codes sel=groupcodes', case when exists(select 1 from pg_policies where schemaname='public' and tablename='member_codes' and policyname='member_codes_sel' and coalesce(qual,'') like '%groupcodes%') then '✅ 적용' else '❌ 미적용 (65)' end
  union all select 66,'66 대표팀','print_overrides.team_group_rep', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='print_overrides' and column_name='team_group_rep') then '✅ 있음' else '❌ 없음 (66)' end
  union all select 67,'67 시즈맞바꿈','shizu_swap_rooms()', case when exists(select 1 from pg_proc where proname='shizu_swap_rooms') then '✅ 있음' else '❌ 없음 (67)' end
  union all select 68,'68 시즈메모','shizu_memo', case when to_regclass('public.shizu_memo') is not null then '✅ 있음' else '❌ 없음 (68)' end
  union all select 69,'69 시즈자동배정','shizu_assign_rooms()', case when exists(select 1 from pg_proc where proname='shizu_assign_rooms') then '✅ 있음' else '❌ 없음 (69)' end
  union all select 70,'70 시즈폐쇄권한','room_closures ins=shizu', case when exists(select 1 from pg_policies where schemaname='public' and tablename='room_closures' and policyname='room_closures_ins' and coalesce(with_check,'') like '%shizu%') then '✅ 적용' else '❌ 미적용 (70)' end
  union all select 71,'71 시즈재배치','shizu_assign_rooms(3-arg)', case when exists(select 1 from pg_proc where proname='shizu_assign_rooms' and pronargs=3) then '✅ 적용' else '❌ 미적용 (71)' end
  union all select 73,'73 손님청구RPC','guest_bill()', case when exists(select 1 from pg_proc where proname='guest_bill') then '✅ 있음' else '❌ 없음 (73)' end
  union all select 26,'26 골프조편성','golf_groups', case when to_regclass('public.golf_groups') is not null then '✅ 있음' else '❌ 없음 (26)' end
  union all select 74,'74 골프권한','golf_groups ins=golf', case when exists(select 1 from pg_policies where schemaname='public' and tablename='golf_groups' and policyname='golf_groups_ins' and coalesce(with_check,'') like '%golf%') then '✅ 적용' else '❌ 미적용 (74)' end
  union all select 76,'76 시즈물채우기','shizu_water_fill', case when to_regclass('public.shizu_water_fill') is not null then '✅ 있음' else '❌ 없음 (76)' end
  union all select 77,'77 시즈개인배정','shizu_place()', case when exists(select 1 from pg_proc where proname='shizu_place') then '✅ 있음' else '❌ 없음 (77)' end
  union all select 77,'77 시즈배정해제','shizu_unassign()', case when exists(select 1 from pg_proc where proname='shizu_unassign') then '✅ 있음' else '❌ 없음 (77)' end
  union all select 58,'58 별주청구','charges.link_ref',      case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='charges' and column_name='link_ref') then '✅ 있음' else '❌ 없음 (58)' end
  union all select 58,'58 별주청구','dinner_addon 트리거',   case when exists(select 1 from pg_trigger where tgname='trg_dinner_addon_charge') then '✅ 있음' else '❌ 없음 (58)' end
  union all select 59,'59 싱글청구','single_charge 트리거',  case when exists(select 1 from pg_trigger where tgname='trg_single_charge_charge') then '✅ 있음' else '❌ 없음 (59)' end
  union all select 60,'60 석식분리','print_overrides.dinner_split', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='print_overrides' and column_name='dinner_split') then '✅ 있음' else '❌ 없음 (60)' end
  union all select 61,'61 메모RPC','event_note_set()',        case when exists(select 1 from pg_proc where proname='event_note_set') then '✅ 있음' else '❌ 없음 (61)' end
  union all select 62,'62 주문토큰','order_tokens',           case when to_regclass('public.order_tokens') is not null then '✅ 있음' else '❌ 없음 (62)' end
  union all select 79,'79 회원마스터','member_codes.mem_no',   case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='member_codes' and column_name='mem_no') then '✅ 있음' else '❌ 없음 (79)' end
  union all select 79,'79 회원마스터','PK=member_key',         case when exists(select 1 from pg_constraint where conrelid='public.member_codes'::regclass and contype='p' and array_length(conkey,1)=1) then '✅ 적용' else '❌ 미적용 (79)' end
  union all select 79,'79 회원마스터','code nullable',          case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='member_codes' and column_name='code' and is_nullable='YES') then '✅ 적용' else '❌ 미적용 (79)' end
  union all select 82,'82 데이터검수','data_audit()',           case when exists(select 1 from pg_proc where proname='data_audit') then '✅ 있음' else '❌ 없음 (82)' end
  union all select 83,'83 시즈현지메모','shizu_team_memo',       case when to_regclass('public.shizu_team_memo') is not null then '✅ 있음' else '❌ 없음 (83)' end
  union all select 83,'83 시즈현지메모','쓰기=room·shizu',       case when exists(select 1 from pg_policies where schemaname='public' and tablename='shizu_team_memo' and policyname='shizu_team_memo_upd' and coalesce(qual,'') like '%shizu%') then '✅ 적용' else '❌ 미적용 (83)' end
  union all select 84,'84 방정합가드','rooms facility 자동채움',   case when exists(select 1 from pg_trigger where tgname='rooms_aa_fill_facility') then '✅ 있음' else '❌ 없음 (84)' end
  union all select 84,'84 방정합가드','facility null=0',            case when not exists(select 1 from rooms r join room_inventory ri on ri.id=r.inventory_id where r.facility is distinct from ri.facility) then '✅ 정합' else '❌ 불일치 (84)' end
  union all select 85,'85 시즈참고사항','shizu_team_memo.ref_note',  case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='shizu_team_memo' and column_name='ref_note') then '✅ 있음' else '❌ 없음 (85)' end
  union all select 86,'86 예약접수일','bookings.reserved_at',        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='reserved_at') then '✅ 있음' else '❌ 없음 (86)' end
  union all select 87,'87 미보유RPC영역','gc_missing_codes=groupcodes', case when exists(select 1 from pg_proc where proname='gc_missing_codes' and prosrc like '%has_any_read_area%') then '✅ 적용' else '❌ 미적용 (87)' end
  union all select 88,'88 태그재동기화','resync_group_codes()', case when exists(select 1 from pg_proc where proname='resync_group_codes') then '✅ 있음' else '❌ 없음 (88)' end
  union all select 89,'89 시즈미배정자동','shizu_autofill()', case when exists(select 1 from pg_proc where proname='shizu_autofill') then '✅ 있음' else '❌ 없음 (89)' end
  union all select 89,'89 시즈미배정자동','_impl 무권한 revoke', case when not has_function_privilege('authenticated','public._shizu_autofill_impl(text)','execute') then '✅ 차단' else '❌ 노출 (89)' end
  union all select 90,'90 손님QR만료','guest_bill 퇴실+7일 백스톱', case when exists(select 1 from pg_proc where proname='guest_bill' and prosrc like '%arr_date + 7%') then '✅ 적용' else '❌ 미적용 (90)' end
  union all select 91,'91 체크아웃처리','set_check_status()', case when exists(select 1 from pg_proc where proname='set_check_status') then '✅ 있음' else '❌ 없음 (91)' end
  union all select 92,'92 QR만료=체크아웃','guest_bill check_status 반영', case when exists(select 1 from pg_proc where proname='guest_bill' and prosrc like '%check_status%') then '✅ 적용' else '❌ 미적용 (92)' end
  union all select 93,'93 카트 관리표','cart_types·cart_bookings', case when exists(select 1 from information_schema.tables where table_schema='public' and table_name='cart_types') and exists(select 1 from information_schema.tables where table_schema='public' and table_name='cart_bookings') then '✅ 있음' else '❌ 없음 (93)' end
  union all select 94,'94 카트 개별번호','cart_units(정비중 제외)', case when exists(select 1 from information_schema.tables where table_schema='public' and table_name='cart_units') then '✅ 있음' else '❌ 없음 (94)' end
  union all select 95,'95 카트 현장취소','cart_bookings.cancelled', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='cart_bookings' and column_name='cancelled') then '✅ 있음' else '❌ 없음 (95)' end
  union all select 96,'96 간지 실제 호수','room_inventory 201~310호', case when exists(select 1 from room_inventory where facility='간지호텔' and room_no='201호') then '✅ 적용' else '❌ 미적용 (96)' end
  union all select 97,'97 간지 정원 2·최대 3','트리플 요청 허용+초과 표시', case when not exists(select 1 from room_inventory where facility='간지호텔' and (capacity is distinct from 2 or max_capacity is distinct from 3)) and exists(select 1 from room_inventory where facility='간지호텔') then '✅ 적용' else '❌ 미적용 (97)' end
  -- ⚠ 「무기명」은 이름이 같아도 서로 다른 사람이다(팀 명단 미확정) → 중복 판정에서 제외
  union all select 98,'98 명단 중복 정리','guest_members 동일인 중복', case when not exists(select 1 from (select event_seq,name_kr,name_en from guest_members where coalesce(name_kr,'')<>'' and name_kr not in ('무기명','미정','성명미상') group by 1,2,3 having count(*)>1) t) then '✅ 없음' else '❌ 중복 있음 (98 실행)' end
  union all select 99,'99 코스 수기 지정','play_course', case when exists(select 1 from information_schema.tables where table_schema='public' and table_name='play_course') then '✅ 있음' else '❌ 없음 (99)' end
  union all select 100,'100 전기카트 자동청구','trg_cart_charge', case when exists(select 1 from pg_trigger where tgname='trg_cart_charge' and not tgisinternal) then '✅ 있음' else '❌ 없음 (100)' end
  union all select 101,'101 코스 배정표','golf_groups.cart_no', case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='golf_groups' and column_name='cart_no') then '✅ 있음' else '❌ 없음 (101)' end
  union all select 104,'104 방 맞바꾸기','room_swap()', case when exists(select 1 from pg_proc where proname='room_swap') then '✅ 있음' else '❌ 없음 (104)' end
  union all select 105,'105 이력 슬림','audit_row 자동배정 제외', case when exists(select 1 from pg_proc where proname='audit_row' and prosrc like '%assign_source%') then '✅ 적용' else '❌ 미적용 (105)' end
  union all select 105,'105 이력 정리','audit_prune()', case when exists(select 1 from pg_proc where proname='audit_prune') then '✅ 있음' else '❌ 없음 (105)' end
  union all select 106,'106 라운딩 예외','golf_holes·golf_absentees', case when (select count(*) from information_schema.tables where table_schema='public' and table_name in ('golf_holes','golf_absentees'))=2 then '✅ 있음' else '❌ 없음 (106)' end
  union all select 107,'107 청소 진행','hk_done', case when exists(select 1 from information_schema.tables where table_schema='public' and table_name='hk_done') then '✅ 있음' else '❌ 없음 (107)' end
  union all select 102,'102 라운딩 제외','golf_skips', case when exists(select 1 from information_schema.tables where table_schema='public' and table_name='golf_skips') then '✅ 있음' else '❌ 없음 (102)' end
  union all select 103,'103 조 유령 방지','golf_groups FK cascade + 고아 0', case when exists(select 1 from pg_constraint where conname='golf_groups_event_seq_fkey' and confdeltype='c') and not exists(select 1 from golf_groups where event_seq is null) then '✅ 적용' else '❌ 미적용 (103)' end
  union all select 108,'108 QR 재발급','order_tokens.reissue_count + ot_upd 정책', case when exists(select 1 from information_schema.columns where table_name='order_tokens' and column_name='reissue_count') and exists(select 1 from pg_policies where tablename='order_tokens' and policyname='ot_upd') then '✅ 있음' else '❌ 없음 (108)' end
  union all select 109,'109 사입 금액','inv_suppliers + inv_txns.amount + v_inv_spend', case when to_regclass('public.inv_suppliers') is not null and exists(select 1 from information_schema.columns where table_name='inv_txns' and column_name='amount') and to_regclass('public.v_inv_spend') is not null then '✅ 있음' else '❌ 없음 (109)' end
  union all select 110,'110 송영 점검','transfer_checks', case when to_regclass('public.transfer_checks') is not null then '✅ 있음' else '❌ 없음 (110)' end
  union all select 111,'111 메뉴 2단 분류','menu_items.menu_group·sub', case when exists(select 1 from information_schema.columns where table_name='menu_items' and column_name='menu_group') then '✅ 있음' else '❌ 없음 (111)' end
  union all select 112,'112 명단 신원키','guest_members.person_key + 유니크', case when exists(select 1 from information_schema.columns where table_name='guest_members' and column_name='person_key') and exists(select 1 from pg_indexes where indexname='ux_guest_members_person') then '✅ 있음' else '❌ 없음 (112)' end
  union all select 113,'113 자리번호 유니크 해제','guest_members 옛 UNIQUE 제거', case when not exists(select 1 from pg_indexes where indexname='guest_members_event_seq_seq_in_team_key') then '✅ 적용' else '❌ 미적용 (113) — 재임포트가 실패한다' end
  union all select 114,'114 체류중 송영','transfer_checks.leg 에 stay_am·stay_pm', case when exists(select 1 from pg_constraint where conname='transfer_checks_leg_check' and pg_get_constraintdef(oid) like '%stay_am%') then '✅ 있음' else '❌ 없음 (114)' end
  union all select 115,'115 객실 쪽지','room_notes', case when to_regclass('public.room_notes') is not null then '✅ 있음' else '❌ 없음 (115)' end
) t
order by ord, 항목;

-- ── 07 개인 항공정보(passengers ALTER)는 컬럼명이 환경마다 달라 자동검사에서 제외.
--    필요 시: select column_name from information_schema.columns
--             where table_schema='public' and table_name='passengers' order by 1;

-- ── 보조 확인(필요 시 따로 Run) ──────────────────────────────────────────────
-- 시즈노야도 객실명 목록:
--   select zone, room_no, room_type from room_inventory where facility='시즈노야도 료칸' order by sort_order;
-- public 스키마 전체 테이블 목록:
--   select table_name from information_schema.tables where table_schema='public' order by 1;
-- member_codes 행수(페이지네이션 영향):
--   select count(*) as member_codes_행수 from member_codes;
