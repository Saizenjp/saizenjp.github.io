-- ============================================================================
--  192_dept_sales.sql — 부서별 매출(식음·프론트·골프) · 부서장 전용 권한
--  상태: 적용 전
-- ----------------------------------------------------------------------------
--  Min 2026-11-25 「매출도 부서장이 보게 해서」「별도 체크로 진행해」.
--  지금 매출은 정산 보고서(정산 권한자만)에서 매장별 한 줄 합계로만 보였다 → 부서별 세부 화면(sales.html).
--
--  ① 권한 트리에 부모 sales + 자식 sales_fnb · sales_front · sales_golf (39행 재시드).
--     권한 관리에서 부서장에게만 따로 체크한다(그 부서 화면 권한만으로는 매출을 못 본다 — 돈이 걸린 RPC 는 자식 키를 직접 본다).
--     정산(settle) 권한자와 관리자는 전 부서를 본다.
--  ② sales_dept_of(source) — 청구 원장(charges.source, 매장)을 부서로:
--       식음 fnb   = restaurant · banquet · bar
--       골프 golf  = golf(라운딩·카트·9홀) · proshop(골프샵)
--       프론트 front = 그 밖 전부(front · frontdesk(수기) · room · etc · 빈값 …) — 세 부서 합 = 전체 매출이 되게
--  ③ dept_sales(p_dept, p_from, p_to) — 그 부서·기간(JST 날짜, 400일 이내)의 매출:
--       금액 = 정산 보고서와 같은 「税込 합」(amount + tax + service_charge) · 취소(voided) 제외
--       total · by_day · by_source · by_cat · by_item(메뉴 코드 → 메뉴 이름, 없으면 품목 글에서 「×N」「(1/k)」 뗀 것) · by_team(상위 20)
--       · unsettled(계산서가 아직 정산 마감 전인 금액 — 체크아웃 전 미수)
--  ④ data_audit 「통계 검산」에 dept_sales_check — 이번 달(JST) 세 부서 dept_sales 합 = 청구 원장 직접 합(§3-3 두 번 계산).
--
--  멱등. 되돌리기: drop function dept_sales · sales_dept_of · area_tree 에서 sales_* 3행 삭제 · data_audit 은 이 블록 삭제.
-- ============================================================================

-- ── ⓪ 적용 전 확인 ─────────────────────────────────────────────────────────────
do $chk$
begin
  if to_regclass('public.charges') is null or to_regclass('public.area_tree') is null or to_regclass('public.folios') is null then
    raise exception '192: charges·area_tree·folios 가 없다';
  end if;
  if to_regprocedure('public.data_audit()') is null then
    raise exception '192: data_audit() 가 없다';
  end if;
  if (select count(*) from public.area_tree) not in (36, 39) then
    raise exception '192: area_tree 가 % 행 — 159 재시드(36행) 뒤가 아니다', (select count(*) from public.area_tree);
  end if;
end $chk$;

-- ── ① 권한 트리 재시드(39행) ───────────────────────────────────────────────────
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
  ('sales_fnb','sales'),('sales_front','sales'),('sales_golf','sales')
on conflict (child) do update set parent = excluded.parent;

-- ── ② 매장 → 부서 ─────────────────────────────────────────────────────────────
create or replace function public.sales_dept_of(p_source text) returns text
language sql immutable set search_path = public as $$
  select case
    when lower(coalesce(p_source, '')) in ('restaurant', 'banquet', 'bar') then 'fnb'
    when lower(coalesce(p_source, '')) in ('golf', 'proshop')              then 'golf'
    else 'front'
  end;
$$;
revoke all on function public.sales_dept_of(text) from public, anon;
grant execute on function public.sales_dept_of(text) to authenticated;
comment on function public.sales_dept_of(text) is '192 — 청구 매장(charges.source) → 부서(fnb·golf·front). 세 부서 합 = 전체 매출.';

