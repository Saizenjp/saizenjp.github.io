-- ============================================================================
--  176_guest_today_course_fix.sql — 손님 청구서(QR) 「오늘 라운딩」이 골프장 수기 지정(play_course)을 따르게
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  왜
--    코스 배정표·전기카트 표에서 「그날 그 팀의 골프장」을 사람이 지정하면(play_course, SQL 99) 규칙
--    (SZCore.golfRows)보다 우선한다. 2026-11-20 부터 송영표·석식 오더의 중식 식수·現地手配書도 이 지정을
--    따른다(golfRows 의 3번째 인자 fix). 손님 화면(bill.html)만 규칙으로 계산해, 조가 아직 없는 날의 안내가
--    지정과 어긋났다:
--      · 간지호텔 팀을 평일에 야마나미로 옮긴 날 → 「구주고원CC 라운딩입니다. 시간은 프런트에서 …」(틀림)
--      · 야마나미 숙박 팀을 구주고원으로 지정한 날 → 「조편성 준비 중입니다」(틀림)
--    손님은 로그인하지 않는다(anon). play_course 의 읽기 정책은 authenticated 뿐이라 화면이 직접 읽을 수 없다
--    → 토큰으로 자기 팀 것만 주는 guest_today 가 같이 내려 준다.
--
--  무엇을
--    guest_today(p_token) 의 days[](오늘·내일) 각 칸에 항목 하나를 더한다:
--      'course_fix' = 그날 그 팀의 play_course.course('やまなみCC' | '九重高原CC') · 지정이 없으면 null
--    값은 표에 적힌 그대로 준다 — 어느 값이 유효한지는 화면의 SZCore.golfRows 가 판정한다(125 머리말의
--    「규칙은 golfRows 단일 진실원, SQL 에 복제하지 않는다」 그대로. 모르는 값은 golfRows 가 무시한다).
--    그 밖은 125 그대로다 — 머리 항목 10개·날짜 칸의 date/skip/holes/rounds·만료 규칙(체크아웃·귀국+7일)·
--    language sql·security definer·search_path=public·volatile.
--
--  다른 팀 정보
--    지정은 「토큰의 팀(event_seq) + 그 날짜」 한 행만 읽는다. 합동 조로 같은 조에 든 다른 팀의 지정,
--    오늘·내일 밖 날짜의 지정, 누가 언제 지정했는지(changed_by·changed_at)는 나가지 않는다.
--    만료·없는 토큰은 종전처럼 {ok:false[,expired:true]} 만 준다.
--
--  권한
--    손님(비로그인)이 부르는 RPC — anon 실행 권한 유지, public 은 회수(118·119).
--    새 함수를 만들지 않으므로 「anon 이 실행할 수 있는 security definer 함수」 수는 15 그대로(00_VERIFY 139 행).
--
--  화면
--    bill.html 이 days[].course_fix 를 SZCore.golfRows(team, isPus, fix) 의 fix 로 넘긴다.
--    순서 무관 — 이 SQL 을 먼저 적용해도 옛 화면은 새 항목을 무시하고, 화면을 먼저 배포해도 course_fix 가
--    없으면 fix 가 비어 종전(규칙)과 같다. 설명서(course)의 「손님 QR 화면도 따릅니다」 문장은 이 SQL 이
--    적용된 뒤에 맞는 말이 된다.
--
--  운영 본문 대조(2026-11-20, 읽기 전용)
--    운영 guest_today 본문 = md5 2067c958672a97acaf9c566d1af42340 / 3,771자
--    = 125_guest_today.sql 의 본문(4,077자)에서 줄 끝 주석 7개(앞 공백 포함 306자)만 뺀 글자와 일치.
--    이 파일은 그 본문에 'course_fix' 한 항목(3줄)만 더한 전문 재정의다(텍스트 치환 방식 아님).
--
--  되돌리는 법
--    125_guest_today.sql 을 다시 실행한다(create or replace — course_fix 항목이 빠진다). 화면은 course_fix 가
--    없으면 규칙대로 그리므로 화면을 되돌릴 필요는 없다. 표·정책·데이터는 건드리지 않는다.
--
--  멱등(create or replace + 권한 줄). 앞서 99_play_course.sql 이 적용돼 있어야 한다(아래에서 확인하고 멈춘다).
--  적용 뒤 확인: 00_VERIFY 176 행.
-- ============================================================================

do $$
begin
  if to_regclass('public.play_course') is null then
    raise exception '176: play_course 표가 없습니다 — 99_play_course.sql 을 먼저 실행하세요.';
  end if;
end $$;

