-- ============================================================================
--  111_menu_sub.sql — 주문 화면 2단 분류(마실 것 / 먹는 것 · 술 종류 · 주문 성격)
-- ----------------------------------------------------------------------------
--  Min 2026-08: "마실 것과 먹는 것은 구분 필요. 술의 종류는 마실 것 안에서 구분 필요."
--               "먹는 것은 일반 주문 / 업그레이드 메뉴 / 추가 메뉴 구분이 필요함."
--  기존: 레스토랑 45품목이 전부 category='식음' 한 덩어리 → POS 에서 45개를 눈으로 훑어야 했다.
--
--  ⚠ `category`(라운딩·식음·숙박·골프샵·기타)는 **정산 구분(회계)** 이라 건드리지 않는다.
--    청구서·매출 집계가 그 5종을 쓰기 때문이다(Min 확정). 주문 화면 분류는 새 컬럼으로 분리한다.
--
--   · menu_group : 큰 구분 — 음료 / 음식 / 기타   → POS 상단 탭
--   · sub        : 소분류   — 생맥주·맥주·소주·니혼슈·위스키·와인·기타주류·논알콜
--                            / 일반주문·업그레이드·추가메뉴 / 반입료   → POS 섹션(스티키 목차)
--  멱등. Supabase SQL Editor 수동 실행(또는 MCP apply_migration).
-- ============================================================================

alter table menu_items add column if not exists menu_group text;
alter table menu_items add column if not exists sub        text;
create index if not exists idx_menu_items_grp on menu_items(venue, menu_group, sub);

-- ── 마실 것 ────────────────────────────────────────────────────────────────
update menu_items set menu_group='음료', sub='생맥주'   where code in ('NAMA-S','NAMA-M','NAMA-L','NAMA-P');
update menu_items set menu_group='음료', sub='맥주'     where code in ('BIN');
update menu_items set menu_group='음료', sub='소주'     where code in ('KSOJU','JSOJU-G','JSOJU-B');
update menu_items set menu_group='음료', sub='니혼슈'   where code in ('SAKE-1','SAKE-2','ONECUP','REI','DAIGIN');
update menu_items set menu_group='음료', sub='위스키'   where code in ('HIGH','WHIS');
update menu_items set menu_group='음료', sub='와인'     where code in ('WINE-1','WINE-2','WINE-3');
update menu_items set menu_group='음료', sub='기타주류' where code in ('UMEG','SAWA');
update menu_items set menu_group='음료', sub='논알콜'   where code in ('NONAL','SD-COLA','SD-OOLONG','SD-CIDER','SD-LEMON','SD-UME','TANSAN-S','TANSAN-L');

-- ── 먹는 것 ── 주문 성격까지 나눈다(Min).
--   일반주문   = 그 자리에서 시키는 단품(안주)
--   업그레이드 = 기본 석식을 다른 코스로 바꾸는 것(회석·스키야키·샤브샤브·BBQ)
--   추가메뉴   = 기본 석식에 얹는 것(회·장어·와규·말고기)
update menu_items set menu_group='음식', sub='일반주문'   where code in ('SN-TAKO','SN-POTE','SN-TORI','SN-GOBO','SN-TAKOWASA');
update menu_items set menu_group='음식', sub='업그레이드' where code in ('UP-KAISEKI','UP-SUKI','UP-SHABU','UP-BBQ');
update menu_items set menu_group='음식', sub='추가메뉴'   where code in ('ADD-SASHIMI','ADD-SASHIMI-EBI','ADD-UNAGI','ADD-WAGYU','ADD-BASASHI');

-- ── 그 외 ──────────────────────────────────────────────────────────────────
update menu_items set menu_group='기타', sub='반입료'   where code in ('CORK-1','CORK-2','CORK-3');

-- 프론트 매점(간단 품목)
update menu_items set menu_group='음료', sub='논알콜'
  where venue='front' and menu_group is null
    and (name_ja ilike '%ドリンク%' or name_ja ilike '%ウォーター%' or name_ko ilike '%음료%' or name_ko ilike '%생수%' or name_ko ilike '%요거트%');
update menu_items set menu_group='음식', sub='일반주문'
  where venue='front' and menu_group is null and category='식음';
update menu_items set menu_group='기타', sub='숙박'
  where menu_group is null and category='숙박';

-- 남은 것(신규 등록 등)은 menu.html 에서 지정한다 — POS 는 미분류로 묶어 보여준다.
-- 확인:
--   select venue, menu_group, sub, count(*) from menu_items group by 1,2,3 order by 1,2,3;
