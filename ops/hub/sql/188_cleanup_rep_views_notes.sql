-- ============================================================================
--  188_cleanup_rep_views_notes.sql — 대표 줄 바로잡기 · 쓰지 않는 옛 정산 뷰·빈 컬럼 · 메모 표의 없는 영역 키
--  상태: 적용 전(2026-11-21 작성 · Min 승인 뒤 MCP 로 적용)
-- ----------------------------------------------------------------------------
--  ① 이미 등록된 달의 대표 줄(guest_members.is_rep)
--     데이터 등록(step1)은 2026-11-12 부터 「예약의 대표고객(rep_name)과 이름(띄어쓰기 무시)이 같은 줄 가운데 첫 줄,
--     없으면 첫 줄」을 대표로 둔다(SZCore.repIndex). 그 전에 등록된 달은 늘 첫 줄이 대표였다 — 다시 등록하지 않은
--     팀만 남아 있다(2026-11-21 운영 대조: 12팀 · 모두 지난 날짜 · 두 방식(min/row_number)으로 센 수가 같다).
--     같은 규칙으로 is_rep 만 고친다(사람·방배정·청구는 건드리지 않는다 — rooms 는 줄 id 로 묶여 있다).
--     안전장치: 바꿀 줄이 60개를 넘으면 멈춘다(예상 24줄 = 12팀 × 2).
--  ② 아무 화면·함수·뷰도 읽지 않는 옛 정산 뷰 3개를 지운다: v_folio_by_category · v_folio_lines · v_folio_summary (09).
--     화면이 쓰는 v_folio_balance · v_settlement_by_category · v_settlement_by_rate 는 그대로.
--     다른 뷰가 기대면 cascade 없이 지우므로 그대로 멈춘다.
--  ③ 값이 전부 비어 있고 아무도 읽지 않는 컬럼 charges.source_ref 를 지운다(09 — 「서브시스템 행 id」 칸.
--     SQL 58·180 이 쓰지 않기로 했다). 값이 하나라도 있으면 멈춘다.
--     golf_groups.link_group(26 — 8명 팀 2조 연결)도 비어 있지만 docs/future-work.md 의 자동 균형분배 계획이 쓸 칸이라 남긴다.
--  ④ 메모 표(event_notes·event_note_log)의 쓰기 정책이 없는 영역 키 'notes' 를 보고 있었다(19).
--     그런 영역은 없어 지금 직접 쓰기는 관리자만 된다(화면은 RPC 44·61 — security definer 로 쓴다).
--     뜻을 바꾸지 않고 키만 뺀다: has_any_area('{notes}') → has_any_area('{}')(= 활성 관리자만 · 같은 결과).
--     RPC 44(dispatch_set_memo)·61(event_note_set)의 권한 배열에서도 'notes' 를 뺀다(남은 키 그대로 — 결과 같음).
--  ⑤ 확인 — 바뀐 줄 수·남은 뷰·컬럼·정책·RPC 본문.
--
--  멱등(다시 실행하면 ①은 바꿀 줄 0, ②③은 이미 없어 건너뜀, ④는 같은 정책을 다시 만든다).
--  되돌리기: ② 09_settlement_core.sql 의 세 뷰 정의를 다시 실행 · ③ alter table charges add column source_ref text ·
--            ④ 정책 식을 '{notes}' 로(뜻 같음) · ① 되돌릴 필요 없음(다시 등록하면 같은 규칙으로 정한다).
-- ============================================================================

-- ── ⓪ 적용 전 확인 ─────────────────────────────────────────────────────────────
do $chk$
begin
  if to_regclass('public.guest_members') is null or to_regclass('public.bookings') is null then
    raise exception '188: guest_members·bookings 가 없다';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'charges' and column_name = 'source_ref') then
    if exists (select 1 from public.charges where source_ref is not null) then
      raise exception '188: charges.source_ref 에 값이 있다 — 지우지 않는다(누가 쓰는지 먼저 확인)';
    end if;
  end if;
  if exists (select 1
               from pg_depend d
               join pg_rewrite rw on rw.oid = d.objid
               join pg_class v on v.oid = rw.ev_class
              where d.refobjid in (select c.oid from pg_class c
                                    where c.relnamespace = 'public'::regnamespace
                                      and c.relname in ('v_folio_by_category', 'v_folio_lines', 'v_folio_summary'))
                and v.relname not in ('v_folio_by_category', 'v_folio_lines', 'v_folio_summary')) then
    raise exception '188: 지울 옛 정산 뷰에 기대는 다른 뷰가 있다 — 지우지 않는다';
  end if;
  if exists (select 1 from pg_proc p
              where p.pronamespace = 'public'::regnamespace
                and (p.prosrc ~ '\mv_folio_by_category\M' or p.prosrc ~ '\mv_folio_lines\M' or p.prosrc ~ '\mv_folio_summary\M'
                     or p.prosrc ~ '\msource_ref\M')) then
    raise exception '188: 지울 뷰·컬럼을 읽는 함수가 있다 — 지우지 않는다';
  end if;
end $chk$;

