-- ============================================================================
--  198_signage_promo_media.sql — 로비·2층 석식·코스 모니터에도 홍보 이미지·동영상
--  상태: 적용 전
-- ----------------------------------------------------------------------------
--  Min 2026-11-26 「모니터에 올리는 거 이미지 파일도 따로 만들어서 올릴 수 있게 기능 추가해」
--  지금까지 공지 보드 홍보의 이미지·동영상(announcements.media_url, SQL 154)은 안내·광고(43형) 화면(signage_guide)만 보였다.
--  로비·2층 석식·코스 화면이 쓰는 _signage_promos(screen)(SQL 148)는 제목·본문만 줬다.
--  → _signage_promos 가 id · media_url · media_type 도 준다. 화면(signage.html)은
--     로비 = 이미지 한 장을 화면 전체 한 쪽으로 돌림 · 2층 석식·코스 = 아래 띠에 작은 그림.
--  손님(anon) 화면에 나가는 값이 늘지만, media_url 은 원래 공개 버킷(signage)의 공개 주소이고
--  안내·광고 화면(signage_guide)이 이미 같은 값을 anon 에 준다 — 새로 열리는 정보는 없다.
--  같은 함수 정의를 바꾸는 것뿐이라 멱등. 되돌리기: SQL 148 의 _signage_promos 정의로 다시 만든다.
-- ============================================================================

do $chk$
begin
  if to_regprocedure('public._signage_promos(text)') is null then raise exception '198: _signage_promos 가 없다(SQL 148 먼저)'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'announcements' and column_name = 'media_url') then
    raise exception '198: announcements.media_url 이 없다(SQL 154 먼저)';
  end if;
end $chk$;

create or replace function public._signage_promos(p_screen text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'pinned', a.pinned,
                                               'media_url', a.media_url, 'media_type', a.media_type)
           order by a.pinned desc, a.sort_order, a.created_at desc), '[]'::jsonb)
  from (select * from announcements
         where for_guests and kind = 'promo' and screens @> array[p_screen]
           and (pin_until is null or pin_until > now())
         order by pinned desc, sort_order, created_at desc limit 6) a;
$$;
revoke execute on function public._signage_promos(text) from public, anon;
grant  execute on function public._signage_promos(text) to authenticated;
comment on function public._signage_promos(text) is '148·198 — 화면별 홍보(제목·본문·고정 + 이미지·동영상 공개 주소).';

do $post$
begin
  if position('media_url' in (select prosrc from pg_proc where oid = 'public._signage_promos(text)'::regprocedure)) = 0 then
    raise exception '198: _signage_promos 에 media_url 이 없다';
  end if;
  if has_function_privilege('anon', 'public._signage_promos(text)', 'execute') then
    raise exception '198: anon 이 _signage_promos 를 직접 부를 수 있다';
  end if;
end $post$;

notify pgrst, 'reload schema';
