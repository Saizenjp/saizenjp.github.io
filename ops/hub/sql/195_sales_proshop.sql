-- ============================================================================
--  195_sales_proshop.sql — 부서별 매출에 골프샵을 따로(골프와 별개)
--  상태: 적용 전
-- ----------------------------------------------------------------------------
--  Min 2026-11-26 「골프샵 매출도 따로 보이게 해줘」(194 「골프샵은 골프 코스 관리 등과는 완전 별개」의 매출 쪽).
--
--  ① 권한 트리에 sales_proshop(골프샵 매출, 부모 sales) — 41행 재시드. 권한 관리에서 골프샵 책임자에게 따로 체크한다.
--  ② sales_dept_of: 청구 매장 proshop → 'proshop'(전에는 골프). golf(라운딩·카트·9홀) 는 그대로 골프.
--     네 부서(fnb·front·golf·proshop) 합 = 전체 매출은 그대로다(매장 하나는 한 부서에만 들어간다).
--  ③ dept_sales: 부서 값에 'proshop' 을 받는다(권한 = sales_proshop · settle · 관리자 — 192 판정 그대로). 본문 한 줄 치환(1번이어야 한다).
--  ④ data_audit dept_sales_check: 세 부서 합 → 네 부서 합(본문 한 줄 치환, 1번).
--  운영 데이터: 2026-11-26 지금 골프샵 청구(source='proshop') 0건 — 골프 매출 숫자는 바뀌지 않는다.
--
--  멱등. 되돌리기: sales_dept_of 의 proshop 을 golf 로 · 두 치환을 반대로 · area_tree 에서 sales_proshop 삭제.
-- ============================================================================

-- ── ⓪ 적용 전 확인 ─────────────────────────────────────────────────────────────
do $chk$
begin
  if to_regprocedure('public.dept_sales(text,date,date)') is null or to_regprocedure('public.sales_dept_of(text)') is null then
    raise exception '195: dept_sales·sales_dept_of 가 없다 — SQL 192 먼저';
  end if;
  if (select count(*) from public.area_tree) not in (40, 41) then
    raise exception '195: area_tree 가 % 행 — 194 재시드(40행) 뒤가 아니다', (select count(*) from public.area_tree);
  end if;
end $chk$;

-- ── ① 권한 트리 재시드(41행) ───────────────────────────────────────────────────
insert into public.area_tree(child, parent) values
  ('nametag','print'),('keyslip','print'),('aircover','print'),('dispatch','print'),('dinner','print'),('qrcards','print'),('transfer','print'),('notice','print'),
  ('frontdesk','front'),('inv_front','front'),
  ('room_assign','room'),('occupancy','room'),('staychart','room'),('roomstats','room'),('inv_room','room'),
  ('housekeeping','hk'),('inv_hk','hk'),
  ('course','golf'),('cart','golf'),('inv_golf','golf'),
  ('kds','kitchen'),('kds_front','kitchen'),('inv_fnb','kitchen'),
  ('pos_front','pos'),('pos_golf','pos'),('pos_restaurant','pos'),('pos_customer','pos'),
  ('settle_onsite','settle'),('settle_merit','settle'),('settle_report','settle'),
  ('stats_mgmt','stats'),('staycal','stats'),
  ('shizu_sheet','shizu'),('inv_shizu','shizu'),
  ('partner_kumamoto','partner'),('partner_trial','partner'),
  ('sales_fnb','sales'),('sales_front','sales'),('sales_golf','sales'),('sales_proshop','sales'),
  ('inv_proshop','proshop')
on conflict (child) do update set parent = excluded.parent;

-- ── ② 매장 → 부서 ─────────────────────────────────────────────────────────────
create or replace function public.sales_dept_of(p_source text) returns text
language sql immutable set search_path = public as $$
  select case
    when lower(coalesce(p_source, '')) in ('restaurant', 'banquet', 'bar') then 'fnb'
    when lower(coalesce(p_source, '')) = 'proshop'                         then 'proshop'
    when lower(coalesce(p_source, '')) = 'golf'                            then 'golf'
    else 'front'
  end;
