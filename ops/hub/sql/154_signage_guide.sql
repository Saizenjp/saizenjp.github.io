-- ============================================================================
-- 154_signage_guide.sql — 안내·광고 화면(43형, signage.html?screen=guide) (2026-10-27)
--  Min 2026-10-27 「디지털 월 통로는 1층 엘리베이터 앞의 화면이기 때문에 일단 없애도 됨」
--                 「그대신 업체에서 받은 광고와 함께 기본 안내 즉, 골프장 매너·대욕장 매너·레스토랑 매너·리조트 매너 정도만
--                   만들어서 동일하게 내보낼 내용을 만들어야 함. 그걸 내보내는 모니터는 43인치 정도」
--  ① announcements.media_url / media_type — 홍보(kind=promo) 카드의 이미지·동영상(Storage 공개 URL). 없으면 글자 카드.
--  ② Storage 버킷 signage(public 읽기, 50MB, 이미지 jpg/png/webp/gif + 동영상 mp4) + objects 정책
--     읽기=전체(TV 는 로그인 없음) · 올리기/바꾸기/지우기=admin·manager(공지 보드 RLS 와 같은 기준)
--  ③ signage_texts 매너 안내 4종 seed(manner_golf·manner_bath·manner_restaurant·manner_resort, 줄바꿈=화면 한 줄, ko/ja 줄 수를 맞춘다)
--     — 초안. 공지 보드 「손님 화면 기본 문구」에서 고친다(on conflict do nothing: 이미 고친 값은 덮지 않는다).
--  ④ anon RPC signage_guide() — 매너 문구 + 화면=guide 홍보(공개 기간 안, 고정→정렬→최신, 12장까지). 이름·방번호·금액 없음.
--     anon 실행 가능 security definer 12 → 13 (00_VERIFY 139 갱신). 새 RPC 는 revoke public 동반(118/119 함정).
--  멱등. 되돌리기: drop function signage_guide(); 컬럼·버킷은 그대로 두어도 무해.
-- ============================================================================

-- ① 홍보 미디어
alter table public.announcements add column if not exists media_url  text;
alter table public.announcements add column if not exists media_type text;   -- 'image' | 'video'

-- ② Storage 버킷 + 정책
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signage', 'signage', true, 52428800, array['image/jpeg','image/png','image/webp','image/gif','video/mp4'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists signage_media_read on storage.objects;
create policy signage_media_read on storage.objects
  for select to public using (bucket_id = 'signage');
drop policy if exists signage_media_insert on storage.objects;
create policy signage_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'signage' and exists(select 1 from public.user_access where user_id = auth.uid() and role in ('admin','manager')));
drop policy if exists signage_media_update on storage.objects;
create policy signage_media_update on storage.objects
  for update to authenticated
  using (bucket_id = 'signage' and exists(select 1 from public.user_access where user_id = auth.uid() and role in ('admin','manager')))
  with check (bucket_id = 'signage' and exists(select 1 from public.user_access where user_id = auth.uid() and role in ('admin','manager')));
drop policy if exists signage_media_delete on storage.objects;
create policy signage_media_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'signage' and exists(select 1 from public.user_access where user_id = auth.uid() and role in ('admin','manager')));

