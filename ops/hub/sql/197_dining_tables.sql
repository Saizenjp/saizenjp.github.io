-- ============================================================================
--  197_dining_tables.sql — 레스토랑·연회장 테이블 번호(1단계)
--  상태: 적용 완료(2026-11-26, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  Min 2026-11-26 「레스토랑과 연회장에 테이블 번호를 만들어서 정해놓을거야」 → 「기본값대로 1단계 진행해」
--  기본값: 번호 R1~(레스토랑)·C1~(컨벤션홀) · 석식만 · 체류 내내 같은 테이블 · 정원 초과는 경고만(막지 않는다).
--
--  + Min 2026-11-26 「8인 이상 팀은 컨벤션홀로 우선 배정 · 특식 주문팀은 테이블 위치도 조금 좋은 곳으로」 → dining_tables.prime(좋은 자리)
--  ① dining_tables — 테이블 등록(장소·번호·좌석·순서·좋은 자리·사용·메모). 번호는 전체에서 유일.
--  ② dinner_table_assign — (석식 날짜, 행사번호, 테이블) 한 줄. 한 팀 여러 테이블·한 테이블 여러 팀 모두 허용.
--     source = auto(자동 배정) / manual(사람이 고침) — 자동 배정은 auto 만 다시 만들고 manual 은 건드리지 않는다.
--     table_id 가 비어 있는 manual 줄 = 「테이블 없이 둔다」(마지막 테이블을 ✕ 로 뺀 팀 — 자동 배정이 다시 채우지 않게). 같은 줄 두 번은 NULLS NOT DISTINCT 로 막는다.
--  ③ dinner_tables_autofill(날짜, [{event_seq, table_id}]) — 화면이 계산한 그날 자동 배정 전체(SZCore.dinnerTablePlan)로 그날 auto 줄을 맞춘다.
--     날짜 단위 잠금 아래에서: 목록에 없는 auto 줄은 지우고, 수기 줄이 있는 팀은 건드리지 않고, 수기 줄이 앉은 테이블에는 넣지 않는다.
--     (검토 2026-11-26: 처음 한 번만 채우면 날짜를 여는 순서·달 경계·묶음 변경에 따라 연박 테이블이 바뀌거나 반만 배정된 채 남았다.)
--  권한: 읽기 = 로그인 · 쓰기 = 석식 장소와 같은 영역(print·front·kitchen — SQL 134·145). 새 표 2개에 RESTRICTIVE active_staff_only(SQL 189).
--
--  멱등. 되돌리기: drop function dinner_tables_autofill · drop table dinner_table_assign, dining_tables.
-- ============================================================================

-- ── ⓪ 적용 전 확인 ─────────────────────────────────────────────────────────────
do $chk$
begin
  if to_regclass('public.bookings') is null then raise exception '197: bookings 가 없다'; end if;
  if to_regprocedure('public.has_any_area(text[])') is null or to_regprocedure('public.is_active_staff()') is null then
    raise exception '197: has_any_area·is_active_staff 가 없다(SQL 189 먼저)';
  end if;
  if to_regproc('public.set_updated_at') is null then raise exception '197: set_updated_at 이 없다'; end if;
end $chk$;

-- ── ① 테이블 등록 ─────────────────────────────────────────────────────────────
create table if not exists public.dining_tables (
  id          bigserial primary key,
  venue       text    not null check (venue in ('restaurant', 'convention')),
  code        text    not null check (length(btrim(code)) between 1 and 12),
  seats       int     not null check (seats between 1 and 100),
  sort        int     not null default 0,
  prime       boolean not null default false,
  active      boolean not null default true,
  note        text,
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.dining_tables add column if not exists prime boolean not null default false;
create unique index if not exists dining_tables_code_uq on public.dining_tables (upper(btrim(code)));
comment on table public.dining_tables is '197 — 레스토랑·연회장 테이블(번호 R1~·C1~ 기본값). 좌석 = 정원(넘으면 배정 화면에서 경고만).';

-- ── ② 날짜별 배정 ─────────────────────────────────────────────────────────────
create table if not exists public.dinner_table_assign (
  dinner_date date   not null,
  event_seq   bigint not null references public.bookings(event_seq) on delete cascade,
  table_id    bigint references public.dining_tables(id) on delete cascade,   -- 비어 있음 = 테이블 없이 둔다(manual 만)
  source      text   not null default 'manual' check (source in ('auto', 'manual')),
  updated_by  text,
  updated_at  timestamptz not null default now(),
  constraint dinner_table_assign_uq unique nulls not distinct (dinner_date, event_seq, table_id),
  constraint dinner_table_assign_none_manual check (table_id is not null or source = 'manual')
);
create index if not exists idx_dinner_table_assign_day on public.dinner_table_assign(dinner_date);
comment on table public.dinner_table_assign is '197 — 석식 테이블 배정(날짜·팀·테이블). auto = 자동 배정, manual = 사람이 고침(자동이 건드리지 않음).';

do $t$
begin
  if not exists (select 1 from pg_trigger where tgname = 'dining_tables_updated' and tgrelid = 'public.dining_tables'::regclass) then
    create trigger dining_tables_updated before update on public.dining_tables for each row execute function set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'dinner_table_assign_updated' and tgrelid = 'public.dinner_table_assign'::regclass) then
    create trigger dinner_table_assign_updated before update on public.dinner_table_assign for each row execute function set_updated_at();
  end if;
end $t$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.dining_tables enable row level security;
alter table public.dinner_table_assign enable row level security;
do $p$
declare t text;
begin
  foreach t in array array['dining_tables', 'dinner_table_assign'] loop
    execute format('drop policy if exists %I on public.%I', t || '_sel', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_sel', t);
    execute format('drop policy if exists %I on public.%I', t || '_ins', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (has_any_area(array[''print'',''front'',''kitchen'']))', t || '_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_upd', t);
    execute format('create policy %I on public.%I for update to authenticated using (has_any_area(array[''print'',''front'',''kitchen''])) with check (has_any_area(array[''print'',''front'',''kitchen'']))', t || '_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_del', t);
    execute format('create policy %I on public.%I for delete to authenticated using (has_any_area(array[''print'',''front'',''kitchen'']))', t || '_del', t);
    execute format('drop policy if exists active_staff_only on public.%I', t);
    execute format('create policy active_staff_only on public.%I as restrictive for all to authenticated using ((select public.is_active_staff())) with check ((select public.is_active_staff()))', t);
  end loop;
end $p$;

-- ── ③ 자동 배정 저장(그날 auto 줄을 화면 계산에 맞춘다) ──────────────────────────
--  p_rows = 그날 자동 배정 전체 [{event_seq, table_id}] · 반환 = {inserted, deleted, skipped_teams}
create or replace function public.dinner_tables_autofill(p_date date, p_rows jsonb, p_by text default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_ins int := 0; v_del int := 0; v_skip int := 0; v_n int; v_seq bigint; v_by text; v_claims jsonb;
begin
  if not coalesce(is_active_staff(), false) or not coalesce(has_any_area(array['print', 'front', 'kitchen']), false) then
    raise exception 'dinner_tables_autofill: 권한 없음(석식 — 인쇄·프론트·주방)' using errcode = '42501';
  end if;
  if p_date is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'dinner_tables_autofill: 날짜·줄 배열이 올바르지 않다' using errcode = '22023';
  end if;
  if p_date < (now() at time zone 'Asia/Tokyo')::date then
    raise exception 'dinner_tables_autofill: 지난 날짜는 자동으로 바꾸지 않는다' using errcode = '22023';
  end if;
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_by := left(coalesce(nullif(btrim(p_by), ''), nullif(v_claims -> 'user_metadata' ->> 'name', ''), nullif(v_claims ->> 'email', ''), 'auto'), 100);
  perform pg_advisory_xact_lock(hashtext('dinner_tables:' || p_date::text));   -- 같은 날짜 자동 배정은 한 줄로

  -- 목록에 없는 auto 줄 · 수기 줄이 있는 팀의 auto 줄을 지운다
  delete from dinner_table_assign a
   where a.dinner_date = p_date and a.source = 'auto'
     and ( not exists (select 1 from jsonb_array_elements(p_rows) r
                        where (r ->> 'event_seq')::bigint = a.event_seq and (r ->> 'table_id')::bigint = a.table_id)
        or exists (select 1 from dinner_table_assign m where m.dinner_date = p_date and m.event_seq = a.event_seq and m.source = 'manual') );
  get diagnostics v_del = row_count;

  for v_seq in select distinct (r ->> 'event_seq')::bigint from jsonb_array_elements(p_rows) r loop
    if exists (select 1 from dinner_table_assign m where m.dinner_date = p_date and m.event_seq = v_seq and m.source = 'manual')
       or exists (select 1 from jsonb_array_elements(p_rows) r
                    join dinner_table_assign m on m.dinner_date = p_date and m.source = 'manual' and m.table_id = (r ->> 'table_id')::bigint
                   where (r ->> 'event_seq')::bigint = v_seq) then
      v_skip := v_skip + 1; continue;   -- 사람이 정한 팀·사람이 정한 테이블은 건드리지 않는다(화면이 오래된 계산을 보낸 경우)
    end if;
    insert into dinner_table_assign(dinner_date, event_seq, table_id, source, updated_by)
    select p_date, v_seq, t.id, 'auto', v_by
      from jsonb_array_elements(p_rows) r
      join dining_tables t on t.id = (r ->> 'table_id')::bigint and t.active
     where (r ->> 'event_seq')::bigint = v_seq
       and exists (select 1 from bookings b where b.event_seq = v_seq)
    on conflict on constraint dinner_table_assign_uq do nothing;
    get diagnostics v_n = row_count;
    v_ins := v_ins + v_n;
  end loop;
  return jsonb_build_object('inserted', v_ins, 'deleted', v_del, 'skipped_teams', v_skip);
end $fn$;
revoke all on function public.dinner_tables_autofill(date, jsonb, text) from public, anon;
grant execute on function public.dinner_tables_autofill(date, jsonb, text) to authenticated;
comment on function public.dinner_tables_autofill(date, jsonb, text) is '197 — 석식 테이블 자동 배정: 그날 auto 줄을 화면 계산에 맞춘다(수기 줄·수기 테이블은 그대로, 날짜 잠금).';

-- ── ④ 적용 뒤 확인 ─────────────────────────────────────────────────────────────
do $post$
begin
  if to_regclass('public.dining_tables') is null or to_regclass('public.dinner_table_assign') is null then
    raise exception '197: 표가 없다';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('dining_tables', 'dinner_table_assign') and policyname = 'active_staff_only') <> 2 then
    raise exception '197: active_staff_only 정책이 두 표에 없다';
  end if;
  if has_function_privilege('anon', 'public.dinner_tables_autofill(date,jsonb,text)', 'execute') then
    raise exception '197: anon 이 dinner_tables_autofill 을 부를 수 있다';
  end if;
end $post$;

notify pgrst, 'reload schema';