create or replace function public.guest_today(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with t as (          -- 토큰 → 팀
    select ot.event_seq,
           b.arr_date, b.dep_date, b.rep_name, b.origin,
           coalesce(g.check_status,'')                  as cs,
           g.accom,
           coalesce(nullif(g.team_tag,''), g.group_code) as tag
    from order_tokens ot
    join bookings b on b.event_seq = ot.event_seq
    left join guests g on g.event_seq = ot.event_seq
    where ot.token = p_token
  ),
  v as (               -- 유효 토큰만(guest_bill 과 같은 만료 규칙)
    select * from t
    where cs <> '체크아웃'
      and (arr_date is null or current_date <= (arr_date + 7))
  ),
  d as (               -- 오늘·내일 = JST 기준
    select (now() at time zone 'Asia/Tokyo')::date as d0
  ),
  fl as (              -- 출발 항공편(첫 승객) → 화면이 SZCore.isPus 로 PUS/ICN 판정
    select p.origin as p_origin, p.dep_flight
    from passengers p
    where p.event_seq in (select event_seq from v)
    order by p.seq_in_team nulls last
    limit 1
  ),
  grp as (             -- 그 팀이 든 조(오늘·내일). 주 팀이거나 팀원이 들어 있으면 그 조.
    select gg.id, gg.play_date, gg.course_code, gg.tee_time, gg.slot_no, gg.cart_no
    from golf_groups gg
    where gg.play_date between (select d0 from d) and ((select d0 from d) + 1)
      and ( gg.event_seq in (select event_seq from v)
            or exists (select 1 from golf_group_members m
                       where m.group_id = gg.id
                         and m.event_seq in (select event_seq from v)) )
  ),
  mem as (             -- 같은 조 사람(이름·자기 팀인지·불참인지)
    select m.group_id,
           jsonb_agg(jsonb_build_object(
             'name', coalesce(nullif(gm.name_kr,''), gm.name_en, ''),
             'own',  (m.event_seq in (select event_seq from v)),
             'absent', exists (select 1 from golf_absentees ab
                               where ab.member_id = m.member_id
                                 and ab.play_date = g2.play_date)
           ) order by m.seq nulls last) as members
    from golf_group_members m
    join grp g2 on g2.id = m.group_id
    left join guest_members gm on gm.id = m.member_id
    group by m.group_id
  ),
  rounds as (
    select g.play_date,
           jsonb_agg(jsonb_build_object(
             'course_code', g.course_code,
             'course_ko',   gc.name_ko,
             'course_ja',   gc.name_ja,
             'tee_time',    g.tee_time,
             'slot_no',     g.slot_no,
             'cart_no',     g.cart_no,
             'members',     coalesce(mem.members, '[]'::jsonb)
           ) order by g.tee_time nulls last, g.slot_no) as rows
    from grp g
    left join golf_courses gc on gc.code = g.course_code
    left join mem on mem.group_id = g.id
    group by g.play_date
  ),
  days as (            -- 오늘·내일 두 칸을 항상 만든다(조가 없어도 '미확정'을 보여야 함)
    select jsonb_agg(jsonb_build_object(
             'date',  dd.dt,
             'skip',  exists (select 1 from golf_skips sk
                              where sk.play_date = dd.dt
                                and sk.event_seq in (select event_seq from v)),
             'holes', (select gh.holes from golf_holes gh
                       where gh.play_date = dd.dt
                         and gh.event_seq in (select event_seq from v) limit 1),
             'course_fix', (select pc.course from play_course pc   -- 176: 그날 그 팀의 골프장 수기 지정(없으면 null)
                            where pc.play_date = dd.dt
                              and pc.event_seq in (select event_seq from v) limit 1),
             'rounds', coalesce((select r.rows from rounds r where r.play_date = dd.dt), '[]'::jsonb)
           ) order by dd.dt) as list
    from (select (select d0 from d) as dt union all select (select d0 from d) + 1) dd
  )
  select case
    when not exists(select 1 from t) then jsonb_build_object('ok', false)
    when not exists(select 1 from v) then jsonb_build_object('ok', false, 'expired', true)
    else jsonb_build_object(
      'ok', true,
      'rep_name',  (select rep_name from v),
      'tag',       (select tag from v),
      'accom',     (select accom from v),
      'dep_date',  (select dep_date from v),
      'arr_date',  (select arr_date from v),
      'origin',    coalesce((select p_origin from fl), (select origin from v)),
      'dep_flight',(select dep_flight from fl),
      'today',     (select d0 from d),
      'days',      (select list from days)
    ) end;
$$;

--  ⚠ 함수 EXECUTE 는 기본이 PUBLIC 이다(118·119) — public 회수가 먼저다. 손님(비로그인) RPC 라 anon 은 유지한다.
revoke all on function public.guest_today(text) from public;
grant execute on function public.guest_today(text) to anon, authenticated;

-- 확인(읽기 전용):
--   select guest_today('<체류 중 팀 토큰>')->'days';        -- 각 칸에 "course_fix" (지정 없으면 null)
--   select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef
--     and has_function_privilege('anon', p.oid, 'execute');   -- 15 그대로