-- ── ③ 부서별 매출 ─────────────────────────────────────────────────────────────
create or replace function public.dept_sales(p_dept text, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
begin
  if p_dept is null or p_dept not in ('fnb', 'front', 'golf') then
    raise exception '부서는 fnb·front·golf 중 하나' using errcode = '22023';
  end if;
  if not (coalesce(is_admin(), false) or coalesce(has_any_read_area(array['sales_' || p_dept, 'settle']), false)) then
    raise exception '권한 없음(부서별 매출 — 그 부서 매출 권한 · 정산 · 관리자)' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception '기간이 올바르지 않습니다' using errcode = '22023';
  end if;
  if (p_to - p_from) > 400 then
    raise exception '기간은 400일 이내로 지정하세요' using errcode = '22023';
  end if;

  with c as (
    select (c.charged_at at time zone 'Asia/Tokyo')::date as d,
           coalesce(c.amount,0) + coalesce(c.tax,0) + coalesce(c.service_charge,0) as gross,
           coalesce(c.qty,1) as qty,
           coalesce(nullif(c.source,''), '(기타)') as src,
           coalesce(nullif(c.category,''), '기타') as cat,
           c.event_seq, c.folio_id, c.link_ref,
           btrim(regexp_replace(regexp_replace(coalesce(c.description,''), '\s*\(1/[0-9]+\)\s*$', ''), '\s*×\s*[0-9.]+\s*$', '')) as dsc
    from charges c
    where coalesce(c.voided,false) = false
      and sales_dept_of(c.source) = p_dept
      and (c.charged_at at time zone 'Asia/Tokyo')::date between p_from and p_to
  ),
  ci as (
    select c.*,
           coalesce(nullif(m.name_ja,''), nullif(m.name_ko,''), nullif(c.dsc,''), '(품목 없음)') as item_ja,
           coalesce(nullif(m.name_ko,''), nullif(m.name_ja,''), nullif(c.dsc,''), '(품목 없음)') as item_ko
    from c
    left join menu_items m on c.link_ref like 'menu:%' and m.id::text = substring(c.link_ref from 6)
  )
  select jsonb_build_object(
    'dept', p_dept, 'from', p_from, 'to', p_to,
    'total', (select jsonb_build_object('n', count(*), 'gross', coalesce(sum(gross),0)) from ci),
    'unsettled', (select coalesce(sum(ci.gross),0) from ci left join folios f on f.id = ci.folio_id where coalesce(f.status,'') <> 'settled'),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n, 'gross', g) order by d), '[]'::jsonb)
                 from (select d, count(*) n, sum(gross) g from ci group by d) x),
    'by_source', (select coalesce(jsonb_agg(jsonb_build_object('source', src, 'n', n, 'gross', g) order by g desc), '[]'::jsonb)
                 from (select src, count(*) n, sum(gross) g from ci group by src) x),
    'by_cat', (select coalesce(jsonb_agg(jsonb_build_object('category', cat, 'n', n, 'gross', g) order by g desc), '[]'::jsonb)
                 from (select cat, count(*) n, sum(gross) g from ci group by cat) x),
    'by_item', (select coalesce(jsonb_agg(jsonb_build_object('ja', item_ja, 'ko', item_ko, 'qty', q, 'n', n, 'gross', g) order by g desc, item_ja), '[]'::jsonb)
                 from (select item_ja, item_ko, sum(qty) q, count(*) n, sum(gross) g from ci group by item_ja, item_ko order by sum(gross) desc, item_ja limit 50) x),
    'items_total', (select count(distinct (item_ja, item_ko)) from ci),
    'by_team', (select coalesce(jsonb_agg(jsonb_build_object('event_seq', x.event_seq, 'no', b.event_no, 'rep', b.rep_name,
                                                             'tag', coalesce(g.team_tag, g.group_code), 'n', x.n, 'gross', x.g) order by x.g desc), '[]'::jsonb)
                 from (select event_seq, count(*) n, sum(gross) g from ci where event_seq is not null group by event_seq order by sum(gross) desc limit 20) x
                 left join bookings b on b.event_seq = x.event_seq
                 left join guests g on g.event_seq = x.event_seq)
  ) into res;
  return res;
