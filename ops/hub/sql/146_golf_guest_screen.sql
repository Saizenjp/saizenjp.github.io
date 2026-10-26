-- ============================================================================
-- 146_golf_guest_screen.sql — 코스 배정표 3·4단계(Min 2026-10-25 밤 「순차적으로 진행」)
-- ----------------------------------------------------------------------------
--  ① golf_groups.lunch_after — 조별 식사 시점(9=9홀 뒤 식사 · 18=18홀 뒤 식사 · null=표시 없음). 손님 표에 「9H後 昼食」.
--  ② signage_release — 손님 화면 공개 제어(Min 「외부 모니터에 노출시킬 것인지 제어 — 최종본을 노출」).
--     (날짜, 화면) 마다 mode: snapshot=공개한 시점의 표(payload)만 보인다 / hidden=「준비 중」. 행이 없으면 종전처럼 실시간.
--     쓰기 = golf·print·front(코스=골프 담당, 석식=인쇄/프론트). 손님용 RPC 가 security definer 로 읽는다.
--  ③ _signage_course_live(p_date) — 실시간 계산 본체(136 본문 + start_hole·cart_no·전기카트 유무·pm_tee/pm_course·lunch_after·샷건 설정).
--     로그인(authenticated) 전용 — course.html 이 [손님 화면에 공개] 때 스냅샷 payload 로 쓴다.
--     signage_course(p_date)(anon) 는 release 를 보고 snapshot/hidden/live 를 돌려준다(released true/false/null).
--  ④ golf_add_charge — 코스 배정표 퀵 액션 「9홀 추가」 청구. charges 쓰기 RLS 가 settle·pos 뿐이라(100 과 같은 이유)
--     security definer 로 팀 folio(open·team) 를 찾거나 만들어 라운딩 구분으로 청구. 권한 = admin 또는 golf·front·settle·pos.
--     전기카트 추가는 RPC 가 아니라 cart_bookings 신청(트리거 100/116 이 요금) — 여기 없음.
--  anon 실행 함수는 그대로 12개(signage_course 만 anon, 새 함수 2개는 authenticated). 멱등. MCP 적용 2026-10-26(Min 승인).
-- ============================================================================
alter table public.golf_groups add column if not exists lunch_after smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='golf_groups_lunch_after_chk') then
    alter table public.golf_groups add constraint golf_groups_lunch_after_chk check (lunch_after is null or lunch_after in (9,18));
  end if;
end $$;

create table if not exists public.signage_release (
  play_date   date not null,
  screen      text not null check (screen in ('course','dinner','wall')),
  mode        text not null default 'snapshot' check (mode in ('snapshot','hidden')),
  payload     jsonb,
  released_by text,
  released_at timestamptz not null default now(),
  primary key (play_date, screen)
);
alter table public.signage_release enable row level security;
drop policy if exists signage_release_sel on public.signage_release;
create policy signage_release_sel on public.signage_release for select to authenticated using (true);
drop policy if exists signage_release_ins on public.signage_release;
create policy signage_release_ins on public.signage_release for insert to authenticated with check (has_any_area(array['golf','print','front']));
drop policy if exists signage_release_upd on public.signage_release;
create policy signage_release_upd on public.signage_release for update to authenticated using (has_any_area(array['golf','print','front'])) with check (has_any_area(array['golf','print','front']));
drop policy if exists signage_release_del on public.signage_release;
create policy signage_release_del on public.signage_release for delete to authenticated using (has_any_area(array['golf','print','front']));

