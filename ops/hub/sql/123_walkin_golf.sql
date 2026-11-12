-- ============================================================================
-- 123_walkin_golf.sql — 당일 골프 손님(워크인): 골프 정보 + 프론트 등록 + QR
--
--  Min 확인(2026-08): **순수 워크인은 없다. 워크인은 전부 골프를 치러 오는 손님이다.**
--   → 조편성이 필요하고(명단이 없어 자동 배정이 안 되므로 사람이 확인해야 한다),
--     골프장·레스토랑·골프샵 여러 곳에서 같은 손님을 알아봐야 하므로 QR 도 준다.
--   → 등록은 **프론트에서** 받는다(Min 결정).
--
--  멱등. MCP 적용 완료. 번호 123.
--  2026-11-12 기록 보충: ②③④ 는 적용 당시 이 파일에 개요(주석)만 있고 본문은 DB 에만 있었다.
--   운영 DB 의 정의(pg_get_functiondef · pg_get_triggerdef · pg_policies)를 그대로 옮겨 적었다 —
--   다시 실행해도 운영 DB 는 바뀌지 않는다(같은 정의).
--  남은 정리(168, 승인 대기): 옛 4인자 walkin_open(120)·옛 정책 walkins_write/walkins_update(120) 삭제.
-- ============================================================================

-- ① 골프 정보 — 조편성에 필요한 최소한만
alter table walkins add column if not exists holes    integer;   -- 9 / 18 / 27
alter table walkins add column if not exists tee_pref text;      -- 희망 티오프 'HH:MM'
alter table walkins add column if not exists course   text;      -- aso/sobo/kuju (비우면 자동)
alter table walkins add column if not exists phone    text;      -- 당일 손님이라 연락 수단이 필요

-- ② order_tokens 가 워크인 번호도 받게
--    워크인은 walkins 에 있고 bookings 에 없다. 한 FK 로 두 테이블을 묶을 수 없으므로
--    FK 를 제거하고, 예약/워크인이 지워질 때 토큰을 정리하는 트리거를 양쪽에 단다.
alter table order_tokens drop constraint if exists order_tokens_event_seq_fkey;

CREATE OR REPLACE FUNCTION public.order_tokens_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from order_tokens where event_seq = old.event_seq;
  return old;
end $function$;
revoke all on function public.order_tokens_cleanup() from public, anon, authenticated;   -- 트리거 전용

drop trigger if exists trg_ot_cleanup_bookings on public.bookings;
create trigger trg_ot_cleanup_bookings after delete on public.bookings
  for each row execute function order_tokens_cleanup();
drop trigger if exists trg_ot_cleanup_walkins on public.walkins;
create trigger trg_ot_cleanup_walkins after delete on public.walkins
  for each row execute function order_tokens_cleanup();

-- ③ walkin_open 확장 — 권한에 front·golf 추가 + 골프 인자 4개
--    (p_name, p_pax, p_venue, p_date, p_holes, p_tee, p_course, p_phone)
--    ※ 120 의 4인자 판(p_date, p_name, p_pax, p_venue)은 따로 남아 있다 — 인자 이름이 겹쳐, 4개만 보내면
--       서버가 어느 쪽인지 고르지 못한다. 화면은 8인자 판에만 있는 인자를 같이 보낸다. 옛 판 삭제는 168.
CREATE OR REPLACE FUNCTION public.walkin_open(p_name text DEFAULT NULL::text, p_pax integer DEFAULT 1, p_venue text DEFAULT NULL::text, p_date date DEFAULT NULL::date, p_holes integer DEFAULT NULL::integer, p_tee text DEFAULT NULL::text, p_course text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_folio uuid; v_ym text;
begin
  if not (is_admin() or has_any_area(array['pos','settle','front','golf'])) then
    raise exception 'no permission';
  end if;
  p_date := coalesce(p_date, (now() at time zone 'Asia/Tokyo')::date);
  v_ym   := to_char(p_date, 'YYYY-MM');
  lock table walkins in exclusive mode;
  select coalesce(max(event_seq), 9900000) + 1 into v_seq from walkins;
  insert into walkins(event_seq, walk_date, name, pax, venue, created_by, holes, tee_pref, course, phone)
  values (v_seq, p_date, nullif(btrim(coalesce(p_name,'')),''), greatest(coalesce(p_pax,1),1),
          nullif(btrim(coalesce(p_venue,'')),''), auth.email(),
          p_holes, nullif(btrim(coalesce(p_tee,'')),''),
          nullif(btrim(coalesce(p_course,'')),''), nullif(btrim(coalesce(p_phone,'')),''));
  insert into folios(event_seq, subject, status, session_ym, created_by)
  values (v_seq, 'team', 'open', v_ym, auth.email())
  returning id into v_folio;
  return jsonb_build_object('event_seq', v_seq, 'folio_id', v_folio, 'session_ym', v_ym);
end $function$;
revoke execute on function public.walkin_open(text, integer, text, date, integer, text, text, text) from public, anon;
grant  execute on function public.walkin_open(text, integer, text, date, integer, text, text, text) to authenticated;

-- ④ walkins 쓰기 권한에 front·golf 추가(등록 화면이 프론트로 가므로)
--    ※ 120 의 옛 정책 walkins_write·walkins_update(pos·settle)는 아래 정책의 부분집합으로 남아 있다(동작 차이 없음) — 삭제는 168.
drop policy if exists walkins_ins on public.walkins;
create policy walkins_ins on public.walkins for insert to authenticated
  with check (has_any_area(array['pos','settle','front','golf']));
drop policy if exists walkins_upd on public.walkins;
create policy walkins_upd on public.walkins for update to authenticated
  using (has_any_area(array['pos','settle','front','golf']))
  with check (has_any_area(array['pos','settle','front','golf']));

-- 확인용:
--   select event_seq, walk_date, name, pax, holes, tee_pref, course from walkins order by event_seq;