-- ③ 매너 안내 4종(초안 — 공지 보드에서 고친다)
insert into public.signage_texts(key, ko, ja) values
  ('manner_golf',
   E'티오프 10분 전까지 스타트 장소에 모여 주세요\n앞 팀과의 간격을 지키고 플레이는 신속하게 부탁드립니다\n벙커는 정리하고, 디봇과 볼 마크는 원래대로 고쳐 주세요\n카트는 지정된 길로만 다니고 그린·티잉 그라운드 근처에는 들어가지 마세요\n다른 팀이 샷을 할 때는 조용히, 「포어!」 소리가 나면 바로 몸을 보호해 주세요\n흡연은 지정 장소에서만, 쓰레기는 되가져가 주세요',
   E'スタート10分前までにスタート地点にお集まりください\n前の組との間隔を保ち、プレーファストにご協力ください\nバンカーはならし、ディボット・ボールマークは直してください\nカートは指定の道のみ走行し、グリーン・ティーイングエリア付近には入らないでください\n他の組のショット中はお静かに、「フォアー！」の声にはすぐ身を守ってください\n喫煙は指定場所のみ、ゴミはお持ち帰りください'),
  ('manner_bath',
   E'탕에 들어가기 전에 몸을 깨끗이 씻어 주세요\n수건은 탕 안에 넣지 말고, 긴 머리는 묶어 주세요\n탕 안에서 수영·잠수·큰 소리는 삼가 주세요\n사진·동영상 촬영은 금지입니다\n음주 후나 몸이 불편할 때는 이용을 피해 주세요\n나갈 때는 몸의 물기를 닦고 탈의실로 가 주세요',
   E'浴槽に入る前に体をよく洗ってください\nタオルは浴槽に入れず、長い髪は束ねてください\n浴槽内での水泳・潜水・大声はお控えください\n写真・動画の撮影は禁止です\n飲酒後や体調が悪いときはご利用をお控えください\n出るときは体の水気を拭いて脱衣所へお進みください'),
  ('manner_restaurant',
   E'안내된 입장 시간 안에 오셔서 좌석 안내를 받아 주세요\n뷔페 음식은 먹을 만큼만 담아 주시고, 음식을 밖으로 가져가지 마세요\n외부 음식·주류 반입은 삼가 주세요\n다른 손님을 위해 큰 소리는 삼가 주세요\n알레르기·식단 요청은 담당자에게 미리 말씀해 주세요\n흡연은 지정 장소에서만 부탁드립니다',
   E'ご案内の入場時間内にお越しいただき、席のご案内をお受けください\nビュッフェはお召し上がりになる分だけお取りいただき、お料理の持ち出しはご遠慮ください\n外部からの飲食物・酒類のお持ち込みはご遠慮ください\n他のお客様のため、大きな声はお控えください\nアレルギー・お食事のご要望は事前にスタッフへお申し付けください\n喫煙は指定場所のみでお願いいたします'),
  ('manner_resort',
   E'밤 22시 이후 객실과 복도에서는 정숙해 주세요\n객실·복도·공용 공간은 금연입니다 (지정 흡연 장소를 이용해 주세요)\n쓰레기는 안내에 따라 분리해 주세요\n귀중품은 객실 금고 또는 프론트에 맡겨 주세요\n시설·비품이 파손되면 프론트에 알려 주세요\n체크아웃 시간과 송영 출발 시각은 프론트 안내를 확인해 주세요',
   E'22時以降は客室・廊下ではお静かにお願いいたします\n客室・廊下・共用スペースは禁煙です（指定の喫煙場所をご利用ください）\nゴミはご案内に従って分別してください\n貴重品は客室の金庫またはフロントにお預けください\n施設・備品を破損された場合はフロントへお知らせください\nチェックアウト時間・送迎の出発時刻はフロントのご案内をご確認ください')
on conflict (key) do nothing;

-- ④ 안내·광고 화면 RPC(anon) — 매너 문구 + 화면=guide 홍보
create or replace function public.signage_guide()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'ok', true,
    'today', (now() at time zone 'Asia/Tokyo')::date,
    'texts', (select coalesce(jsonb_object_agg(t.key, jsonb_build_object('ko', t.ko, 'ja', t.ja)), '{}'::jsonb)
                from signage_texts t where t.key like 'manner\_%'),
    'ads', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body,
                                                        'media_url', a.media_url, 'media_type', a.media_type, 'pinned', a.pinned)
                              order by a.pinned desc, a.sort_order, a.created_at desc), '[]'::jsonb)
              from (select * from announcements
                     where for_guests and kind = 'promo' and screens @> array['guide']
                       and (pin_until is null or pin_until > now())
                     order by pinned desc, sort_order, created_at desc limit 12) a)
  );
$$;
revoke execute on function public.signage_guide() from public;
grant  execute on function public.signage_guide() to anon, authenticated;

-- 확인
-- select id, public, file_size_limit from storage.buckets where id='signage';
-- select count(*) from signage_texts where key like 'manner\_%';                                   -- 4
-- select jsonb_array_length(signage_guide()->'ads'), jsonb_object_keys(signage_guide()->'texts');  -- 광고 수 / manner_* 4
