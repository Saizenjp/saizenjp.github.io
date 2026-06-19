-- ============================================================================
--  SaiZen Hub — 설치 상태 확인 (정산·POS·주방·메뉴)
--  SQL Editor에 붙여넣고 Run → 각 항목이 ✅인지 ❌인지 한눈에.
--  (to_regclass 사용 → 테이블이 없어도 에러 없이 동작)
-- ============================================================================
select '09 folios (정산계정)'              as 항목, case when to_regclass('public.folios')                  is not null then '✅ 있음' else '❌ 없음 (09 실행)' end as 상태
union all select '09 charges (청구원장)',         case when to_regclass('public.charges')                 is not null then '✅ 있음' else '❌ 없음 (09 실행)' end
union all select '09 payments (결제)',            case when to_regclass('public.payments')                is not null then '✅ 있음' else '❌ 없음 (09 실행)' end
union all select '09 view v_folio_balance',       case when to_regclass('public.v_folio_balance')         is not null then '✅ 있음' else '❌ 없음 (09 실행)' end
union all select '09 view v_settlement_by_category', case when to_regclass('public.v_settlement_by_category') is not null then '✅ 있음' else '❌ 없음 (09 실행)' end
union all select '10 menu_items (메뉴 마스터)',   case when to_regclass('public.menu_items')              is not null then '✅ 있음' else '❌ 없음 (10 실행)' end
union all select '11 menu_items.station 컬럼',    case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='menu_items' and column_name='station') then '✅ 있음' else '❌ 없음 (11 실행)' end
union all select '11 kitchen_tickets (주방큐)',   case when to_regclass('public.kitchen_tickets')         is not null then '✅ 있음' else '❌ 없음 (11 실행)' end
order by 항목;

-- ── 메뉴가 들어갔는지 (위에서 menu_items 가 ✅일 때만 실행) ──
-- select station, count(*) as 건수 from menu_items group by station order by station;
-- select count(*) as 메뉴_총건수 from menu_items;
