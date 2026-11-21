-- ============================================================================
--  185_outing_day_sync.sql — 신청 행사 → 코스 불참: 같은 날 두 행사에 신청한 사람이 한쪽을 취소·삭제해도 불참에서 빠지지 않게
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  무엇이 문제였나
--   신청 행사(152)는 트리거가 신청자를 golf_absentees(106)에 「[outing#행사번호] 제목」 사유로 넣어, 그날 코스 배정표·
--   손님 코스 화면·마샬 명단에서 뺀다. 불참 줄은 (날짜, 사람)마다 한 줄이다(기본 키).
--   outing_sync(행사) 는 「자기 행사 사유 줄만 지우고 자기 신청자를 다시 넣는다(on conflict do nothing)」였다.
--   한 사람이 같은 날 행사 A·B 에 둘 다 신청하면 줄은 먼저 동기된 A 쪽 하나뿐이고, B 쪽 줄은 conflict 로 처음부터 없다.
--   → A 를 취소하거나 지우거나, 그 사람의 A 신청만 취소하거나, A 의 날짜를 옮기면 A 줄이 지워지고 B 줄은 생기지 않아
--     B 에 가는 사람이 코스 배정표에 「참가」로 돌아온다(다음에 B 가 다시 동기될 때까지 — 화면에는 아무 표시가 없다).
--
--  어떻게 고쳤나
--   새 내부 함수 _outing_day_sync(날짜, 뺄 행사) — 그날의 [outing#] 사유 줄 전체를 다시 계산한다.
--    ① 그날 [outing#…] 줄 가운데 「그 행사가 그날·취소 아님·그 사람이 신청한 상태」가 아닌 줄을 지운다
--       (취소·삭제·날짜를 옮긴 행사, 신청을 취소한 사람, 없는 행사 번호로 남은 줄).
--    ② 남은 줄의 사유 글자를 지금 제목으로 맞춘다(종전과 같은 「[outing#번호] 제목」 — 한국어 제목, 없으면 일본어, 없으면 行事).
--    ③ 그날 취소 아닌 행사(모집 중·마감)의 신청자 가운데 불참 줄이 없는 사람을 넣는다.
--       한 사람이 그날 여러 행사에 신청했으면 번호가 가장 작은(먼저 만든) 행사로 적는다.
--       이미 다른 행사의 맞는 줄이 있으면 그 줄을 그대로 둔다(행사를 다시 열거나 제목을 고쳐도 줄이 옮겨 다니지 않게).
--    · 수기 불참(사유가 [outing# 로 시작하지 않는 줄 · 사유가 빈 줄)은 지우지도 고치지도 않는다.
--      수기 불참이 있는 사람은 종전처럼 수기가 우선이다(on conflict do nothing).
--    · 예약·명단이 남아 있는 신청만 넣는다 — 예약을 지울 때 연쇄 삭제 도중 지워지는 팀을 다시 넣어 외래 키 오류가 나지 않게.
--    · 같은 날짜를 두 곳에서 동시에 고치면 날짜별 잠금(pg_advisory_xact_lock, 127 과 같은 꼴)으로 한 줄로 세운다.
--   outing_sync(행사) = 그 행사의 날짜 + 그 행사 사유 줄이 남아 있는 날짜(날짜를 옮기기 전 옛 날짜)마다 _outing_day_sync,
--                        그다음 signed 집계(종전 그대로).
--   outings_del_trg(행사 삭제 직전) = 그 행사를 뺀 채로 그 날짜(와 그 행사 줄이 남은 날짜)를 다시 계산 → 다른 행사 신청자가 남는다.
--   확인만(바꾸지 않음 — ⓪ 가 검사): outing_signups_trg(신청 추가·취소 → outing_sync) · outings_upd_trg(행사 날짜·상태·제목 수정 → outing_sync —
--     옛 날짜는 outing_sync 가 「그 행사 줄이 남은 날짜」로 찾는다. 그 행사 줄이 없던 옛 날짜는 바뀔 것이 없다)
--     · 트리거 3개의 표·함수·시점·사건·대상 열·켜짐.
--   ⑤ 오늘(JST) 이후 날짜를 한 번 다시 맞춘다(이미 빠져 있던 사람을 되살린다 — 지움·넣음·사유 바뀜 줄 수를 notice 로 낸다).
--     지난 날짜는 기록이라 건드리지 않는다.
--
--  하지 않는 일: 수기 불참 줄 변경 · 지난 날짜 불참 줄 변경(⑤) · 트리거 정의 변경 · 표·RLS·권한 영역 변경 · 화면 변경(설명서 한 문장만).
--  알려진 한계(종전과 같다): 수기 불참 때문에 행사 줄이 들어가지 못한 사람은, 코스 배정표에서 그 수기 불참을 풀면 그날의 다음 동기
--   (그날 행사의 신청·수정) 때까지 「참가」로 보인다 — golf_absentees 쪽 트리거는 만들지 않았다.
--   지난 행사를 고치면(제목 등) outing_sync 가 그 지난 날짜 하루를 다시 계산한다(종전에도 그 행사 줄은 다시 썼다).
--  권한: outing_sync = security definer · search_path public · 로그인 사용자 실행(anon 불가) — 종전 그대로.
--        outings_del_trg = security definer · search_path public · 실행 권한 회수 — 종전 그대로.
--        _outing_day_sync = 일반 함수(security definer 아님 — 부르는 security definer 함수의 권한으로 돈다, 175 의 charge_link_sync 와 같은 꼴)
--        · public·anon·authenticated 실행 권한 회수. anon 이 실행할 수 있는 security definer 함수 수 변동 없음(15).
--        155 의 손님 QR 신청(guest_outing_set, anon)도 신청 트리거를 거쳐 소유자 권한으로 돈다 — 그대로 된다.
--  멱등(⓪ 가 이미 185 판이면 건너뛰고 같은 정의로 다시 만든다 · ⑤ 는 다시 돌려도 바뀌는 줄이 없다). 106·152 이후.
--  152 의 outing_sync·outings_del_trg 정의는 이 파일이 대체한다(152 머리말에 「185 가 대체」 한 줄 제안).
--   ⚠ 152 를 다시 실행했다면 이 파일을 다시 실행한다(⓪ 가 152 판을 알아본다).
--  되돌리는 법:
--   ① (권장) 적용 직전에 두 함수의 정의를 떠 둔다 — 되돌릴 때 그대로 다시 실행한다.
--        select pg_get_functiondef('public.outing_sync(bigint)'::regprocedure);
--        select pg_get_functiondef('public.outings_del_trg()'::regprocedure);
--   ② 떠 둔 것이 없으면 152 의 outing_sync create 문과 바로 아래 revoke·grant 두 줄, outings_del_trg create 문과
--      그 revoke 한 줄만 다시 실행한다(운영 본문 = 152 에서 주석만 뺀 것 — ⓪ 의 기대값이 그 판이다).
--   ③ 그다음 drop function public._outing_day_sync(date, bigint);   (① 또는 ② 를 먼저 — 두 함수가 부르고 있다)
--   ⑤ 에서 되살린 불참 줄은 되돌리지 않는다(되돌리면 그 사람이 다시 「참가」로 나온다).
--  확인: 00_VERIFY 185 행(2줄).
-- ============================================================================

-- ── ⓪ 적용 전 검사 — 바꾸는 두 함수(outing_sync·outings_del_trg)와 그대로 두는 두 함수(outings_upd_trg·outing_signups_trg)가
--      기대한 판(152 에서 주석을 뺀 것)과 같은 로직인가 · 트리거 3개가 152 그대로 걸려 있고 켜져 있는가 ──
--   주석과 공백을 뺀 글자의 md5 로 비교한다(175 ⓪ 와 같은 식). 2026-11-21 운영 대조: outing_sync·outing_signups_trg 일치.
--   outings_upd_trg·outings_del_trg 와 트리거의 시점·대상 열은 운영 값을 받지 못해 저장소 152 로만 계산했다(다르면 여기서 멈춘다).
--   tgtype: 13 = 행 단위 AFTER INSERT OR DELETE · 17 = 행 단위 AFTER UPDATE · 11 = 행 단위 BEFORE DELETE.
--   다르면 멈춘다 — 운영에만 있는 로직을 이 파일이 모르고 덮어쓰지 않게.
do $chk$
declare
  r     record;
  v_src text;
  v_md5 text;
  v_cmt text := '-' || '-[^' || chr(10) || ']*';
  v_ws  text := '[ ' || chr(9) || chr(13) || chr(10) || ']+';
begin
  if to_regclass('public.outings') is null or to_regclass('public.outing_signups') is null or to_regclass('public.golf_absentees') is null then
    raise exception '185: outings·outing_signups·golf_absentees 표가 없다 — 106·152 먼저';
  end if;
  for r in
    select * from (values
      ('public.outing_sync(bigint)',  'de0aaafc866110fb681c7b53f6106f11', true),
      ('public.outings_del_trg()',    'd3a19fea5ecdc0e5d56a3bf2e23fe16d', true),
      ('public.outings_upd_trg()',    'c40fe0b282c1e79ddaafc4d86f37ff50', false),
      ('public.outing_signups_trg()', '3e8fc3ffafe0318a7db9ff5fcf4b04a6', false)
    ) as t(sig, want, replaced)
  loop
    v_src := null;
    select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure(r.sig);
    if v_src is null then
      raise exception '185: % 가 없다 — 152 먼저', r.sig;
    end if;
    if r.replaced and position('_outing_day_sync(' in v_src) > 0 then
      raise notice '185: % 는 이미 185 판이다 — 같은 정의로 다시 만든다', r.sig;
      continue;
    end if;
    v_md5 := md5(regexp_replace(regexp_replace(v_src, v_cmt, '', 'g'), v_ws, '', 'g'));
    if v_md5 <> r.want then
      raise exception '185: % 의 운영 본문이 기대한 판(152 에서 주석을 뺀 것)과 다르다(주석·공백을 뺀 md5 = %, 기대 %). pg_get_functiondef 로 뽑아 달라진 줄을 확인하고, 로직이면 이 파일에 옮긴 뒤 위 기대값을 고쳐 다시 실행한다.', r.sig, v_md5, r.want;
    end if;
  end loop;
  if (select count(*) from pg_trigger t
       where not t.tgisinternal and t.tgenabled <> 'D'
         and ((t.tgname = 'outing_signups_sync' and t.tgrelid = to_regclass('public.outing_signups')
               and t.tgfoid = to_regprocedure('public.outing_signups_trg()') and t.tgtype = 13)
           or (t.tgname = 'outings_sync' and t.tgrelid = to_regclass('public.outings')
               and t.tgfoid = to_regprocedure('public.outings_upd_trg()') and t.tgtype = 17
               and array_length(t.tgattr::int2[], 1) = 4
               and (select count(*) from pg_attribute a
                     where a.attrelid = t.tgrelid and a.attname in ('outing_date', 'status', 'title_ko', 'title_ja')
                       and a.attnum = any (t.tgattr::int2[])) = 4)
           or (t.tgname = 'outings_del_sync' and t.tgrelid = to_regclass('public.outings')
               and t.tgfoid = to_regprocedure('public.outings_del_trg()') and t.tgtype = 11))) <> 3 then
    raise exception '185: 152 의 트리거 3개가 기대와 다르다 — outing_signups_sync(outing_signups · 행 단위 AFTER INSERT OR DELETE → outing_signups_trg) · outings_sync(outings · 행 단위 AFTER UPDATE OF outing_date, status, title_ko, title_ja → outings_upd_trg) · outings_del_sync(outings · 행 단위 BEFORE DELETE → outings_del_trg) 가 모두 있고 켜져 있어야 한다. 152 의 마지막 do 블록과 pg_trigger 를 확인한다';
  end if;
end $chk$;

-- ── ① 그날의 행사 불참 줄([outing#…]) 전체를 다시 계산 — 트리거 전용 내부 함수 ───────────────────────────
create or replace function public._outing_day_sync(p_date date, p_skip bigint default null)
returns void
language plpgsql
set search_path = public
as $fn$
begin
  if p_date is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('outing_day:' || p_date::text));

  delete from golf_absentees a
   where a.play_date = p_date
     and a.reason like '[outing#%'
     and not exists (
           select 1
             from outings o
             join outing_signups s on s.outing_id = o.id
            where a.reason like '[outing#' || o.id || ']%'
              and o.outing_date = p_date
              and o.status <> 'cancelled'
              and o.id is distinct from p_skip
              and s.member_id = a.member_id);

  update golf_absentees a
     set reason = '[outing#' || o.id || '] ' || coalesce(nullif(o.title_ko, ''), nullif(o.title_ja, ''), '行事')
    from outings o
   where a.play_date = p_date
     and a.reason like '[outing#' || o.id || ']%'
     and a.reason <> '[outing#' || o.id || '] ' || coalesce(nullif(o.title_ko, ''), nullif(o.title_ja, ''), '行事');

  insert into golf_absentees(play_date, member_id, event_seq, reason, created_by)
  select distinct on (s.member_id)
         p_date, s.member_id, s.event_seq,
         '[outing#' || o.id || '] ' || coalesce(nullif(o.title_ko, ''), nullif(o.title_ja, ''), '行事'),
         s.signed_by
    from outings o
    join outing_signups s on s.outing_id = o.id
   where o.outing_date = p_date
     and o.status <> 'cancelled'
     and o.id is distinct from p_skip
     and exists (select 1 from bookings b where b.event_seq = s.event_seq)
     and exists (select 1 from guest_members gm where gm.id = s.member_id)
   order by s.member_id, o.id
  on conflict (play_date, member_id) do nothing;
end $fn$;

-- ── ② outing_sync — 그 행사의 날짜 + 그 행사 줄이 남은 날짜(옛 날짜)를 날짜 단위로 다시 계산, signed 집계는 종전 그대로 ──
create or replace function public.outing_sync(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_date date;
  v_d    date;
begin
  select o.outing_date into v_date from outings o where o.id = p_id;
  for v_d in
    select a.play_date from golf_absentees a where a.reason like '[outing#' || p_id || ']%'
    union
    select v_date where v_date is not null
    order by 1
  loop
    perform _outing_day_sync(v_d);
  end loop;
  update outings set signed = (select count(*) from outing_signups where outing_id = p_id), updated_at = now() where id = p_id;
end $fn$;

-- ── ③ outings_del_trg(삭제 직전) — 지우는 행사를 뺀 채로 그 날짜를 다시 계산(다른 행사 신청자는 불참으로 남는다) ──
create or replace function public.outings_del_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_d date;
begin
  for v_d in
    select a.play_date from golf_absentees a where a.reason like '[outing#' || old.id || ']%'
    union
    select old.outing_date
    order by 1
  loop
    perform _outing_day_sync(v_d, old.id);
  end loop;
  return old;
end $fn$;

-- ── ④ 권한 — 내부 함수는 아무도 직접 못 부른다 · 나머지는 종전 그대로 ──
revoke all on function public._outing_day_sync(date, bigint) from public, anon, authenticated;
revoke all on function public.outing_sync(bigint) from public, anon;
grant execute on function public.outing_sync(bigint) to authenticated;
revoke all on function public.outings_del_trg() from public, anon, authenticated;

-- ── ⑤ 오늘(JST) 이후 날짜를 한 번 다시 맞춘다 — 이미 빠져 있던 신청자를 되살린다(지난 날짜는 건드리지 않는다) ──
--   바뀐 줄 수를 지움·넣음·사유 바뀜으로 나눠 notice 로 낸다(두 번째 실행은 셋 다 0).
do $bf$
declare
  v_today  date := (now() at time zone 'Asia/Tokyo')::date;
  v_d      date;
  v_days   int := 0;
  v_before jsonb;
  v_after  jsonb;
  v_del    int;
  v_ins    int;
  v_upd    int;
begin
  select coalesce(jsonb_object_agg(a.play_date::text || '|' || a.member_id::text, a.reason), '{}'::jsonb) into v_before
    from golf_absentees a where a.reason like '[outing#%' and a.play_date >= v_today;
  for v_d in
    select o.outing_date from outings o where o.outing_date >= v_today
    union
    select a.play_date from golf_absentees a where a.reason like '[outing#%' and a.play_date >= v_today
    order by 1
  loop
    perform public._outing_day_sync(v_d);
    v_days := v_days + 1;
  end loop;
  select coalesce(jsonb_object_agg(a.play_date::text || '|' || a.member_id::text, a.reason), '{}'::jsonb) into v_after
    from golf_absentees a where a.reason like '[outing#%' and a.play_date >= v_today;
  select count(*) filter (where y.key is null),
         count(*) filter (where x.key is null),
         count(*) filter (where x.key is not null and y.key is not null and x.value is distinct from y.value)
    into v_del, v_ins, v_upd
    from jsonb_each_text(v_before) x
    full join jsonb_each_text(v_after) y on y.key = x.key;
  raise notice '185 ⑤: 오늘(%) 이후 % 일을 다시 맞췄다 — 행사 불참 줄 지움 % · 넣음 % · 사유 바뀜 % (전 % 줄 → 뒤 % 줄)',
    v_today, v_days, v_del, v_ins, v_upd,
    (select count(*) from jsonb_object_keys(v_before)), (select count(*) from jsonb_object_keys(v_after));
end $bf$;
