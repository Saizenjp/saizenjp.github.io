-- ============================================================================
--  181_pos_display_walkin.sql — 손님 확인 화면(pos_display)에 당일 손님 계산서도 띄우게
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  무엇이 문제였나
--   pos_display.event_seq 는 예약(bookings) 외래키다(41: references bookings(event_seq) on delete set null —
--   운영 이름 pos_display_event_seq_fkey). 당일 손님(walkins, 번호 9,900,001~ — SQL 120)은 bookings 에 없어서,
--   POS 에서 당일 손님을 고르고 [손님 화면 표시]를 누르면 외래키 위반(23503)으로 저장되지 않는다
--   (화면에는 「손님 화면 표시 실패: … foreign key …」). 2026-11-12 검수 9차에서 남겨 둔 항목.
--   pos.html 은 당일 손님일 때 이 버튼을 막지 않는다(그대로 눌려 서버에서 실패한다) → 이 SQL 만 적용하면 화면 수정 없이 뜬다.
--   손님 태블릿(pos_customer.html)은 번호로 계산서(v_folio_balance·charges)만 읽으므로 당일 손님 계산서도 그대로 보인다
--   (대표자 이름 칸은 예약 표에서 읽어 비고 「손님」 기본 문구가 나온다 — 종전 화면 규칙 그대로).
--   프론트 데스크의 [손님 화면 표시]는 예약 팀 상세에만 있어 이 문제와 관계없다.
--
--  어떻게 고치나 — SQL 168(코스 배정표 네 표)·123(order_tokens)과 같은 방식
--    ⓪ 적용 전 확인: 표·열이 있는가 + 지울 외래키가 예상(event_seq → bookings · ON DELETE SET NULL)과 같은가
--       (다르면 정리 규칙이 종전과 달라지므로 멈춘다 — 이미 지워졌으면 이 검사는 그냥 지나간다).
--    ① 검사 트리거 pos_display_seq_guard: event_seq 가 비었거나, 예약 또는 당일 손님에 있는 번호만 받는다
--       (없는 번호는 종전처럼 23503 으로 거부). 부모 행을 FOR KEY SHARE 로 잡는다(외래키와 같은 잠금 —
--       검사와 동시에 부모가 지워지는 틈을 막는다).
--    ② 정리 트리거 pos_display_seq_cleanup: 예약·당일 손님이 지워지면 그 번호를 가리키던 pos_display.event_seq 를 비운다
--       (종전 외래키의 ON DELETE SET NULL 과 같은 결과 — 줄(계산대)은 남고 손님 화면은 「대기」가 된다.
--        updated_at·updated_by 는 건드리지 않는다 — 외래키 동작도 그랬다).
--       security definer 라 예약을 지우는 계정(데이터 등록 등)에 POS 권한이 없어도 정리된다(외래키 동작도 RLS 를 보지 않았다).
--    ③ 그 뒤 외래키를 없앤다 — pos_display → bookings 외래키를 이름과 관계없이 찾아 지운다(정의를 notice 로 남긴다).
--    ④ 적용 뒤 확인 — 외래키 0 · 어디에도 없는 번호를 가리키는 줄 0(있으면 경고만 — 종전 외래키 때문에 생길 수 없다).
--
--  168 의 정리 함수(golf_rows_cleanup)에 이어 붙이지 않고 새 트리거로 한 이유
--    · 하는 일이 다르다 — golf_rows_cleanup 은 줄을 지우고(CASCADE 대신), 여기는 칸을 비운다(SET NULL 대신).
--    · golf_rows_cleanup 을 고치면 운영 본문 대조(⓪ md5)가 필요하고, 같은 함수를 고치는 다른 파일과 겹칠 수 있다.
--      새 함수는 기존 함수를 하나도 바꾸지 않는다(운영 본문 대조가 필요 없다).
--    · 00_VERIFY 168 줄이 트리거 이름 trg_seq_guard·trg_golf_cleanup_* 를 정확히 6개로 센다 — 같은 이름을 쓰면 그 줄이 깨진다.
--      그래서 트리거 이름도 따로 둔다(trg_posdisp_seq_guard · trg_posdisp_cleanup_bookings · trg_posdisp_cleanup_walkins).
--    · 검사 함수도 golf_seq_guard 를 빌리지 않는다(골프 이름의 함수가 손님 화면 규칙까지 맡지 않게 — 본문 뜻은 같다).
--
--  권한: 표 정책(41: pos·front·settle 읽기·쓰기) 그대로. 새 함수 둘은 트리거 전용(public·anon·authenticated 실행 권한 회수) —
--        비로그인이 실행할 수 있는 security definer 함수 수(15) 그대로.
--  바뀌지 않는 것: 예약 번호 표시·비우기, 없는 번호 거부(23503), 예약이 지워지면 화면이 비는 것.
--  외래키와 다른 점 두 가지(168·123 과 같다):
--    · 예약 번호(event_seq) 자체를 바꾸는 경우 외래키는 막았지만 이 방식은 막지 않는다(예약 번호는 바뀌지 않는다. 데이터 등록은 번호로 맞춘다).
--    · bookings·walkins 를 TRUNCATE 하면 정리 트리거가 돌지 않는다(외래키는 TRUNCATE 를 막았다 — 화면·데이터 등록은 delete 만 쓴다).
--  잠금: 트리거를 다는 동안 bookings·walkins 쓰기가, 외래키를 지우는 동안 pos_display 읽기·쓰기(손님 태블릿 폴링 포함)가
--        잠깐 기다린다(표가 작아 순간).
--  멱등(다시 실행해도 같은 결과 — 외래키가 이미 없으면 ⓪ 의 외래키 검사와 ③ 은 아무것도 하지 않는다).
--  41 머리말 제안 한 줄: 「외래키는 181 이 검사·정리 트리거로 바꿨다(당일 손님 번호 허용)」.
--
--  되돌리기(이 순서로 · 멱등):
--   drop trigger if exists trg_posdisp_seq_guard on public.pos_display;
--   drop trigger if exists trg_posdisp_cleanup_bookings on public.bookings;
--   drop trigger if exists trg_posdisp_cleanup_walkins on public.walkins;
--   drop function if exists public.pos_display_seq_guard();
--   drop function if exists public.pos_display_seq_cleanup();
--   update public.pos_display d set event_seq = null
--    where d.event_seq is not null and not exists (select 1 from public.bookings b where b.event_seq = d.event_seq);   -- 당일 손님 번호를 비운다
--   alter table public.pos_display drop constraint if exists pos_display_event_seq_fkey;
--   alter table public.pos_display add constraint pos_display_event_seq_fkey
--     foreign key (event_seq) references public.bookings(event_seq) on delete set null;
--   notify pgrst, 'reload schema';
-- ============================================================================

