-- ============================================================================
--  184_signage_office_live.sql — 직원용 운영 현황의 석식·골프 숫자를 늘 실시간으로 + 데이터 검수 코스 대조도 실시간과
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  순서: 137(signage_office)·146/148(손님용 공개 제어 래퍼)·148(_signage_dinner_live)·171(_signage_course_live) 이후.
--  멱등 — 다시 실행하면 ⓪ 이 「이미 184 판」 알림을 남기고 같은 정의로 다시 만들며, data_audit 은 건너뛴다.
--
--  왜
--   ① 사무실·프론트 뒤 TV(signage.html?screen=office)의 석식·골프 칸은 signage_office 가 손님용 공개 래퍼
--      (signage_dinner · signage_course)를 불러 채운다. 두 래퍼는 146·148 부터 손님 화면 공개 제어(signage_release)를 따른다:
--        숨김(hidden) = 0팀 0명 · 공개(snapshot) = 공개한 그 순간의 표 · 행 없음 = 실시간.
--      그래서 석식을 「숨김」으로 둔 날 직원 TV 석식 칸이 0명이 되고, 코스 배정표를 공개한 뒤 조·인원을 고치면
--      직원 TV 골프 칸이 공개 시점 숫자에 멈췄다. 직원 화면은 지금 기록을 봐야 한다.
--      → 실시간 본체 _signage_dinner_live(148)·_signage_course_live(171)를 직접 부른다.
--        두 본체는 래퍼의 실시간 경로가 그대로 돌려주던 값이라 직원 화면이 읽는 열쇠가 같다
--        (석식 venue·start_time·end_time·total·units / 코스 n·total·groups[].tee·groups[].slot — 148·171 본문에서 확인.
--         _signage_course_live 운영 본문 md5 a7a1b62e…(2976자) = 171 본문 글자 그대로).
--   ② data_audit ⑰ course_check 는 「모니터 인원」을 공개 래퍼에서 읽어 재계산과 대조한다 — 코스 배정표를 숨긴 날은 늘,
--      공개(스냅샷)한 뒤 조를 고치면 그때마다 「불일치」로 떴다. 석식 ⑮ dinner_check 는 148 이 이미 실시간 본체와 대조하게 바꿨다
--      → 코스도 같은 방식으로.
--
--  바꾸는 것
--   ① signage_office(date) 전문 재정의 — 137 본문(= 2026-11-21 운영 본문. 주석·공백을 뺀 md5 4111d671… 일치)에서 두 줄만:
--        v_dn := 석식 공개 래퍼 → _signage_dinner_live(v_d) · v_cs := 코스 공개 래퍼 → _signage_course_live(v_d).
--      돌려주는 열쇠·모양·「오늘만」 검사 그대로 → signage.html 수정 없음.
--      권한 그대로: 비로그인(anon) 실행 유지(직원 TV 는 로그인 없이 연다). 두 본체는 로그인 전용 그대로이고
--      security definer 함수 안에서 부르므로 소유자 권한으로 돈다(148 래퍼와 같은 방식) → anon 실행 security definer 수 15 그대로.
--      비로그인 화면에 새로 나가는 정보 종류는 없다 — 손님 화면을 숨긴 날에도 직원 TV 의 석식·골프 「숫자」(인원·팀·조 수·티오프 시각)가
--      지금 값으로 보일 뿐이다(이름·방번호·금액 없음 그대로).
--   ② data_audit() 텍스트 치환 「signage_course(」 → 「_signage_course_live(」(⑰ course_check 의 모니터 값 읽기).
--      운영 본문에 정확히 1번이어야 한다(⓪·② 의 c_want). 다른 횟수면 예외로 멈추고 아무것도 바꾸지 않는다.
--      ⚠ data_audit 운영 본문(32,965자)은 저장소에 없다 — 1번은 136 머리말(⑰ = 모니터 인원 합계를 재계산과 대조)에서 짐작한 값이다.
--        합치는 쪽이 적용 전에 아래 「적용 전 확인」으로 운영 본문에서 직접 센다.
--  바꾸지 않는 것: 손님용 래퍼 signage_dinner·signage_course(공개 제어 그대로) · 두 실시간 본체 · data_audit 의 다른 항목 · 표·정책 · 화면.
--  이 파일이 137 의 signage_office 정의를 대체한다(137 을 통째로 다시 실행하면 공개 래퍼를 읽는 옛 판으로 돌아간다).
--
--  적용 전 확인(읽기 전용)
--   select (length(prosrc) - length(replace(prosrc, 'signage_course(', ''))) / length('signage_course(') as n_old,
--          strpos(prosrc, '_signage_course_live(') > 0 as has_live,
--          strpos(prosrc, 'course_check') > 0 as has_check
--     from pg_proc where oid = 'public.data_audit()'::regprocedure;      -- 1 · f · t
--   n_old 가 1 이 아니면 pg_get_functiondef 로 뽑아 「signage_course(」 가 나오는 곳을 본다 —
--   전부 ⑰ course_check 의 모니터 값 읽기면 ⓪·② 의 c_want 두 곳을 그 수로 고쳐 실행하고, 다른 항목이 부르는 것이면 멈추고 알린다.
--
--  되돌리는 법
--   ① 137_signage_office.sql 의 create or replace function public.signage_office … 블록과 그 아래 revoke/grant 두 줄을 다시 실행.
--   ② 적용 직전에 select pg_get_functiondef('public.data_audit()'::regprocedure); 결과를 보관해 두었다가 그대로 실행한 뒤
--        revoke all on function public.data_audit() from public, anon;
--        grant execute on function public.data_audit() to authenticated;
--
--  적용 뒤 확인
--   · 00_VERIFY 184 두 줄 · 139 줄(anon 실행 security definer = 15) 그대로
--   · select signage_office(null)->'dinner', signage_office(null)->'course';   -- 석식·코스를 숨긴/공개한 날에도 지금 인원
--   · 데이터 검수 [재검수] — 「코스 모니터 인원 = 조 재계산」 일치
-- ============================================================================

-- ── ⓪ 적용 전 검사 — 멈출 수 있는 조건을 모두 여기서 먼저 본다(여기서 멈추면 아무것도 바뀌지 않는다) ──
do $chk$
declare
  c_office_md5 constant text := '4111d671ed2a9c0ec3fc3d5feb1e160e';  -- 137 본문 = 2026-11-21 운영 본문(주석·공백을 뺀 md5)
  c_want       constant int  := 1;                                    -- data_audit 안 「signage_course(」 수(⑰ course_check) — ② 와 같은 값
  v_cmt   text := '-' || '-[^' || chr(10) || ']*';
  v_ws    text := '[ ' || chr(9) || chr(13) || chr(10) || ']+';
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_src   text;
  v_md5   text;
  v_old   int;
  v_new   int;
  j       jsonb;
begin
  -- (가) 실시간 본체 두 개가 있고, 직원 화면이 읽는 열쇠를 준다
  if to_regprocedure('public._signage_dinner_live(date)') is null then
    raise exception '184: _signage_dinner_live(date) 가 없다 — 148 부터 적용';
  end if;
  if to_regprocedure('public._signage_course_live(date)') is null then
    raise exception '184: _signage_course_live(date) 가 없다 — 146·147·171 부터 적용';
  end if;
  j := public._signage_dinner_live(v_today);
  if not coalesce(j ?& array['venue','start_time','end_time','total','units'], false) then
    raise exception '184: _signage_dinner_live 결과에 venue·start_time·end_time·total·units 중 없는 열쇠가 있다(있는 열쇠: %)',
      (select string_agg(k, ',' order by k) from jsonb_object_keys(coalesce(j, '{}'::jsonb)) k);
  end if;
  j := public._signage_course_live(v_today);
  if not coalesce(j ?& array['n','total','groups'] and jsonb_typeof(j->'groups') = 'array', false) then
    raise exception '184: _signage_course_live 결과에 n·total·groups(배열) 중 없는 것이 있다(있는 열쇠: %)',
      (select string_agg(k, ',' order by k) from jsonb_object_keys(coalesce(j, '{}'::jsonb)) k);
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure('public._signage_course_live(date)');
  if strpos(v_src, '''slot'', slot_no') = 0 or strpos(v_src, '''tee'', tee_time') = 0 then
    raise exception '184: _signage_course_live 의 조 줄에 slot·tee 열쇠가 없다 — 171 본문과 대조';
  end if;

  -- (나) signage_office 운영 본문이 137 본문과 같은 로직인가(이미 184 판이면 건너뜀)
  select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure('public.signage_office(date)');
  if v_src is null then
    raise exception '184: signage_office(date) 가 없다 — 137 부터 적용';
  elsif strpos(v_src, '_signage_dinner_live(v_d)') > 0 and strpos(v_src, '_signage_course_live(v_d)') > 0 then
    raise notice '184: signage_office 는 이미 184 판 — 같은 정의로 다시 만든다';
  else
    v_md5 := md5(regexp_replace(regexp_replace(v_src, v_cmt, '', 'g'), v_ws, '', 'g'));
    if v_md5 <> c_office_md5 then
      raise exception '184: signage_office 운영 본문이 137 본문과 다르다(주석·공백을 뺀 md5 = %, 기대 %). pg_get_functiondef 로 뽑아 달라진 줄을 이 파일 ① 에 옮긴 뒤 기대값을 고쳐 다시 실행한다.', v_md5, c_office_md5;
    end if;
  end if;

  -- (다) data_audit 안 대상 글자 수
  if to_regprocedure('public.data_audit()') is null then
    raise exception '184: data_audit() 가 없다 — 82 부터 적용';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'public.data_audit()'::regprocedure;
  v_old := (length(v_src) - length(replace(v_src, 'signage_course(', ''))) / length('signage_course(');
  v_new := (length(v_src) - length(replace(v_src, '_signage_course_live(', ''))) / length('_signage_course_live(');
  if v_old = 0 and v_new > 0 then
    raise notice '184: data_audit 코스 대조는 이미 실시간 — ② 는 건너뛴다';
  elsif strpos(v_src, 'course_check') = 0 then
    raise exception '184: data_audit 에 course_check 가 없다 — 136 의 ⑰ 이 적용됐는지 확인';
  elsif v_old <> c_want then
    raise exception '184: data_audit 안 「signage_course(」 가 %번 나온다(%번이어야 한다) — 머리말 「적용 전 확인」대로 운영 본문을 본다', v_old, c_want;
  end if;
end $chk$;

-- ── ① 직원용 운영 현황 — 석식·코스 숫자를 실시간 본체에서(137 본문 그대로 + 두 줄) ─────────────
create or replace function public.signage_office(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_d date := coalesce(p_date, v_today);
  v_ci jsonb; v_co jsonb; v_stay jsonb; v_un jsonb; v_kt jsonb; v_tr jsonb; v_dn jsonb; v_cs jsonb;
begin
  if v_d <> v_today then
    return jsonb_build_object('date', v_d, 'ok', false, 'reason', 'today_only');
  end if;

  -- 체크인(오늘 도착) — 도착 확인 = guests.check_status 체크인/체크아웃
  with t as (
    select b.event_seq, coalesce(b.pax,g.pax,0) pax, g.check_status,
           coalesce((select regexp_replace(gm.person_tag,'-([0-9]+)([A-Za-z]*)$','-\2') from guest_members gm where gm.event_seq=b.event_seq and gm.person_tag is not null order by gm.is_rep desc, gm.seq_in_team limit 1), g.team_tag, g.group_code, '') tag
    from bookings b join guests g on g.event_seq=b.event_seq
    where b.dep_date=v_d and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>'')
  select jsonb_build_object('teams', count(*), 'pax', coalesce(sum(pax),0),
           'arrived', count(*) filter (where check_status in ('체크인','체크아웃')),
           'pending_tags', coalesce((select jsonb_agg(tag order by tag) from (select tag from t where check_status is null or check_status='체크인전' order by tag limit 40) x), '[]'::jsonb))
    into v_ci from t;

  -- 체크아웃(오늘 귀국)
  with t as (
    select b.event_seq, coalesce(b.pax,g.pax,0) pax, g.check_status,
           coalesce((select regexp_replace(gm.person_tag,'-([0-9]+)([A-Za-z]*)$','-\2') from guest_members gm where gm.event_seq=b.event_seq and gm.person_tag is not null order by gm.is_rep desc, gm.seq_in_team limit 1), g.team_tag, g.group_code, '') tag
    from bookings b join guests g on g.event_seq=b.event_seq
    where b.arr_date=v_d and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>'')
  select jsonb_build_object('teams', count(*), 'pax', coalesce(sum(pax),0),
           'done', count(*) filter (where check_status='체크아웃'),
           'pending_tags', coalesce((select jsonb_agg(tag order by tag) from (select tag from t where check_status is distinct from '체크아웃' order by tag limit 40) x), '[]'::jsonb))
    into v_co from t;

  -- 재실(오늘 밤 묵는 팀)
  select jsonb_build_object('teams', count(*), 'pax', coalesce(sum(coalesce(b.pax,g.pax,0)),0))
    into v_stay
    from bookings b join guests g on g.event_seq=b.event_seq
    where b.dep_date<=v_d and b.arr_date>v_d and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>'';

  -- 오늘 도착인데 오늘 밤 방이 없는 팀(야마나미·쿠주 등 방배정 대상 숙소만: rooms 가 관리하는 시설)
  with t as (
    select b.event_seq,
           coalesce((select regexp_replace(gm.person_tag,'-([0-9]+)([A-Za-z]*)$','-\2') from guest_members gm where gm.event_seq=b.event_seq and gm.person_tag is not null order by gm.is_rep desc, gm.seq_in_team limit 1), g.team_tag, g.group_code, '') tag
    from bookings b join guests g on g.event_seq=b.event_seq
    where b.dep_date=v_d and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>''
      and not exists (select 1 from rooms r where r.event_seq=b.event_seq and r.member_id is not null and r.check_in<=v_d and r.check_out>v_d))
  select jsonb_build_object('n', count(*), 'tags', coalesce(jsonb_agg(tag order by tag), '[]'::jsonb)) into v_un from t;

  -- 주방 티켓(오늘 JST)
  select jsonb_build_object('new', count(*) filter (where status='new'), 'accepted', count(*) filter (where status='accepted'), 'done', count(*) filter (where status='done'))
    into v_kt from kitchen_tickets where (created_at at time zone 'Asia/Tokyo')::date = v_d;

  -- 송영 승차 확인(팀 단위) — in=오늘 도착 팀, out=오늘 출발 팀
  select jsonb_build_object(
      'in_teams',  (select count(*) from bookings b join guests g using(event_seq) where b.dep_date=v_d and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>''),
      'in_done',   (select count(distinct ref) from transfer_checks where work_date=v_d and leg='in' and kind='team'),
      'out_teams', (select count(*) from bookings b join guests g using(event_seq) where b.arr_date=v_d and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>''),
      'out_done',  (select count(distinct ref) from transfer_checks where work_date=v_d and leg='out' and kind='team'))
    into v_tr;

  -- 석식·코스 = 실시간 본체(184). 손님 화면 공개 제어(숨김·공개 시점 표)와 상관없이 지금 기록 — 직원 화면은 숫자만 내보낸다
  v_dn := _signage_dinner_live(v_d);
  v_cs := _signage_course_live(v_d);

  return jsonb_build_object('ok', true, 'date', v_d, 'today', v_today,
    'checkin', v_ci, 'checkout', v_co, 'staying', v_stay, 'unassigned', v_un, 'kitchen', v_kt, 'transfer', v_tr,
    'dinner', jsonb_build_object('venue', v_dn->'venue', 'start_time', v_dn->'start_time', 'end_time', v_dn->'end_time', 'total', v_dn->'total', 'units', v_dn->'units'),
    'course', jsonb_build_object('n', v_cs->'n', 'total', v_cs->'total',
                'tees', (select coalesce(jsonb_agg(distinct coalesce(x->>'tee', '')), '[]'::jsonb) from jsonb_array_elements(coalesce(v_cs->'groups','[]'::jsonb)) x),
                'slots', (select coalesce(jsonb_agg(distinct (x->>'slot')::int), '[]'::jsonb) from jsonb_array_elements(coalesce(v_cs->'groups','[]'::jsonb)) x)));
end $$;

-- 권한 그대로(137): 직원 TV 는 로그인 없이 연다 — anon 실행 유지
revoke execute on function public.signage_office(date) from public;
grant  execute on function public.signage_office(date) to anon, authenticated;

-- ── ② data_audit ⑰ course_check — 모니터 값을 공개 래퍼가 아니라 실시간 본체에서(운영 본문 텍스트 치환) ──
do $do$
declare
  c_old  constant text := 'signage_course(';
  c_new  constant text := '_signage_course_live(';
  c_want constant int  := 1;     -- ⓪ 과 같은 값
  d      text;
  n_old  int;
  n_new  int;
begin
  d := pg_get_functiondef('public.data_audit()'::regprocedure);
  n_old := (length(d) - length(replace(d, c_old, ''))) / length(c_old);
  n_new := (length(d) - length(replace(d, c_new, ''))) / length(c_new);
  if n_old = 0 and n_new > 0 then
    raise notice '184: data_audit 코스 대조는 이미 실시간 — 건너뜀';
    return;
  end if;
  if n_old <> c_want or strpos(d, 'course_check') = 0 then
    raise exception '184: data_audit 안 「signage_course(」 가 %번(%번이어야 한다) 또는 course_check 없음 — 적용하지 않음', n_old, c_want;
  end if;
  d := replace(d, c_old, c_new);
  if strpos(d, c_old) > 0
     or (length(d) - length(replace(d, c_new, ''))) / length(c_new) <> n_new + c_want then
    raise exception '184: data_audit 치환 결과가 예상과 다르다 — 적용하지 않음';
  end if;
  execute d;
end $do$;
revoke all on function public.data_audit() from public, anon;
grant execute on function public.data_audit() to authenticated;
