-- ============================================================================
-- 149_signage_texts.sql — 손님 화면 기본 문구(Min 2026-10-26 「디폴트로 정해놓은 리조트의 안내 — 조식은 6:00 open, 8:00까지 입장 가능. close 안내는 따로 안 함」)
-- ----------------------------------------------------------------------------
--  signage_texts(key → ko/ja) : 디지털 월 「오늘의 식사 안내」 조식·중식 줄에 붙는 고정 문구. 공지 보드(board.html)에서 admin·manager 가 고친다.
--  키: breakfast·lunch·dinner(입장 안내, 월·2층·로비) · bath(1층 대욕장, 「리조트 안내」 카드, 줄바꿈=화면 줄). signage_lobby·signage_dinner 에 'texts' 동봉(148 본문 한 줄 교체). anon 실행 함수 12개 그대로. 멱등. MCP 적용 2026-10-26(검증: seed 4·RPC texts·anon secdef 12).
-- ============================================================================
create table if not exists public.signage_texts (
  key        text primary key,
  ko         text not null default '',
  ja         text not null default '',
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.signage_texts enable row level security;
drop policy if exists signage_texts_sel on public.signage_texts;
create policy signage_texts_sel on public.signage_texts for select to authenticated using (true);
drop policy if exists signage_texts_wr on public.signage_texts;
create policy signage_texts_wr on public.signage_texts for all to authenticated
  using (exists(select 1 from user_access where user_id = auth.uid() and role in ('admin','manager')))
  with check (exists(select 1 from user_access where user_id = auth.uid() and role in ('admin','manager')));
insert into public.signage_texts(key, ko, ja) values
  ('breakfast', '06:00 오픈 · 08:00까지 입장 가능', '06:00 オープン · 08:00 まで入場可'),
  ('lunch',     '10:30 오픈 · 13:30까지 입장 가능', '10:30 オープン · 13:30 まで入場可'),
  ('dinner',    '17:50 오픈 · 18:30까지 입장 가능', '17:50 オープン · 18:30 まで入場可'),
  ('bath',      E'05:00~22:00 오픈\n타올은 객실에서 가져와 주세요\n청소 시간 08:00~11:00 이용 불가\n일·수·목요일은 09:00부터 탕(욕조) 이용 불가 — 샤워만 가능',
                E'05:00〜22:00\nタオルはお部屋からお持ちください\n清掃時間 08:00〜11:00 はご利用いただけません\n日・水・木曜日は 09:00 から浴槽はご利用いただけません（シャワーのみご利用可）')
on conflict (key) do nothing;

do $do$
declare v_src text;
begin
  select pg_get_functiondef('public.signage_lobby(date)'::regprocedure) into v_src;
  if position('signage_texts' in v_src) > 0 then return; end if;   -- 이미 적용
  if position($a$'promos', _signage_promos('lobby'),$a$ in v_src) = 0 then
    raise exception 'signage_lobby: anchor not found (148 applied?)';
  end if;
  v_src := replace(v_src, $a$'promos', _signage_promos('lobby'),$a$,
                          $a$'texts', (select coalesce(jsonb_object_agg(t.key, jsonb_build_object('ko', t.ko, 'ja', t.ja)), '{}'::jsonb) from signage_texts t),
    'promos', _signage_promos('lobby'),$a$);
  execute v_src;
end $do$;
revoke execute on function public.signage_lobby(date) from public;
grant  execute on function public.signage_lobby(date) to anon, authenticated;

-- 2층 석식 RPC 에도 texts 동봉(입장 안내 문구) — 148 의 v_pr 한 줄만 바꾼다. 스냅샷·숨김·실시간 세 경로 모두 || v_pr 라 함께 실린다.
do $do$
declare v_src text;
begin
  select pg_get_functiondef('public.signage_dinner(date)'::regprocedure) into v_src;
  if position('signage_texts' in v_src) > 0 then return; end if;   -- 이미 적용
  if position($a$v_pr := jsonb_build_object('promos', _signage_promos('dinner'));$a$ in v_src) = 0 then
    raise exception 'signage_dinner: anchor not found (148 applied?)';
  end if;
  v_src := replace(v_src, $a$v_pr := jsonb_build_object('promos', _signage_promos('dinner'));$a$,
                          $a$v_pr := jsonb_build_object('promos', _signage_promos('dinner'),
                          'texts', (select coalesce(jsonb_object_agg(t.key, jsonb_build_object('ko', t.ko, 'ja', t.ja)), '{}'::jsonb) from signage_texts t));$a$);
  execute v_src;
end $do$;
revoke execute on function public.signage_dinner(date) from public;
grant  execute on function public.signage_dinner(date) to anon, authenticated;
