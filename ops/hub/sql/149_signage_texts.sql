-- ============================================================================
-- 149_signage_texts.sql — 손님 화면 기본 문구(Min 2026-10-26 「디폴트로 정해놓은 리조트의 안내 — 조식은 6:00 open, 8:00까지 입장 가능. close 안내는 따로 안 함」)
-- ----------------------------------------------------------------------------
--  signage_texts(key → ko/ja) : 디지털 월 「오늘의 식사 안내」 조식·중식 줄에 붙는 고정 문구. 공지 보드(board.html)에서 admin·manager 가 고친다.
--  signage_lobby 에 'texts' 동봉(148 본문 그대로, 한 줄 삽입). anon 실행 함수 12개 그대로. 멱등. MCP 적용 2026-10-26.
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
  ('lunch', '', '')
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
