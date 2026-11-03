-- ============================================================================
-- 163_room_type.sql — 엠클릭 「룸타입」 열 저장(bookings.room_type) + 시즈 서버 자동채움의 別棟 선호에 룸타입 반영 (2026-11-03)
--
--  Min 2026-11-03 「3번은 그렇게 다 설정되어 있는거야」 = 예약리스트의 룸타입 열(싱글 / 싱글,트윈 / 트윈 / 컴팩트 / 본관(개인온천X) /
--  별채(개인온천O) / 4인(4PERSON) / 8인(8PERSON) …)은 엠클릭에서 그렇게 설정해 둔 값 → 자동배정이 비고와 함께 쓴다.
--  ① bookings.room_type text — step1 이 룸타입 원문 그대로 저장(열이 없는 파일=null). 재등록 때 변경분 반영 대상.
--     · 방배정(room.html): 「싱글」=전원 1인 1실(비고 「전원 싱글」과 같은 경로 — 호텔동·체류 내내 빈 싱글이 인원수만큼 있을 때만, 아니면 보류)
--                         「싱글,트윈」=홀수 팀은 남는 1명이 싱글(기존 규칙) / 짝수 팀은 누가 싱글인지 비고에 없으면 보류(수기)
--     · 일별 체류 현황: 싱글 신청 수에 룸타입 반영(싱글=인원, 싱글,트윈 4명=2) · 시즈 예약표: 「별채」=別棟 선호
--  ② _shizu_autofill_impl(142 본문): 別棟 선호 = 현지비고 키워드(ANNEX_RE) OR 룸타입 「별채|別棟|離れ」(ANNEX_RT) — 텍스트 치환, 멱등.
--  RLS·RPC 권한 변경 없음(anon secdef 15 유지). 00_VERIFY 163.
--  적용: Supabase MCP(Min 「sql 163 적용해」) 또는 SQL Editor. 화면·step1 은 미적용이어도 동작(열 없으면 룸타입을 읽지 않고 종전 규칙).
-- ============================================================================

-- ① 룸타입 원문
alter table public.bookings add column if not exists room_type text;

-- ② 시즈 서버 증분 자동채움: 別棟 선호에 룸타입 반영(적용본 텍스트 치환)
do $do$
declare d text;
begin
  if to_regprocedure('public._shizu_autofill_impl(text)') is null then raise notice '_shizu_autofill_impl 없음 — 건너뜀(89/141/142 먼저)'; return; end if;
  d := pg_get_functiondef('public._shizu_autofill_impl(text)'::regprocedure);
  if d like '%ANNEX_RT%' then raise notice '163 already applied'; return; end if;
  d := replace(d,
    $x$ANNEX_RE  constant text := '별채|별관|別棟|別館|내탕|온천|内湯|温泉';$x$,
    $x$ANNEX_RE  constant text := '별채|별관|別棟|別館|내탕|온천|内湯|温泉';
  ANNEX_RT  constant text := '별채|別棟|離れ';   -- 엠클릭 룸타입 열(2027~ 「별채(개인온천O)」) — 163$x$);
  d := replace(d,
    $x$((coalesce(b.remark_local,'') || ' ' || coalesce(b.remark,'')) ~ ANNEX_RE)   as annex,$x$,
    $x$(((coalesce(b.remark_local,'') || ' ' || coalesce(b.remark,'')) ~ ANNEX_RE) or coalesce(b.room_type,'') ~ ANNEX_RT)   as annex,$x$);
  if d not like '%ANNEX_RT  constant%' or d not like '%~ ANNEX_RT)%' then raise exception '163: _shizu_autofill_impl 본문이 예상과 달라 치환 실패 — 142 와 대조'; end if;
  execute d;
end $do$;

-- 확인
-- select column_name from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='room_type';   -- room_type
-- select prosrc like '%ANNEX_RT%' from pg_proc where proname='_shizu_autofill_impl';                                                    -- true
-- select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'execute');  -- 15 (불변)
