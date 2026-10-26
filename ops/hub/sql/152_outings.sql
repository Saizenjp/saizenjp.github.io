-- ============================================================================
-- 152_outings.sql — 신청제 행사(라운딩 대신 쇼핑·관광 안내, 희망자만)
--
--  Min 2026-10-26 「어느 날 라운딩을 하지 않고 쇼핑이나 다른 안내를 하는 경우 — 전체가 아니라 신청자만 간다」
--                 「팀의 개인들만 신청도 할 수 있음(한 명·두 명, 나머지는 라운딩) → 코스 배정표에도 같이 연동」
--   · outings = 날짜별 행사(종류·제목 한/일·집합 시각/장소·귀환·정원·1인 요금·차량·안내·상태). 신청 인원 signed 는 트리거가 유지.
--   · outing_signups = 개인 단위 신청(guest_members.id). 팀 안에서 일부만 신청할 수 있다.
--   · 코스 배정표 연동 = 트리거가 golf_absentees(106) 에 「[outing#id] 제목」 사유로 불참을 넣고/빼서, 그날 조편성·손님 코스 화면·마샬 명단에서 자동으로 빠진다.
--     (course.html 은 로드 때 applyAbsentToBoard 로 이미 짜인 조에서도 뺀다.) 수기로 넣은 다른 사유의 불참은 건드리지 않는다(on conflict do nothing / 태그로만 삭제).
--   · 읽기: outings 는 anon 포함(로비 안내 모니터 「오늘의 안내」 — 제목·시각·장소·인원만, 개인정보 없음) / outing_signups 는 로그인 전체.
--     쓰기: admin 또는 front·golf 영역. RPC 추가 없음(anon secdef 12 유지). 트리거 함수는 security definer(RLS 우회해 golf_absentees 기록).
--  멱등(drop 없이 — if not exists / create or replace / DO 블록). 적용: Supabase MCP execute_sql(2026-10-26).
-- ============================================================================

create table if not exists public.outings (
  id           bigint generated always as identity primary key,
  outing_date  date not null,
  kind         text not null default 'shopping' check (kind in ('shopping','tour','other')),
  title_ko     text not null default '',
  title_ja     text not null default '',
  meet_time    time,
  meet_place   text not null default '',
  return_time  time,
  capacity     int,                                   -- null = 제한 없음
  fee          int,                                   -- 1인 요금(엔), null = 무료/미정
  vehicle      text not null default '',              -- 차량·기사 메모
  note_ko      text not null default '',
  note_ja      text not null default '',
  status       text not null default 'open' check (status in ('open','closed','cancelled')),
  signed       int  not null default 0,               -- 신청 인원(트리거)
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists outings_date_idx on public.outings(outing_date);

create table if not exists public.outing_signups (
  outing_id  bigint not null references public.outings(id) on delete cascade,
  member_id  uuid   not null references public.guest_members(id) on delete cascade,
  event_seq  bigint not null references public.bookings(event_seq) on delete cascade,
  note       text   not null default '',
  signed_by  text,
  signed_at  timestamptz not null default now(),
  primary key (outing_id, member_id)
);
create index if not exists outing_signups_seq_idx on public.outing_signups(event_seq);

alter table public.outings        enable row level security;
alter table public.outing_signups enable row level security;
grant select on public.outings to anon;
revoke insert, update, delete on public.outings from anon;
revoke all on public.outing_signups from anon;
grant select, insert, update, delete on public.outings        to authenticated;
grant select, insert, update, delete on public.outing_signups to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='outings' and policyname='outings_read') then
    create policy outings_read on public.outings for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='outings' and policyname='outings_write') then
    create policy outings_write on public.outings for all to authenticated
      using (is_admin() or has_any_area(array['front','golf'])) with check (is_admin() or has_any_area(array['front','golf']));
  end if;
  if not exists (select 1 from pg_policies where tablename='outing_signups' and policyname='outing_signups_read') then
    create policy outing_signups_read on public.outing_signups for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='outing_signups' and policyname='outing_signups_write') then
    create policy outing_signups_write on public.outing_signups for all to authenticated
      using (is_admin() or has_any_area(array['front','golf'])) with check (is_admin() or has_any_area(array['front','golf']));
  end if;
end $$;

-- 신청 ↔ 코스 배정표(golf_absentees) 동기 + signed 집계. 사유 태그 '[outing#<id>]' 로 우리가 넣은 행만 지운다.
create or replace function public.outing_sync(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select * into o from outings where id = p_id;
  delete from golf_absentees where reason like '[outing#' || p_id || ']%';
  if o.id is null then return; end if;
  if o.status <> 'cancelled' then
    insert into golf_absentees(play_date, member_id, event_seq, reason, created_by)
      select o.outing_date, s.member_id, s.event_seq,
             '[outing#' || o.id || '] ' || coalesce(nullif(o.title_ko,''), nullif(o.title_ja,''), '行事'), s.signed_by
        from outing_signups s where s.outing_id = o.id
    on conflict (play_date, member_id) do nothing;   -- 다른 사유로 이미 불참이면 그대로(수기 우선)
  end if;
  update outings set signed = (select count(*) from outing_signups where outing_id = p_id), updated_at = now() where id = p_id;
end $$;
revoke all on function public.outing_sync(bigint) from public, anon;
grant execute on function public.outing_sync(bigint) to authenticated;

create or replace function public.outing_signups_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin perform outing_sync(coalesce(new.outing_id, old.outing_id)); return null; end $$;
create or replace function public.outings_upd_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin perform outing_sync(new.id); return null; end $$;
create or replace function public.outings_del_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin delete from golf_absentees where reason like '[outing#' || old.id || ']%'; return old; end $$;
revoke all on function public.outing_signups_trg() from public, anon, authenticated;
revoke all on function public.outings_upd_trg()    from public, anon, authenticated;
revoke all on function public.outings_del_trg()    from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='outing_signups_sync') then
    create trigger outing_signups_sync after insert or delete on public.outing_signups for each row execute function public.outing_signups_trg();
  end if;
  if not exists (select 1 from pg_trigger where tgname='outings_sync') then
    create trigger outings_sync after update of outing_date, status, title_ko, title_ja on public.outings for each row execute function public.outings_upd_trg();
  end if;
  if not exists (select 1 from pg_trigger where tgname='outings_del_sync') then
    create trigger outings_del_sync before delete on public.outings for each row execute function public.outings_del_trg();
  end if;
end $$;