end $$;
revoke all on function public.dept_sales(text, date, date) from public, anon;
grant execute on function public.dept_sales(text, date, date) to authenticated;
comment on function public.dept_sales(text, date, date) is '192 — 부서별 매출(税込 합 · 취소 제외 · JST 날짜). 권한 = sales_<부서> · settle · 관리자.';

-- ── ④ data_audit 통계 검산 — 세 부서 합 = 청구 원장 직접 합(이번 달 JST) ─────────────────
do $au$
declare d text; anchor text := E'\n\n  -- ⑭ 무기명 자리가'; blk text; n int;
begin
  d := pg_get_functiondef('public.data_audit()'::regprocedure);
  if position('dept_sales_check' in d) > 0 then raise notice '192 ④: 이미 있다'; return; end if;
  n := (length(d) - length(replace(d, anchor, ''))) / length(anchor);
  if n <> 1 then raise exception '192 ④: data_audit 의 끼울 자리(⑭ 앞)가 %번 — 1번이어야 한다', n; end if;
  blk := E'\n\n  -- ⑬-2 부서별 매출 검산(192) — 세 부서 dept_sales 합 = 청구 원장 직접 합(이번 달 JST · 취소 제외)\n'
      || E'  res := res || (with m as (select date_trunc(''month'', (now() at time zone ''Asia/Tokyo''))::date as m1),\n'
      || E'      a as (select coalesce(sum(coalesce(c.amount,0)+coalesce(c.tax,0)+coalesce(c.service_charge,0)),0) as v from charges c, m\n'
      || E'             where not coalesce(c.voided,false) and (c.charged_at at time zone ''Asia/Tokyo'')::date between m.m1 and (m.m1 + interval ''1 month - 1 day'')::date),\n'
      || E'      b as (select coalesce(sum((dept_sales(x, m.m1, (m.m1 + interval ''1 month - 1 day'')::date)->''total''->>''gross'')::numeric),0) as v\n'
      || E'             from m, unnest(array[''fnb'',''front'',''golf'']) x)\n'
      || E'    select jsonb_build_object(''key'',''dept_sales_check'',''sev'',''error'',\n'
      || E'      ''count'', case when a.v = b.v then 0 else 1 end,\n'
      || E'      ''samples'', jsonb_build_array(jsonb_build_object(''event_seq'',0,''detail'',\n'
      || E'        to_char(m.m1,''YYYY-MM'')||'' · 원장 ¥''||to_char(a.v,''FM999,999,999'')||'' / 부서 합 ¥''||to_char(b.v,''FM999,999,999'')||'' · ''||case when a.v=b.v then ''일치'' else ''불일치'' end)))\n'
      || E'    from m, a, b);';
  d := replace(d, anchor, blk || anchor);
  execute d;
  raise notice '192 ④: data_audit 에 dept_sales_check';
end $au$;

-- ── ⑤ 적용 뒤 확인 ─────────────────────────────────────────────────────────────
do $post$
begin
  if (select count(*) from public.area_tree) <> 39 or (select count(*) from public.area_tree where parent = 'sales') <> 3 then
    raise exception '192: area_tree 가 39행(sales 자식 3)이 아니다';
  end if;
  if to_regprocedure('public.dept_sales(text,date,date)') is null then raise exception '192: dept_sales 가 없다'; end if;
  if has_function_privilege('anon', 'public.dept_sales(text,date,date)', 'execute') then raise exception '192: anon 이 dept_sales 를 부를 수 있다'; end if;
  if (select prosrc from pg_proc where oid = 'public.data_audit()'::regprocedure) not like '%dept_sales_check%' then
    raise exception '192: data_audit 에 dept_sales_check 가 없다';
  end if;
end $post$;

notify pgrst, 'reload schema';