-- ── ⓪ 적용 전 확인 — 표(41·120)와 열이 있는가 · 지울 외래키가 예상과 같은가 ─────────────
do $chk$
declare
  v_att smallint;
begin
  if to_regclass('public.pos_display') is null then
    raise exception '181: pos_display 가 없다 — 41_pos_display.sql 을 먼저 적용한다';
  end if;
  if to_regclass('public.walkins') is null then
    raise exception '181: walkins 가 없다 — 120_walkins.sql 을 먼저 적용한다';
  end if;
  select a.attnum into v_att from pg_attribute a
   where a.attrelid = 'public.pos_display'::regclass and a.attname = 'event_seq' and not a.attisdropped;
  if v_att is null then
    raise exception '181: pos_display.event_seq 열이 없다 — 41 의 표 정의를 확인한다';
  end if;
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.walkins'::regclass and a.attname = 'event_seq' and not a.attisdropped) then
    raise exception '181: walkins.event_seq 열이 없다 — 120 의 표 정의를 확인한다';
  end if;
  -- 지울 외래키 = event_seq 한 열 → bookings · ON DELETE SET NULL 이어야 한다(정리 트리거가 그 동작을 그대로 잇는다).
  -- 다르면(CASCADE 등) 종전 동작과 달라지므로 멈춘다. 이미 지워졌으면(다시 실행) 여기서 보는 것이 없다.
  if exists (select 1 from pg_constraint c
              where c.conrelid = 'public.pos_display'::regclass and c.contype = 'f'
                and c.confrelid = 'public.bookings'::regclass
                and not (c.confdeltype = 'n' and c.conkey = array[v_att]::smallint[])) then
    raise exception '181: pos_display → bookings 외래키가 예상(event_seq · ON DELETE SET NULL)과 다르다 — 운영 정의(pg_get_constraintdef)를 확인한다';
  end if;
