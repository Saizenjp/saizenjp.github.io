-- ============================================================================
--  SaiZen Hub — 11 간이 POS 메뉴 마스터 (menu_items)
-- ----------------------------------------------------------------------------
--  설계: docs 정산 명세(04) Phase 2.
--   · 레스토랑·연회장·골프샵에서 직원이 태블릿(ops/hub/pos.html)으로 메뉴를
--     찍어 해당 팀 folio 의 charges 에 바로 적재한다.
--   · 외부 POS 연동 없음(현장 POS 미보유) — Hub 자체 간이 POS.
--   · v1 단순화: 카트→전송 시 charges 에 직접 적재(restaurant_orders 중간 테이블 생략).
--     주방 티켓·다단말 동시편집 같은 본격 기능이 필요해지면 그때 12_ 로 도입.
--
--  menu_items 는 단가 마스터일 뿐, 실제 청구 합산은 charges(09) 에서 한다.
--  category 는 09 의 charges 와 동일한 고정 5종. venue 는 charges.source 로 들어간다.
--
--  실행: Supabase SQL Editor. 01~09 이후 실행. 멱등(아래 시드는 테이블이 빌 때만).
-- ============================================================================

create table if not exists menu_items (
  id          bigserial     primary key,
  code        text,                                 -- 번호/기호(표시·검색용, 선택)
  name_ja     text          not null,               -- 御請求書·명세서에 쓰는 일본어명
  name_ko     text,                                 -- 직원 보조 표기(한국어)
  category    text          not null,               -- 라운딩/식음/숙박/골프샵/기타 (charges 와 동일)
  venue       text,                                 -- restaurant/banquet/proshop/etc → charges.source
  unit_price  numeric(14,0) not null default 0,     -- 단가(JPY, 税込·최종가). 소비세는 内税(청구 시 빼냄).
  sort_order  int           not null default 0,
  active      boolean       not null default true,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);
create index if not exists idx_menu_items_venue on menu_items(venue, sort_order);
create index if not exists idx_menu_items_active on menu_items(active);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='menu_items_category_chk') then
    alter table menu_items add constraint menu_items_category_chk
      check (category in ('라운딩','식음','숙박','골프샵','기타'));
  end if;
end $$;

drop trigger if exists trg_menu_items_updated on menu_items;
create trigger trg_menu_items_updated before update on menu_items
  for each row execute function set_updated_at();

-- ── RLS — ⚠ 09 와 동일: 개발 단계용 임시(anon 전체허용). 운영 전 강화. ──
alter table menu_items enable row level security;
drop policy if exists p_all_menu_items on menu_items;
create policy p_all_menu_items on menu_items
  for all to anon, authenticated using (true) with check (true);

-- ── 예시 시드 (테이블이 비었을 때만) — ⚠ 단가·메뉴는 Min 님이 실제값으로 교체 ──
do $$
begin
  if not exists (select 1 from menu_items) then
    insert into menu_items(code,name_ja,name_ko,category,venue,unit_price,sort_order) values
      ('B1','生ビール',      '생맥주',     '식음','restaurant', 800, 10),
      ('B2','瓶ビール',      '병맥주',     '식음','restaurant', 700, 11),
      ('B3','ハイボール',    '하이볼',     '식음','restaurant', 600, 12),
      ('D1','ソフトドリンク','음료(소프트)','식음','restaurant', 400, 20),
      ('F1','焼酎(ボトル)',  '소주(보틀)', '식음','restaurant',3000, 30),
      ('M1','定食',          '정식',       '식음','restaurant',1800, 40),
      ('M2','刺身盛り合わせ','회 모둠',    '식음','restaurant',2500, 41),
      ('E1','宴会コースA',   '연회 코스A', '식음','banquet',   5000, 50),
      ('E2','宴会コースB',   '연회 코스B', '식음','banquet',   7000, 51),
      ('P1','グローブ',      '장갑',       '골프샵','proshop', 3000, 60),
      ('P2','ボール(1ダース)','볼(1다스)', '골프샵','proshop', 4000, 61),
      ('P3','キャップ',      '모자',       '골프샵','proshop', 2500, 62),
      ('X1','その他(手入力)','기타(수동)', '기타','etc',          0, 90);
  end if;
end $$;

-- ============================================================================
--  끝.
-- ============================================================================
