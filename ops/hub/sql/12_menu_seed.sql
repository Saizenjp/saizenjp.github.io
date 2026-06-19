-- ============================================================================
--  SaiZen Hub — 12 실제 메뉴 시드 (메리트투어·야마나미 리조트 메뉴판 기준)
-- ----------------------------------------------------------------------------
--  출처: 메뉴판 이미지 2종(飲料 / Up-Grade·追加·おつまみ + 酒類持込料).
--  ⚠ 가격은 모두 税込(소비세 포함, 최종가). 시스템은 内税 처리(POS·정산이 단가에서
--    소비세 10%를 빼내 표시하며 더하지 않음). 따라서 unit_price = 손님이 내는 최종가.
--  station: kitchen(조리→주방 KDS 티켓) / bar(드링크바 즉석) / none(반입료 등 비조리).
--
--  실행: Supabase SQL Editor. 10·11 이후 실행. 멱등(아래 가드).
--  ⚠ 10_pos_menu.sql 의 예시 시드(B1,M1 …)는 placeholder이므로 함께 제거한다.
-- ============================================================================

-- 10의 예시 placeholder 제거(실데이터로 대체)
delete from menu_items where code in ('B1','B2','B3','D1','F1','M1','M2','E1','E2','P1','P2','P3','X1');

-- 실제 메뉴는 'NAMA-S'(生ビール 小) 존재 여부로 1회만 적재(멱등)
do $$
begin
  if not exists (select 1 from menu_items where code='NAMA-S') then
    insert into menu_items(code,name_ja,name_ko,category,venue,station,unit_price,sort_order) values
    -- ── 飲料(음료) · 드링크바 제조(station=bar) · 税込 ──
    ('NAMA-S','生ビール(小)','생맥주(소)','식음','restaurant','bar',600,10),
    ('NAMA-M','生ビール(中)','생맥주(중)','식음','restaurant','bar',700,11),
    ('NAMA-L','生ビール(大)','생맥주(대)','식음','restaurant','bar',950,12),
    ('NAMA-P','生ビール(ピッチャー)','생맥주(피처)','식음','restaurant','bar',1800,13),
    ('BIN','瓶ビール(アサヒ・キリン)','병맥주(아사히·기린)','식음','restaurant','bar',700,14),
    ('NONAL','ノンアルコールビール','무알콜 맥주','식음','restaurant','bar',500,15),
    ('HIGH','ハイボール','하이볼','식음','restaurant','bar',600,16),
    ('KSOJU','韓国焼酎(眞露・ジョウンデー)','한국소주(참이슬·좋은데이)','식음','restaurant','bar',700,17),
    ('JSOJU-G','焼酎グラス(芋・麦・米)','일본소주(잔)','식음','restaurant','bar',600,18),
    ('JSOJU-B','焼酎ボトル','일본소주(병)','식음','restaurant','bar',3300,19),
    ('SAKE-1','日本酒(1合)','니혼슈(1합)','식음','restaurant','bar',600,20),
    ('SAKE-2','日本酒(2合)','니혼슈(2합)','식음','restaurant','bar',1200,21),
    ('ONECUP','ワンカップ','원컵(니혼슈)','식음','restaurant','bar',500,22),
    ('REI','レイザン(冷酒)','레이잔(냉주)','식음','restaurant','bar',1200,23),
    ('DAIGIN','純米大吟醸','준마이 다이긴죠','식음','restaurant','bar',2800,24),
    ('UMEG','梅酒グラス','매실주(잔)','식음','restaurant','bar',600,25),
    ('WHIS','ウイスキー(角瓶・SUNTORY)','위스키(1병·산토리)','식음','restaurant','bar',6500,26),
    ('WINE-1','ワイン(ボトル)','와인(병)','식음','restaurant','bar',1500,27),
    ('WINE-2','ワイン(ボトル・中)','와인(병·중급)','식음','restaurant','bar',2500,28),
    ('WINE-3','ワイン(ボトル・上)','와인(병·상급)','식음','restaurant','bar',3000,29),
    ('SAWA','サワー','사와(사워)','식음','restaurant','bar',600,30),
    ('SD-COLA','コーラ','콜라','식음','restaurant','bar',350,31),
    ('SD-OOLONG','ウーロン茶','우롱차','식음','restaurant','bar',350,32),
    ('SD-CIDER','サイダー','사이다','식음','restaurant','bar',350,33),
    ('SD-LEMON','レモンスカッシュ','레몬 스쿼시','식음','restaurant','bar',350,34),
    ('SD-UME','梅スパークリング','매실 스파클링','식음','restaurant','bar',350,35),
    ('TANSAN-S','炭酸水(500cc)','탄산수(500cc)','식음','restaurant','bar',300,36),
    ('TANSAN-L','炭酸水(1L)','탄산수(1L)','식음','restaurant','bar',500,37),
    -- ── 석식 Up-Grade(1인당) · 주방(station=kitchen) · 税込 ──
    ('UP-KAISEKI','会席料理','카이세키 요리','식음','restaurant','kitchen',3000,50),
    ('UP-SUKI','すき焼き','스키야키','식음','restaurant','kitchen',3000,51),
    ('UP-SHABU','牛しゃぶしゃぶ','소고기 샤브샤브','식음','restaurant','kitchen',3000,52),
    ('UP-BBQ','バーベキュー','바베큐(4인 이상)','식음','restaurant','kitchen',3000,53),
    -- ── 追加 메뉴 · 주방 · 税込 ──
    ('ADD-SASHIMI','刺身(船盛・鯛姿造り)','회 모둠(도미)','식음','restaurant','kitchen',15000,60),
    ('ADD-SASHIMI-EBI','刺身(船盛)+伊勢海老','회 모둠+이세에비','식음','restaurant','kitchen',20000,61),
    ('ADD-UNAGI','うなぎ蒲焼き(1尾)','장어구이(1마리)','식음','restaurant','kitchen',5000,62),
    ('ADD-WAGYU','和牛ステーキ(1枚)','와규 스테이크(1인분)','식음','restaurant','kitchen',5000,63),
    ('ADD-BASASHI','馬刺し(1人前)','말고기 육회(1인분)','식음','restaurant','kitchen',5000,64),
    -- ── おつまみ 안주(각 800) · 주방 · 税込 · 19:30까지 ──
    ('SN-TAKO','タコの唐揚げ','낙지튀김','식음','restaurant','kitchen',800,70),
    ('SN-POTE','フライドポテト','감자튀김','식음','restaurant','kitchen',800,71),
    ('SN-TORI','鶏の竜田揚げ','닭튀김','식음','restaurant','kitchen',800,72),
    ('SN-GOBO','スティックごぼう唐揚げ','우엉튀김','식음','restaurant','kitchen',800,73),
    ('SN-TAKOWASA','タコワサビ','문어 와사비','식음','restaurant','kitchen',800,74),
    -- ── 酒類持込料(주류 반입료) · 비조리(station=none) · 기타 ──
    ('CORK-1','酒類持込料(一般1本)','주류반입료(일반 1병/팩/캔)','기타','restaurant','none',1000,90),
    ('CORK-2','酒類持込料(洋酒・1L以上)','주류반입료(양주·1L 이상 댓병)','기타','restaurant','none',2000,91),
    ('CORK-3','酒類持込料(保管分)','주류반입료(보관분)','기타','restaurant','none',1000,92);
  end if;
end $$;

-- ============================================================================
--  끝.  (메뉴 수정·추가는 ops/hub/menu.html 또는 이 파일 재편집)
-- ============================================================================
