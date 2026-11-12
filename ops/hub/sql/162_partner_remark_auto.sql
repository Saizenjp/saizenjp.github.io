-- ============================================================================
-- 162_partner_remark_auto.sql — 수배 목록: 엠클릭 비고 자동 채움 · 송영 구간(공항/호텔/골프장·경유) · 등록표 별칭 (2026-11-03)
--
--  Min 2026-11-03: 「구마모토 시내·트라이얼 수배 파일 업로드 때 엠클릭 비고란에 싱글룸·골프장·호텔명(·여행사)을 기재 → 그걸 기준으로 블록을 잡게.
--                   지금 수배 목록은 너무 많은 걸 적어 넣어야 함」 「송영은 8명이면 한 대, 20명 이상 대형 팀이 아니면 마이크로보다 하이에스 먼저」
--                   「구마모토 공항·호텔·골프장 세 곳이 송영지, 서로 50분 정도라 경유가 있을 수 있음」 「담당자 2명」
--  ① partner_hotels.aliases / partner_courses.aliases — 비고에서 이름을 찾을 때 쓰는 별칭(쉼표 구분). seed 는 Min 이 쓰는 한글 표기 중심(아래).
--  ② partner_ops.auto_sig — 마지막 자동 채움에 쓴 비고 서명. 비고가 바뀌면 화면이 「비고 변경」을 보인다(자동으로 덮어쓰지 않는다).
--  ③ partner_golf.auto — 비고에서 자동으로 만든 줄(「비고대로」 다시 채울 때 이 줄만 바꾼다. 수기 줄은 보존).
--  ④ partner_dispatch.from_pt / via_pt / to_pt — 송영 구간의 출발·경유·도착지(airport|hotel|course|other). 없으면 leg 로 해석(in=공항→호텔 …).
--  RLS·RPC 변경 없음(anon secdef 15 유지). 멱등. 00_VERIFY 162.
--  적용: Supabase MCP(Min 「sql 162 적용해」) 또는 SQL Editor. 화면·step1 은 미적용이어도 동작(별칭=이름만 · 서명/auto/구간 없이 저장).
--  ✅ 적용 완료 2026-11-03(MCP, Min 「sql162 적용해줘」) — 검증: 컬럼 7 · 호텔 별칭 5 · 골프장 별칭 6 · 제약 partner_dispatch_pts_chk 1 · anon secdef 15 유지.
-- ============================================================================

-- ① 별칭
alter table public.partner_hotels  add column if not exists aliases text;
alter table public.partner_courses add column if not exists aliases text;
update public.partner_hotels set aliases = v.a from (values
  ('ワシントンホテル', '워싱턴,워싱톤,ワシントン,washington'),
  ('アマネクホテル',   '아마넥,アマネク,amanek'),
  ('ホテルタウ',       '타우,タウ,tau'),
  ('相鉄ホテル',       '소테츠,소테쓰,相鉄,sotetsu'),
  ('カンデオホテル',   '칸데오,カンデオ,candeo')) as v(n, a)
 where partner_hotels.name_ja = v.n and partner_hotels.aliases is null;
update public.partner_courses set aliases = v.a from (values
  ('グランドチャンピオンゴルフクラブ', '그랜드챔피언,그랜드 챔피언,그랜드,그챔,グランドチャンピオン,grand champion'),
  ('熊本中央カントリークラブ',         '추오,츄오,중앙,구마모토중앙,구마모토 중앙,熊本中央,中央,chuo'),
  ('阿蘇グリーンヒルカントリークラブ', '그린힐,그린 힐,아소그린힐,아소 그린힐,グリーンヒル,green hill,greenhill'),
  ('KAOゴルフ倶楽部',                  'KAO,카오'),
  ('阿蘇トライアル',                   '아소트라이얼,아소 트라이얼,阿蘇トライアル,aso trial'),
  ('南阿蘇トライアル',                 '미나미아소트라이얼,미나미아소 트라이얼,미나미 아소,미나미아소,南阿蘇トライアル,南阿蘇,minami aso')) as v(n, a)
 where partner_courses.name_ja = v.n and partner_courses.aliases is null;

-- ② 자동 채움 서명 · ③ 자동 골프 줄
alter table public.partner_ops  add column if not exists auto_sig text;
alter table public.partner_golf add column if not exists auto boolean not null default false;

-- ④ 송영 구간(출발·경유·도착)
alter table public.partner_dispatch add column if not exists from_pt text;
alter table public.partner_dispatch add column if not exists via_pt  text;
alter table public.partner_dispatch add column if not exists to_pt   text;
do $do$ begin
  if not exists (select 1 from pg_constraint where conname='partner_dispatch_pts_chk') then
    alter table public.partner_dispatch add constraint partner_dispatch_pts_chk check (
      (from_pt is null or from_pt in ('airport','hotel','course','other')) and
      (via_pt  is null or via_pt  in ('airport','hotel','course','other')) and
      (to_pt   is null or to_pt   in ('airport','hotel','course','other')));
  end if;
end $do$;

-- 확인
-- select count(*) from information_schema.columns where table_schema='public' and ((table_name='partner_hotels' and column_name='aliases') or (table_name='partner_courses' and column_name='aliases') or (table_name='partner_ops' and column_name='auto_sig') or (table_name='partner_golf' and column_name='auto') or (table_name='partner_dispatch' and column_name in ('from_pt','via_pt','to_pt')));  -- 7
-- select count(*) from partner_hotels where aliases is not null;   -- 5 (seed 호텔)
-- select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'execute');  -- 15 (불변)