end $chk$;

-- ── ① 번호 검사 — 예약(bookings) 또는 당일 손님(walkins)에 있는 번호만 ─────────────
create or replace function public.pos_display_seq_guard() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.event_seq is null then return new; end if;   -- 손님 화면 끄기(비우기)는 늘 받는다
  perform 1 from bookings where event_seq = new.event_seq for key share;
  if found then return new; end if;
  perform 1 from walkins where event_seq = new.event_seq for key share;
  if found then return new; end if;
  raise exception 'pos_display: event_seq % 는 예약에도 당일 손님에도 없습니다', new.event_seq
    using errcode = '23503';
end $fn$;
revoke all on function public.pos_display_seq_guard() from public, anon, authenticated;   -- 트리거 전용
comment on function public.pos_display_seq_guard() is
  '손님 확인 화면(181) — pos_display.event_seq 는 비었거나 예약·당일 손님에 있는 번호만(옛 bookings 외래키 대신). 트리거 전용.';

-- ── ② 정리 — 예약·당일 손님이 지워지면 그 번호를 가리키던 손님 화면 칸을 비운다(옛 ON DELETE SET NULL) ──
create or replace function public.pos_display_seq_cleanup() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  update pos_display set event_seq = null where event_seq = old.event_seq;
  return old;
end $fn$;
revoke all on function public.pos_display_seq_cleanup() from public, anon, authenticated;   -- 트리거 전용
comment on function public.pos_display_seq_cleanup() is
  '손님 확인 화면(181) — 예약·당일 손님 삭제 시 그 번호의 pos_display.event_seq 를 비운다(옛 외래키 ON DELETE SET NULL 과 같은 결과). 트리거 전용.';

drop trigger if exists trg_posdisp_seq_guard on public.pos_display;
create trigger trg_posdisp_seq_guard before insert or update of event_seq on public.pos_display
  for each row execute function public.pos_display_seq_guard();

drop trigger if exists trg_posdisp_cleanup_bookings on public.bookings;
create trigger trg_posdisp_cleanup_bookings after delete on public.bookings
  for each row execute function public.pos_display_seq_cleanup();

drop trigger if exists trg_posdisp_cleanup_walkins on public.walkins;
create trigger trg_posdisp_cleanup_walkins after delete on public.walkins
  for each row execute function public.pos_display_seq_cleanup();

-- ── ③ 외래키 제거 — pos_display → bookings 외래키를 이름과 관계없이 찾아 지운다 ───────────
do $fk$
declare
  r record;
begin
  for r in
    select c.conname, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
     where c.conrelid = 'public.pos_display'::regclass
       and c.contype = 'f'
       and c.confrelid = 'public.bookings'::regclass
  loop
    execute format('alter table public.pos_display drop constraint %I', r.conname);
    raise notice '181: 외래키 % 제거 (%)', r.conname, r.def;
  end loop;
end $fk$;

-- ── ④ 적용 뒤 확인 ─────────────────────────────────────────────────────────────
do $post$
declare
  n integer;
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'public.pos_display'::regclass and contype = 'f'
                and confrelid = 'public.bookings'::regclass) then
    raise exception '181: pos_display → bookings 외래키가 남아 있다';
  end if;
  select count(*) into n
    from pos_display d
   where d.event_seq is not null
     and not exists (select 1 from bookings b where b.event_seq = d.event_seq)
     and not exists (select 1 from walkins  w where w.event_seq = d.event_seq);
  if n > 0 then
    raise warning '181: 예약에도 당일 손님에도 없는 번호를 가리키는 손님 화면 줄 %개 — station 을 확인해 비운다', n;
  end if;
end $post$;

notify pgrst, 'reload schema';

-- 확인용(읽기만):
--   select conname from pg_constraint where conrelid='public.pos_display'::regclass and contype='f';   -- 0행
--   select tgrelid::regclass, tgname, tgenabled, tgtype from pg_trigger
--    where tgname in ('trg_posdisp_seq_guard','trg_posdisp_cleanup_bookings','trg_posdisp_cleanup_walkins') and not tgisinternal;   -- 3행(tgtype 23·9·9)
--   select station, event_seq from pos_display;   -- 당일 손님 번호(9900001~)도 들어갈 수 있다