-- ── ① 대표 줄 바로잡기(is_rep 만) ───────────────────────────────────────────────
do $rep$
declare
  n_on  int;
  n_off int;
begin
  create temp table _rep188 on commit drop as
    select g.id,
           row_number() over (
             partition by g.event_seq
             order by (coalesce(b.rep_name, '') <> ''
                       and regexp_replace(coalesce(g.name_kr, ''), '\s', '', 'g') = regexp_replace(coalesce(b.rep_name, ''), '\s', '', 'g')) desc,
                      g.seq_in_team, g.id) = 1 as want
      from public.guest_members g
      join public.bookings b on b.event_seq = g.event_seq;

  select count(*) filter (where r.want and not coalesce(g.is_rep, false)),
         count(*) filter (where not r.want and coalesce(g.is_rep, false))
    into n_on, n_off
    from _rep188 r join public.guest_members g on g.id = r.id;
  if n_on + n_off > 60 then
    raise exception '188 ①: 바꿀 대표 줄이 %개(켜기 % · 끄기 %) — 예상(24 안팎)보다 많아 멈춘다', n_on + n_off, n_on, n_off;
  end if;

  update public.guest_members g set is_rep = r.want
    from _rep188 r
   where r.id = g.id and coalesce(g.is_rep, false) <> r.want;

  raise notice '188 ①: 대표 줄 켬 % · 끔 %', n_on, n_off;

  if exists (select 1 from public.guest_members group by event_seq having count(*) filter (where is_rep) <> 1) then
    raise exception '188 ①: 대표 줄이 1개가 아닌 팀이 남았다';
  end if;
end $rep$;

-- ── ② 옛 정산 뷰 3개 ───────────────────────────────────────────────────────────
drop view if exists public.v_folio_by_category;
drop view if exists public.v_folio_lines;
drop view if exists public.v_folio_summary;

-- ── ③ 빈 컬럼 charges.source_ref ───────────────────────────────────────────────
alter table public.charges drop column if exists source_ref;

-- ── ④ 메모 표 정책 — 없는 영역 키 'notes' 빼기(뜻 같음: 직접 쓰기는 활성 관리자만) ───────
drop policy if exists event_notes_ins on public.event_notes;
create policy event_notes_ins on public.event_notes for insert to authenticated with check (has_any_area('{}'::text[]));
drop policy if exists event_notes_upd on public.event_notes;
create policy event_notes_upd on public.event_notes for update to authenticated using (has_any_area('{}'::text[])) with check (has_any_area('{}'::text[]));
drop policy if exists event_notes_del on public.event_notes;
create policy event_notes_del on public.event_notes for delete to authenticated using (has_any_area('{}'::text[]));
drop policy if exists event_note_log_ins on public.event_note_log;
create policy event_note_log_ins on public.event_note_log for insert to authenticated with check (has_any_area('{}'::text[]));
drop policy if exists event_note_log_upd on public.event_note_log;
create policy event_note_log_upd on public.event_note_log for update to authenticated using (has_any_area('{}'::text[])) with check (has_any_area('{}'::text[]));
drop policy if exists event_note_log_del on public.event_note_log;
create policy event_note_log_del on public.event_note_log for delete to authenticated using (has_any_area('{}'::text[]));

do $rpc$
declare
  r   record;
  d   text;
  n   int;
begin
  for r in
    select p.oid, p.oid::regprocedure::text as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosrc like '%has_any_area(array[%''notes''%'
  loop
    d := pg_get_functiondef(r.oid);
    n := (length(d) - length(replace(d, ',''notes''', ''))) / length(',''notes''');
    if n <> 1 then
      raise exception '188 ④: % 의 권한 배열에서 「,''notes''」 가 %번 — 1번이어야 한다(본문 확인)', r.sig, n;
    end if;
    execute replace(d, ',''notes''', '');
    raise notice '188 ④: % 의 권한 배열에서 notes 를 뺐다', r.sig;
  end loop;
end $rpc$;

-- ── ⑤ 적용 뒤 확인 ─────────────────────────────────────────────────────────────
do $post$
begin
  if to_regclass('public.v_folio_by_category') is not null or to_regclass('public.v_folio_lines') is not null
     or to_regclass('public.v_folio_summary') is not null then
    raise exception '188: 옛 정산 뷰가 남았다';
  end if;
  if to_regclass('public.v_folio_balance') is null or to_regclass('public.v_settlement_by_category') is null
     or to_regclass('public.v_settlement_by_rate') is null then
    raise exception '188: 화면이 쓰는 정산 뷰가 없어졌다';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'charges' and column_name = 'source_ref') then
    raise exception '188: charges.source_ref 가 남았다';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and (coalesce(qual, '') like '%notes}%' or coalesce(with_check, '') like '%notes}%')) then
    raise exception '188: 정책에 notes 영역 키가 남았다';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc like '%has_any_area(array[%''notes''%') then
    raise exception '188: 함수 권한 배열에 notes 가 남았다';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('event_notes', 'event_note_log')) <> 8 then
    raise exception '188: 메모 표 정책 수가 8이 아니다';
  end if;
end $post$;

notify pgrst, 'reload schema';
