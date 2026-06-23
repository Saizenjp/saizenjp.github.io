-- ============================================================================
--  SaiZen Hub — 34 프론트 매점(front)에 「9홀 추가」 라운딩 항목 시드
-- ----------------------------------------------------------------------------
--  · 현장에서 발생하는 9홀(하프) 라운딩 추가를 프론트 매점 POS에서 바로 올릴 수 있게.
--    골프샵(proshop)은 클럽·볼·장갑·모자·신발·의류 등 「판매 상품」 전용이라,
--    라운딩(서비스) 성격인 9홀 추가는 프론트(front) 매장에 둔다.
--  · category='라운딩' → folio·御請求書에서 라운딩 라인으로 집계.
--    venue='front'      → 프론트 매점 POS에 노출(OUTLETS.front.venues=['front']).
--    station='none'     → 주방 티켓 미발행(프론트/골프샵은 조리 라우팅 없음).
--    unit_price=0       → 금액 가변 → POS에서 직접 입력(메뉴 관리에서 고정값 교체 가능).
--  · 코드 FR10 = 프론트 prefix 'FR' 다음 번호(기존 FR1~FR9, 메뉴 관리 자동채번과 일치).
--  실행: Supabase SQL Editor. 24 이후. 멱등(같은 코드가 없을 때만 시드).
-- ============================================================================

do $$
begin
  if not exists (select 1 from menu_items where code='FR10') then
    insert into menu_items(code,name_ja,name_ko,category,venue,station,unit_price,sort_order) values
      ('FR10','ラウンド追加(9H)','9홀 추가','라운딩','front','none', 0, 5);
  end if;
end $$;

-- 확인:  select code,name_ko,category,venue,station from menu_items where venue='front' order by sort_order;
-- ============================================================================
--  끝.
-- ============================================================================
