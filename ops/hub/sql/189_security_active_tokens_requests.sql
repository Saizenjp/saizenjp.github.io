-- ============================================================================
--  189_security_active_tokens_requests.sql — 차단 계정의 직접 조회 막기 · 손님 QR 토큰 읽기 범위 · 가입 요청 제한
--  상태: 적용 완료(2026-11-22, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  ① 차단(user_access.active = false)·권한 행이 없는 로그인 계정
--     지금은 화면(guardPage)과 쓰기 정책(has_any_area — active 확인)만 막고, 읽기 정책이 `true` 인 표 48개는
--     API 로 직접 읽을 수 있었다. → 모든 RLS 표에 RESTRICTIVE 정책 active_staff_only(로그인 계정 전용)를 단다:
--     활성 권한 행이 있어야 어떤 정책도 통과한다(기존 정책은 그대로 — 그 위에 「그리고」로 걸린다).
--     빼는 표: user_access(자기 권한 행 — 화면이 차단 안내를 띄우려고 읽는다) · access_requests(가입 요청 — 계정 전 단계).
--     비로그인(anon) 정책(손님 화면·안내 모니터)은 영향 없다 — 이 정책은 authenticated 에만 걸린다.
--     security definer 함수·트리거·자동 실행(cron)은 RLS 를 거치지 않으므로 그대로 돈다.
--     판정 함수 is_active_staff() 는 정책 안에서 (select …) 로 불러 질의마다 한 번만 계산한다.
--     ⚠ 앞으로 새 표를 만들면 이 정책도 같이 단다(00_VERIFY 189 줄이 빠진 표를 센다).
--  ② is_admin() 이 active 를 보지 않았다 → 차단된 관리자 계정도 관리자 판정. active 를 더한다.
--  ③ 손님 QR 토큰(order_tokens) 읽기를 로그인 전원 → 인쇄·객실·프론트·정산·POS 영역(하위 영역 포함 — area_expand).
--     토큰으로 쓰는 화면: 수배서·QR 카드(print) · 프론트·행사(front) · 정산(settle) · POS(pos) · 손님 청구서의 직원 바(권한 없으면 바만 안 뜬다).
--  ④ 가입 요청(access_requests) — 비로그인이 처리 상태·처리자를 임의로 넣을 수 있었고 길이·횟수 제한이 없었다.
--     넣을 때: status='pending'·handled_by/at 비움·이름 100자·이메일 200자(@ 포함)·부서 100자·메시지 1000자 이내.
--     같은 이메일의 대기 요청은 하루 1건, 전체는 한 시간 30건까지(트리거). 관리 정책(읽기·처리·삭제)에 active 를 더한다.
--  멱등. 되돌리기: drop policy active_staff_only on 각 표 · 정책 ot_sel 을 using(true) 로 · access_requests 정책·트리거를 28 판으로.
-- ============================================================================

-- ── ⓪ 적용 전 확인 ─────────────────────────────────────────────────────────────
do $chk$
begin
  if to_regclass('public.user_access') is null or to_regclass('public.order_tokens') is null or to_regclass('public.access_requests') is null then
    raise exception '189: user_access·order_tokens·access_requests 가 없다';
  end if;
  if to_regprocedure('public.has_any_area(text[])') is null then
    raise exception '189: has_any_area(text[]) 가 없다 — 18·46 먼저';
  end if;
  if exists (select 1 from public.access_requests where length(coalesce(name,'')) > 100 or length(coalesce(email,'')) > 200
                                                    or length(coalesce(dept,'')) > 100 or length(coalesce(message,'')) > 1000) then
    raise exception '189: 길이 제한을 넘는 가입 요청이 이미 있다 — 먼저 확인';
  end if;
end $chk$;

-- ── ① 활성 계정 판정 + 모든 RLS 표에 RESTRICTIVE 정책 ────────────────────────────
create or replace function public.is_active_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from user_access where user_id = auth.uid() and active);
$$;
revoke all on function public.is_active_staff() from public, anon;
grant execute on function public.is_active_staff() to authenticated;
comment on function public.is_active_staff() is '189 — 로그인 계정에 활성 권한 행이 있는가(RESTRICTIVE 정책 active_staff_only 의 판정).';

