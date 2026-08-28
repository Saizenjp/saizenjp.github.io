-- ============================================================================
--  127_marshal_player_no.sql — 마샬 Ai 플레이어 번호(그날 고정) (Min 2026-08)
-- ----------------------------------------------------------------------------
--  테크노크래프트 「フロント系システム IF v6.0.2」 프레이어 정보 파일의 ③プレーヤ番号는
--  **당일 유니크**여야 하고, 스펙에 이런 주의문이 있다:
--    「プレーヤ番号でスコア情報を保管しており、番号が変わるとそれまでのスコアが消えてしまいます」
--  → 파일을 다시 내보낼 때마다 번호가 흔들리면 그날 스코어가 날아간다.
--    그래서 한 번 준 번호를 (그날, 사람) 으로 붙들어 둔다.
--
--  멱등. Supabase SQL Editor 또는 MCP apply_migration.
-- ============================================================================

create table if not exists public.marshal_player_no (
  play_date  date not null,
  member_id  uuid not null,
  player_no  int  not null,
  created_at timestamptz not null default now(),
  primary key (play_date, member_id),
  unique (play_date, player_no)
);
alter table public.marshal_player_no enable row level security;
drop policy if exists mpn_read on public.marshal_player_no;
create policy mpn_read on public.marshal_player_no for select to authenticated
  using ( is_admin() or has_any_read_area(array['golf','print']) );

--  없는 사람에게만 다음 번호를 준다. 이미 있으면 그대로 돌려준다.
create or replace function public.marshal_assign_player_no(p_date date, p_ids uuid[])
returns table(member_id uuid, player_no int)
language plpgsql security definer set search_path = public as $$
declare v_next int;
begin
  if not (is_admin() or has_any_area(array['golf','print'])) then
    raise exception '권한 없음(마샬 명단 — 관리자 또는 golf·print 권한자)';
  end if;
  --  같은 날에 두 사람이 동시에 눌러도 번호가 겹치지 않게 그 날짜를 잠근다.
  perform pg_advisory_xact_lock(hashtext('marshal_player_no:' || p_date::text));
  select coalesce(max(m.player_no),0) into v_next from marshal_player_no m where m.play_date = p_date;
  insert into marshal_player_no(play_date, member_id, player_no)
  select p_date, x.id, v_next + row_number() over (order by x.ord)
  from (select u.id, u.ord from unnest(p_ids) with ordinality as u(id, ord)) x
  where not exists (select 1 from marshal_player_no m
                    where m.play_date = p_date and m.member_id = x.id)
  on conflict do nothing;
  return query
    select m.member_id, m.player_no from marshal_player_no m
    where m.play_date = p_date and m.member_id = any(p_ids);
end $$;
revoke execute on function public.marshal_assign_player_no(date, uuid[]) from public;
grant  execute on function public.marshal_assign_player_no(date, uuid[]) to authenticated;

-- 확인:
--   select count(*) from marshal_player_no where play_date = current_date;