-- ── ③ 실시간 계산 본체(로그인 전용) ───────────────────────────────────────
create or replace function public._signage_course_live(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_d date := coalesce(p_date, v_today);
  v_groups jsonb; v_total int; v_n int; v_ds record;
begin
  select * into v_ds from golf_day_settings where play_date = v_d;
  with g as (
    select gg.id, gg.course_code, gg.slot_no, gg.tee_time, gg.capacity, gg.label, gg.event_seq, gg.cart_no,
           gg.start_hole, gg.pm_tee, gg.pm_course, gg.lunch_after,
           b.rep_name,
           coalesce(
             (select regexp_replace(gm.person_tag, '-([0-9]+)([A-Za-z]*)$', '-\2')
                from guest_members gm where gm.event_seq = gg.event_seq and gm.person_tag is not null
                order by gm.is_rep desc, gm.seq_in_team limit 1),
             gs.team_tag, gs.group_code, gg.label, '') as tag,
           (select count(*) from golf_group_members m
              where m.group_id = gg.id
                and not exists (select 1 from golf_absentees a where a.play_date = gg.play_date and a.member_id = m.member_id)) as mem_n,
           -- 전기카트 유무 = 그날 그 팀 전기카트 신청(취소분 제외) 대수
           coalesce((select sum(coalesce(cb.qty,0) - coalesce(cb.cancelled,0)) from cart_bookings cb
                      where cb.play_date = gg.play_date and cb.event_seq = gg.event_seq and cb.cart_code = 'electric'), 0) as ev_qty
    from golf_groups gg
    left join bookings b on b.event_seq = gg.event_seq
    left join guests gs on gs.event_seq = gg.event_seq
    where gg.play_date = v_d
      and gg.course_code is not null and gg.slot_no is not null
      and (gg.event_seq is not null or coalesce(gg.label,'') <> '')
      and coalesce(b.status,'') <> '대기'
      and not exists (select 1 from golf_skips sk where sk.play_date = gg.play_date and sk.event_seq = gg.event_seq)
  ),
  g2 as (
    select *, case when mem_n > 0 then mem_n else coalesce(capacity,0) end as pax,
           case when event_seq is null then 0
                when count(*) over (partition by event_seq) < 2 then 0
                else row_number() over (partition by event_seq order by slot_no, course_code) end as gno
    from g
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'course', course_code, 'slot', slot_no, 'tee', tee_time, 'tag', tag, 'rep', rep_name,
           'pax', pax, 'gno', gno, 'walkin', event_seq is null,
           'hole', start_hole, 'cart', cart_no, 'ev', (ev_qty > 0), 'ev_qty', ev_qty,
           'pm_tee', pm_tee, 'pm_course', pm_course, 'lunch', lunch_after)
           order by slot_no, course_code), '[]'::jsonb),
         coalesce(sum(pax),0)::int, count(*)::int
    into v_groups, v_total, v_n
  from g2;

  return jsonb_build_object('ok', true, 'date', v_d, 'today', v_today,
                            'groups', v_groups, 'total', v_total, 'n', v_n,
                            'shotgun', coalesce(v_ds.shotgun, false), 'shotgun_time', v_ds.shotgun_time);
end $$;
revoke execute on function public._signage_course_live(date) from public, anon;
grant  execute on function public._signage_course_live(date) to authenticated;

-- ── 손님용(anon) — 공개 제어를 본다 ─────────────────────────────────────────
create or replace function public.signage_course(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_d date := coalesce(p_date, v_today);
  v_rel record;
begin
  if v_d < v_today or v_d > v_today + 1 then
    return jsonb_build_object('date', v_d, 'ok', false, 'reason', 'out_of_range');
  end if;
  select * into v_rel from signage_release where play_date = v_d and screen = 'course';
  if v_rel.mode = 'hidden' then
    return jsonb_build_object('ok', true, 'date', v_d, 'today', v_today, 'released', false,
                              'groups', '[]'::jsonb, 'total', 0, 'n', 0);
  end if;
  if v_rel.mode = 'snapshot' and v_rel.payload is not null then
    return v_rel.payload || jsonb_build_object('today', v_today, 'released', true, 'released_at', v_rel.released_at);
  end if;
  return _signage_course_live(v_d) || jsonb_build_object('released', null);
end $$;
revoke execute on function public.signage_course(date) from public;
grant  execute on function public.signage_course(date) to anon, authenticated;

-- ── ④ 9홀 추가 청구(퀵 액션) ────────────────────────────────────────────────
create or replace function public.golf_add_charge(p_seq bigint, p_desc text, p_price int, p_qty int, p_link text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_folio uuid; v_ym text; v_gross int; v_tax int; v_id uuid; v_by text;
begin
  if not (is_admin() or has_any_area(array['golf','front','settle','pos'])) then
    raise exception 'permission denied (golf_add_charge)';
  end if;
  if p_price is null or p_price < 0 or p_qty is null or p_qty < 1 then raise exception 'bad amount'; end if;
  v_by := coalesce(nullif(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'name',''),
                   current_setting('request.jwt.claims', true)::jsonb->>'email');
  select id into v_folio from folios where event_seq = p_seq and subject = 'team' and status = 'open' order by opened_at limit 1;
  if v_folio is null then
    select to_char(dep_date,'YYYY-MM') into v_ym from bookings where event_seq = p_seq;
    insert into folios(event_seq, subject, status, session_ym, created_by) values (p_seq, 'team', 'open', v_ym, v_by) returning id into v_folio;
  end if;
  v_gross := p_price * p_qty; v_tax := round(v_gross - v_gross / 1.1);
  insert into charges(folio_id, event_seq, member_id, category, source, description, qty, unit_price, amount, tax, service_charge, link_ref, created_by)
  values (v_folio, p_seq, null, '라운딩', 'golf', p_desc || case when p_qty > 1 then ' ×'||p_qty else '' end,
          p_qty, p_price, v_gross - v_tax, v_tax, 0, p_link, v_by)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.golf_add_charge(bigint, text, int, int, text) from public, anon;
grant  execute on function public.golf_add_charge(bigint, text, int, int, text) to authenticated;