$$;
revoke all on function public.sales_dept_of(text) from public, anon;
grant execute on function public.sales_dept_of(text) to authenticated;
comment on function public.sales_dept_of(text) is '192·195 — 청구 매장(charges.source) → 부서(fnb·golf·proshop·front). 네 부서 합 = 전체 매출.';

-- ── ③ dept_sales 가 골프샵을 받는다 ───────────────────────────────────────────
do $ds$
declare d text; n int;
  old_t text := $q$p_dept not in ('fnb', 'front', 'golf')$q$;
  new_t text := $q$p_dept not in ('fnb', 'front', 'golf', 'proshop')$q$;
begin
  d := pg_get_functiondef('public.dept_sales(text,date,date)'::regprocedure);
  if position(new_t in d) > 0 then raise notice '195 ③: 이미 바뀜'; return; end if;
  n := (length(d) - length(replace(d, old_t, ''))) / length(old_t);
  if n <> 1 then raise exception '195 ③: dept_sales 의 부서 검사가 %번 — 1번이어야 한다', n; end if;
  d := replace(d, old_t, new_t);
  d := replace(d, '부서는 fnb·front·golf 중 하나', '부서는 fnb·front·golf·proshop 중 하나');
  execute d;
  raise notice '195 ③: dept_sales 에 proshop';
end $ds$;

-- ── ④ data_audit 검산 = 네 부서 합 ────────────────────────────────────────────
do $au$
declare d text; n int;
  old_t text := $q$unnest(array['fnb','front','golf'])$q$;
  new_t text := $q$unnest(array['fnb','front','golf','proshop'])$q$;
begin
  if to_regprocedure('public.data_audit()') is null then raise notice '195 ④: data_audit 없음 — 건너뜀'; return; end if;
  d := pg_get_functiondef('public.data_audit()'::regprocedure);
  if position(new_t in d) > 0 then raise notice '195 ④: 이미 바뀜'; return; end if;
  n := (length(d) - length(replace(d, old_t, ''))) / length(old_t);
  if n <> 1 then raise exception '195 ④: data_audit 의 부서 목록이 %번 — 1번이어야 한다', n; end if;
  execute replace(d, old_t, new_t);
  raise notice '195 ④: data_audit dept_sales_check = 네 부서 합';
end $au$;

-- ── ⑤ 적용 뒤 확인 ─────────────────────────────────────────────────────────────
do $post$
begin
  if (select count(*) from public.area_tree) <> 41 or not exists (select 1 from public.area_tree where child = 'sales_proshop' and parent = 'sales') then
    raise exception '195: area_tree 가 41행(sales_proshop → sales)이 아니다';
  end if;
  if public.sales_dept_of('proshop') <> 'proshop' or public.sales_dept_of('golf') <> 'golf' or public.sales_dept_of('bar') <> 'fnb' or public.sales_dept_of(null) <> 'front' then
    raise exception '195: sales_dept_of 판정이 기대와 다르다';
  end if;
  if (select prosrc from pg_proc where oid = 'public.dept_sales(text,date,date)'::regprocedure) not like '%''proshop''%' then
    raise exception '195: dept_sales 가 proshop 을 받지 않는다';
  end if;
  if to_regprocedure('public.data_audit()') is not null
     and (select prosrc from pg_proc where oid = 'public.data_audit()'::regprocedure) not like '%''golf'',''proshop''%' then
    raise exception '195: data_audit 검산이 네 부서 합이 아니다';
  end if;
  if has_function_privilege('anon', 'public.dept_sales(text,date,date)', 'execute') then raise exception '195: anon 이 dept_sales 를 부를 수 있다'; end if;
end $post$;

notify pgrst, 'reload schema';
