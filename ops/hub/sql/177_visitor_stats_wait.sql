-- ============================================================================
--  177_visitor_stats_wait.sql — 방문 통계(협회·현청 보고)에서 대기 예약 제외
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  순서: 78(visitor_stats 확장)·174(② 「보기」 권한 줄) 이후.
--  멱등 — 다시 실행하면 「already applied」 알림만 남기고 아무것도 바꾸지 않는다.
--
--  왜
--   엠클릭 구분 「대기」는 메리트투어가 만실이어도 받아 두는 예약이다(확정 전이라 현장에 오지 않을 수 있다).
--   bookings 를 세는 다른 서버 함수(경영 통계 130 · 정산 보고 156·158 · 안내 모니터 134~137·171 ·
--   시즈 자동 배정 141·142 · 석식 145·148 등)는 이미 `coalesce(b.status,'') <> '대기'` 로 대기를 뺀다.
--   방문 통계 visitor_stats(55 → 78 → 174)만 빼지 않아
--    (가) 협회·현청 보고용 방문 인원(회원/비회원·성별·나이·출발지·숙소·연박·등급·회원별 방문 횟수)에
--         대기 팀의 승객이 들어가고,
--    (나) 재방문·신규/기존 판정의 「조회기간 이전 기록」(prior)에도 대기 예약이 들어가
--         한 번도 오지 않은(대기만 있던) 사람이 다음 조회에서 「기존」으로 잡혔다.
--   (31차 검수 C5 → 결정 대기 docs/audit-2026-11.md §2-2 2번, 권장안 = 제외.)
--
--  무엇을
--   visitor_stats(date,date,text) 운영 본문의 두 조회에 조건 한 줄씩:
--    ① vis CTE(조회기간 방문) : `where b.dep_date between p_from and p_to` 다음 줄에 `and coalesce(b.status,'') <> '대기'`
--    ② prior CTE(이전 기록)    : `where b.dep_date < p_from and coalesce(pa.name_kr,'') <> ''` 다음 줄에 같은 조건
--   결과 jsonb 의 항목은 전부 vis 에서 나오므로 ① 로 total·member·nonmember·avg_nights·retention·gender·
--   by_origin·by_accom·by_grade·by_nights·by_age·series·members 가 모두 대기를 뺀 값이 된다.
--   ② 는 retention 의 신규/기존 가름만 바꾼다.
--   상태가 비었거나(null·'') 견적·확정·정산인 예약은 종전대로 센다(다른 통계 함수와 같은 선 — null 은 coalesce 로 센다).
--
--  바꾸지 않는 것
--   권한 확인(174 의 read_areas 줄 · 'report' 조건 · active) · 결과 jsonb 의 열쇠·모양 · 방문 기준일(dep_date) ·
--   security definer·search_path·stable · 실행 권한(로그인 전용 — anon 이 실행할 수 있는 security definer 함수 수 15 그대로).
--
--  방식 = 운영 본문 글자 치환(174 ② 와 같은 꼴). pg_get_functiondef 를 읽어 두 자리만 바꾼다.
--   멈추는 경우(아무것도 바꾸지 않는다): 함수·bookings.status 가 없다 · 대기 조건이 한 곳에만 있다 ·
--   본문에 이미 「대기」 글자가 있다(다른 꼴의 조건) · 치환 대상 글자가 각각 정확히 1번이 아니다 · 바꾼 뒤 확인 실패.
--   MCP apply_migration·SQL Editor 처럼 파일 전체가 한 트랜잭션이면 예외 때 아무것도 남지 않는다.
--   운영 본문 대조(2026-11-21, 읽기 전용): 78 의 visitor_stats 에서 주석뿐인 줄을 뺀 것 + 174 ② = 6330자,
--     md5(prosrc) 88034b318af1447d41da69f86df9f7ff · 주석·공백을 뺀 md5 b7a90647214f0ed92ff5ef9518f586e0 — 두 대상 글자 각 1번.
--   적용 뒤 기대값: 6414자 · md5(prosrc) 7341cc05cee3dc9ba477a157741ec0b0 · 주석·공백을 뺀 md5 7d37406219de8eaaf9cc7e005ccb61a7.
--   ⚠ 78_visitor_stats_region.sql(·55)을 다시 실행하지 않는다 — 대기 제외와 174 ② 가 함께 사라진다(77 이후 대체 = 174·177).
--
--  되돌리는 법
--   맨 아래 주석의 「되돌리기」 do 블록을 주석을 풀어 한 번 실행한다(넣은 두 줄만 지운다 = 같은 치환을 거꾸로).
--  확인: 00_VERIFY 177 행(1줄).
-- ============================================================================

