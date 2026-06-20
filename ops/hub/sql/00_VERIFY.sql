-- ============================================================================
--  SaiZen Hub — 설치 상태 종합 점검 (01~15 전체)
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