do $rls$
declare r record; n int := 0;
begin
  for r in
    select c.relname
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and c.relrowsecurity
       and c.relname not in ('user_access', 'access_requests')
     order by 1
  loop
    execute format('drop policy if exists active_staff_only on public.%I', r.relname);
    execute format('create policy active_staff_only on public.%I as restrictive for all to authenticated using ((select public.is_active_staff())) with check ((select public.is_active_staff()))', r.relname);
    n := n + 1;
  end loop;
  raise notice '189 ①: active_staff_only 를 %개 표에 달았다', n;
end $rls$;

-- ── ② is_admin() 에 active ─────────────────────────────────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from user_access where user_id = auth.uid() and role = 'admin' and active);
$$;

-- ── ③ 손님 QR 토큰 읽기 범위 ───────────────────────────────────────────────────
drop policy if exists ot_sel on public.order_tokens;
create policy ot_sel on public.order_tokens for select to authenticated
  using (has_any_area(array['print','room','front','settle','pos']));

-- ── ④ 가입 요청 — 넣는 값 제한 · 횟수 제한 · 관리 정책에 active ───────────────────
drop policy if exists ar_insert_any on public.access_requests;
create policy ar_insert_any on public.access_requests for insert to anon, authenticated
  with check (
    coalesce(status, 'pending') = 'pending' and handled_by is null and handled_at is null
    and length(btrim(coalesce(name, ''))) between 1 and 100
    and length(btrim(coalesce(email, ''))) between 3 and 200 and position('@' in coalesce(email, '')) > 1
    and length(coalesce(dept, '')) <= 100 and length(coalesce(message, '')) <= 1000
  );

drop policy if exists ar_read_admin on public.access_requests;
create policy ar_read_admin on public.access_requests for select to authenticated
  using (exists (select 1 from user_access where user_id = auth.uid() and active and role in ('admin', 'manager')));
drop policy if exists ar_update_admin on public.access_requests;
create policy ar_update_admin on public.access_requests for update to authenticated
  using (exists (select 1 from user_access where user_id = auth.uid() and active and role in ('admin', 'manager')))
  with check (exists (select 1 from user_access where user_id = auth.uid() and active and role in ('admin', 'manager')));
drop policy if exists ar_delete_admin on public.access_requests;
create policy ar_delete_admin on public.access_requests for delete to authenticated
  using (exists (select 1 from user_access where user_id = auth.uid() and active and role = 'admin'));

create or replace function public.access_requests_limit() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if exists (select 1 from access_requests
              where lower(btrim(email)) = lower(btrim(new.email)) and status = 'pending'
                and created_at > now() - interval '1 day') then
    raise exception '같은 이메일의 가입 요청이 이미 접수되어 있습니다(하루 1건)' using errcode = 'P0001';
  end if;
  if (select count(*) from access_requests where created_at > now() - interval '1 hour') >= 30 then
    raise exception '가입 요청이 너무 많습니다 — 잠시 뒤 다시 시도해 주십시오' using errcode = 'P0001';
  end if;
  return new;
end $fn$;
revoke all on function public.access_requests_limit() from public, anon, authenticated;
drop trigger if exists trg_access_requests_limit on public.access_requests;
create trigger trg_access_requests_limit before insert on public.access_requests
  for each row execute function public.access_requests_limit();

-- ── ⑤ 적용 뒤 확인 ─────────────────────────────────────────────────────────────
do $post$
declare n_miss int;
begin
  select count(*) into n_miss
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and c.relrowsecurity
     and c.relname not in ('user_access', 'access_requests')
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                       and p.policyname = 'active_staff_only' and p.permissive = 'RESTRICTIVE');
  if n_miss > 0 then raise exception '189: active_staff_only 가 없는 표 %개', n_miss; end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_tokens' and policyname = 'ot_sel' and qual <> 'true') then
    raise exception '189: order_tokens 읽기 정책이 그대로다';
  end if;
  if (select prosrc from pg_proc where oid = 'public.is_admin()'::regprocedure) not like '%active%' then
    raise exception '189: is_admin 에 active 가 없다';
  end if;
end $post$;

notify pgrst, 'reload schema';