do $mig$
declare
  nl     constant text := chr(10);
  c_old1 constant text := '    from passengers pa' || nl
                       || '    join bookings b on b.event_seq = pa.event_seq' || nl
                       || '    where b.dep_date between p_from and p_to' || nl;
  c_new1 constant text := c_old1 || $q$      and coalesce(b.status,'') <> '대기'$q$ || nl;
  c_old2 constant text := '        from passengers pa join bookings b on b.event_seq = pa.event_seq' || nl
                       || $q$        where b.dep_date < p_from and coalesce(pa.name_kr,'') <> ''$q$ || nl;
  c_new2 constant text := c_old2 || $q$          and coalesce(b.status,'') <> '대기'$q$ || nl;
  c_mark constant text := $q$coalesce(b.status,'') <> '대기'$q$;
  v_fn   regprocedure := to_regprocedure('public.visitor_stats(date,date,text)');
  d  text;
  h1 boolean; h2 boolean;
  n1 int; n2 int; nw int;
begin
  if v_fn is null then
    raise exception '177: public.visitor_stats(date,date,text) 없음 — 78 먼저';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'bookings' and column_name = 'status') then
    raise exception '177: bookings.status 없음';
  end if;

  d  := pg_get_functiondef(v_fn::oid);
  h1 := position(c_new1 in d) > 0;
  h2 := position(c_new2 in d) > 0;
  if h1 and h2 then
    raise notice '177: visitor_stats already applied';
    return;
  end if;
  if h1 or h2 then
    raise exception '177: visitor_stats 에 대기 제외가 한 곳에만 있다(vis % · prior %) — 운영 본문 확인', h1, h2;
  end if;

  nw := (length(d) - length(replace(d, '대기', ''))) / length('대기');
  if nw <> 0 then
    raise exception '177: visitor_stats 본문에 이미 「대기」가 %번 있다(다른 꼴의 조건) — 운영 본문 확인', nw;
  end if;
  n1 := (length(d) - length(replace(d, c_old1, ''))) / length(c_old1);
  n2 := (length(d) - length(replace(d, c_old2, ''))) / length(c_old2);
  if n1 <> 1 or n2 <> 1 then
    raise exception '177: visitor_stats 의 치환 대상 글자가 예상과 다르다(vis %번 · prior %번 — 각 1번이어야 한다) — 운영 본문 확인', n1, n2;
  end if;

  execute replace(replace(d, c_old1, c_new1), c_old2, c_new2);

  d  := pg_get_functiondef(v_fn::oid);
  nw := (length(d) - length(replace(d, c_mark, ''))) / length(c_mark);
  if nw <> 2 or not exists (
       select 1 from pg_proc p
        where p.oid = v_fn::oid and p.prosecdef and p.provolatile = 's'
          and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=public%') then
    raise exception '177: 바꾼 뒤 확인 실패(대기 조건 %번 — 2번이어야 한다 · security definer·stable·search_path 확인)', nw;
  end if;
end $mig$;

-- ── 실행 권한 — 로그인 전용 그대로(118·119·174 와 같은 상태를 다시 적는다) ─────────
revoke all on function public.visitor_stats(date, date, text) from public, anon;
grant execute on function public.visitor_stats(date, date, text) to authenticated;

-- 확인(읽기 전용)
-- select length(prosrc), md5(prosrc),
--        (length(prosrc) - length(replace(prosrc, 'coalesce(b.status,'''') <> ''대기''', ''))) / length('coalesce(b.status,'''') <> ''대기''') as wait_filters
--   from pg_proc where oid = 'public.visitor_stats(date,date,text)'::regprocedure;            -- 6414 · 7341cc05cee3dc9ba477a157741ec0b0 · 2
-- select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute');   -- 15 (불변)

-- 되돌리기(필요할 때만 · 주석을 풀어 실행 — 넣은 두 줄만 지운다)
-- do $rb$
-- declare
--   d  text;
--   m1 constant text := chr(10) || $q$      and coalesce(b.status,'') <> '대기'$q$;
--   m2 constant text := chr(10) || $q$          and coalesce(b.status,'') <> '대기'$q$;
-- begin
--   d := pg_get_functiondef('public.visitor_stats(date,date,text)'::regprocedure::oid);
--   if position(m1 in d) = 0 and position(m2 in d) = 0 then raise notice '177 되돌리기: 이미 원래 본문'; return; end if;
--   execute replace(replace(d, m1, ''), m2, '');
-- end $rb$;
