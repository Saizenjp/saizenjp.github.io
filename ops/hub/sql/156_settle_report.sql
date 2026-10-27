-- ============================================================================
-- 156_settle_report.sql — 정산 보고서(일보·주보·월보·연보) + 일 마감(日次締め)  (Min 2026-10-27)
--  Min 「ops로 최종 정산까지 마무리하고 최종 정산된 화면까지 나오게 · 일마다 정산일보·주보·월보·연보」
-- ----------------------------------------------------------------------------
--  ① settle_day_close — 영업일(JST) 마감 표. 마감 시점의 일보 전체(settle_report 결과)를 payload 에 그대로 보관한다.
--     → 마감 뒤 청구·입금이 바뀌면 화면이 「마감 후 변경 있음」으로 보여 준다(조용히 숫자가 바뀌지 않는다).
--  ② settle_report(p_from, p_to) — 일별 집계 jsonb 한 번에(화면이 주=월~일·월·연으로 묶는다).
--     · 매출 = charges(voided 제외) 税込(amount+tax+service_charge), 날짜 = charged_at JST
--     · 입금 = payments(voided 제외) 현금/카드, 날짜 = paid_at JST
--     · 정산 완료 = folios.status='settled' 의 closed_at JST 날짜(건수·그 계산서 청구 합계)
--     · 미수 기말(ar_end) = 그날까지 누적 청구 − 누적 입금(전 기간) — 미래 날짜 청구(카트 사전 신청)는 그날이 오기 전엔 안 들어간다
--     · 체크인/체크아웃/재실 = bookings(대기 제외) · 워크인 = walkins(walk_date)
--     · 미정산 체크아웃 = 기간 안에 체크아웃(arr_date)인데 잔액≠0 또는 청구 있는 계산서가 settled 가 아닌 팀(워크인 포함)
--     · B2B 참고 = 現地精算表 식(인원=max(명단,예약)·박수=arr−dep·숙소 단가·송영 6,000) — 차감·가산 전, 월보/연보 참고용
--     읽기 권한 = admin 또는 settle 그룹(보기 포함: has_any_read_area). 400일 이내.
--  ③ settle_day_close(p_date,p_cash,p_note,p_by) / settle_day_reopen(p_date,p_by) — 쓰기 = admin 또는 settle 그룹. change_log(settle_close).
--  ④ area_tree 재시드(34행) — settle 자식 settle_report(정산 보고서 카드의 자기 체크표). settle_onsite 보유 계정에 승계.
--  ⑤ data_audit 검수 짝(§3-3): settle_check(이번 달 매출·입금·미수 기말 = 다른 모양 재계산) · settle_close_drift(마감 후 숫자가 바뀐 날, 60일)
--  ⚠ RPC 권한(§119): revoke from public + grant to authenticated. anon 실행 security definer 는 15개 그대로.
--  멱등. MCP apply_migration 2026-10-27.
-- ============================================================================

-- ── ① 일 마감 표 ────────────────────────────────────────────────────────────
create table if not exists public.settle_day_close (
  biz_date     date        primary key,
  closed_at    timestamptz not null default now(),
  closed_by    text,
  cash_counted integer,                       -- 현금 실사액(선택) — 장부 현금과의 차이를 화면이 보여 준다
  note         text,
  payload      jsonb       not null default '{}'::jsonb   -- 마감 시점 settle_report(biz_date,biz_date) 결과
);
alter table public.settle_day_close enable row level security;
drop policy if exists sdc_read  on public.settle_day_close;
create policy sdc_read  on public.settle_day_close for select to authenticated using (has_any_read_area(array['settle']));
drop policy if exists sdc_write on public.settle_day_close;
create policy sdc_write on public.settle_day_close for all to authenticated
  using (has_any_area(array['settle'])) with check (has_any_area(array['settle']));
revoke all on public.settle_day_close from anon;

-- ── ② 보고서 집계 RPC ───────────────────────────────────────────────────────
create or replace function public.settle_report(p_from date, p_to date)
returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  res jsonb;
begin
  if not (coalesce(is_admin(), false) or coalesce(has_any_read_area(array['settle']), false)) then
    raise exception '권한 없음(정산 보고서 — 관리자 또는 정산 영역)';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception '기간이 올바르지 않습니다';
  end if;
  if (p_to - p_from) > 400 then
    raise exception '기간은 400일 이내로 지정하세요';
  end if;

  with days as (
    select d::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  ),
  chg as (
    select (c.charged_at at time zone 'Asia/Tokyo')::date as d,
           coalesce(c.amount,0) as net, coalesce(c.tax,0) as tax,
           coalesce(c.amount,0)+coalesce(c.tax,0)+coalesce(c.service_charge,0) as gross,
           c.category, coalesce(nullif(c.source,''),'(기타)') as src, c.pay_method, c.folio_id, c.event_seq
    from charges c where coalesce(c.voided,false) = false
  ),
  pay as (
    select (p.paid_at at time zone 'Asia/Tokyo')::date as d, p.method, coalesce(p.amount,0) as amt, p.folio_id
    from payments p where coalesce(p.voided,false) = false
  ),
  chg_d as (
    select d, count(*) as n, sum(net) as net, sum(tax) as tax, sum(gross) as gross,
           coalesce(sum(gross) filter (where pay_method is null or pay_method = ''),0) as unset
    from chg where d between p_from and p_to group by d
  ),
  chg_dc as ( select d, category, sum(gross) as g from chg where d between p_from and p_to group by 1,2 ),
  cat_d  as ( select d, jsonb_object_agg(category, g) as by_cat from chg_dc group by d ),
  pay_d as (
    select d, count(*) as n, sum(amt) as total,
           coalesce(sum(amt) filter (where method = '현금'),0) as cash,
           coalesce(sum(amt) filter (where method = '카드'),0) as card
    from pay where d between p_from and p_to group by d
  ),
  fol_set as (
    select f.id, (f.closed_at at time zone 'Asia/Tokyo')::date as d,
           coalesce((select sum(x.gross) from chg x where x.folio_id = f.id),0) as gross
    from folios f where f.status = 'settled' and f.closed_at is not null
  ),
  set_d as ( select d, count(*) as n, sum(gross) as amount from fol_set where d between p_from and p_to group by d ),
  base as (
    select (select coalesce(sum(gross),0) from chg where d < p_from)
         - (select coalesce(sum(amt),0)   from pay where d < p_from) as ar0
  ),
  bk as (
    select event_seq, coalesce(pax,0) as pax, dep_date, arr_date, rep_name
    from bookings where coalesce(status,'') <> '대기'
  ),
  bk_d as (
    select dy.d,
      (select count(*)              from bk where bk.dep_date = dy.d)                        as ci_teams,
      (select coalesce(sum(pax),0)  from bk where bk.dep_date = dy.d)                        as ci_pax,
      (select count(*)              from bk where bk.arr_date = dy.d)                        as co_teams,
      (select coalesce(sum(pax),0)  from bk where bk.arr_date = dy.d)                        as co_pax,
      (select coalesce(sum(pax),0)  from bk where bk.dep_date <= dy.d and bk.arr_date > dy.d) as stay_pax,
      (select count(*)              from walkins w where w.walk_date = dy.d)                 as wk_teams,
      (select coalesce(sum(w.pax),0) from walkins w where w.walk_date = dy.d)                as wk_pax
    from days dy
  ),
  day_rows as (
    select dy.d,
      coalesce(c.n,0) as ch_n, coalesce(c.net,0) as ch_net, coalesce(c.tax,0) as ch_tax, coalesce(c.gross,0) as ch_gross, coalesce(c.unset,0) as ch_unset,
      coalesce(cc.by_cat,'{}'::jsonb) as by_cat,
      coalesce(p.n,0) as pay_n, coalesce(p.total,0) as pay_total, coalesce(p.cash,0) as pay_cash, coalesce(p.card,0) as pay_card,
      coalesce(s.n,0) as set_n, coalesce(s.amount,0) as set_amount,
      (select ar0 from base) + sum(coalesce(c.gross,0) - coalesce(p.total,0)) over (order by dy.d) as ar_end,
      b.ci_teams, b.ci_pax, b.co_teams, b.co_pax, b.stay_pax, b.wk_teams, b.wk_pax
    from days dy
    left join chg_d c  on c.d  = dy.d
    left join cat_d cc on cc.d = dy.d
    left join pay_d p  on p.d  = dy.d
    left join set_d s  on s.d  = dy.d
    left join bk_d  b  on b.d  = dy.d
  ),
  fol_bal as (
    select f.id, f.event_seq, f.status, f.session_ym,
           coalesce((select sum(x.gross) from chg x where x.folio_id = f.id),0) as gross,
           coalesce((select sum(y.amt)   from pay y where y.folio_id = f.id),0) as paid
    from folios f
  ),
  co_teams as (
    select b.event_seq, b.arr_date as co_date, b.rep_name, false as walkin from bk b where b.arr_date between p_from and p_to
    union all
    select w.event_seq, w.walk_date, coalesce(nullif(w.name,''),'ウォークイン'), true from walkins w where w.walk_date between p_from and p_to
  ),
  unsettled as (
    select t.event_seq, t.co_date, t.rep_name, t.walkin,
           coalesce(g.team_tag, g.group_code, '') as tag,
           sum(fb.gross) as gross, sum(fb.paid) as paid, sum(fb.gross - fb.paid) as balance,
           count(*) filter (where fb.status <> 'settled' and fb.gross > 0) as open_n,
           max(fb.session_ym) as ym
    from co_teams t
    join fol_bal fb on fb.event_seq = t.event_seq
    left join guests g on g.event_seq = t.event_seq
    group by t.event_seq, t.co_date, t.rep_name, t.walkin, g.team_tag, g.group_code
    having sum(fb.gross - fb.paid) <> 0 or count(*) filter (where fb.status <> 'settled' and fb.gross > 0) > 0
  ),
  b2b as (
    select count(*) as teams, coalesce(sum(px),0) as pax,
           coalesce(sum(px*nights*rate),0) as lodge, coalesce(sum(px*6000),0) as trans
    from (
      select greatest(coalesce(b.pax,0), (select count(*) from passengers p where p.event_seq = b.event_seq)) as px,
             greatest(b.arr_date - b.dep_date, 0) as nights,
             case when g.accom ilike '%쿠주%' or g.accom ilike '%久住%' or g.accom ilike '%구주%' then 14000
                  when g.accom ilike '%간지%' then 16000
                  when g.accom ilike '%시즈%' or g.accom ilike '%료칸%' then 16000
                  when g.accom is null or g.accom = '' then 0
                  else 14000 end as rate
      from bookings b left join guests g on g.event_seq = b.event_seq
      where b.dep_date between p_from and p_to and coalesce(b.status,'') <> '대기'
    ) x
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'today', v_today, 'days', (p_to - p_from) + 1),
    'days', (select coalesce(jsonb_agg(jsonb_build_object(
        'd', r.d, 'ch_n', r.ch_n, 'net', r.ch_net, 'tax', r.ch_tax, 'gross', r.ch_gross, 'unset', r.ch_unset, 'by_cat', r.by_cat,
        'pay_n', r.pay_n, 'pay', r.pay_total, 'cash', r.pay_cash, 'card', r.pay_card,
        'set_n', r.set_n, 'set_amount', r.set_amount, 'ar_end', r.ar_end,
        'ci_teams', r.ci_teams, 'ci_pax', r.ci_pax, 'co_teams', r.co_teams, 'co_pax', r.co_pax, 'stay_pax', r.stay_pax,
        'wk_teams', r.wk_teams, 'wk_pax', r.wk_pax,
        'closed', (select jsonb_build_object('closed_at', s.closed_at, 'closed_by', s.closed_by, 'cash_counted', s.cash_counted,
                                             'note', s.note, 'snap', s.payload->'totals')
                   from settle_day_close s where s.biz_date = r.d)
      ) order by r.d), '[]'::jsonb) from day_rows r),
    'totals', (select jsonb_build_object(
        'ch_n', coalesce(sum(ch_n),0), 'net', coalesce(sum(ch_net),0), 'tax', coalesce(sum(ch_tax),0), 'gross', coalesce(sum(ch_gross),0), 'unset', coalesce(sum(ch_unset),0),
        'pay_n', coalesce(sum(pay_n),0), 'pay', coalesce(sum(pay_total),0), 'cash', coalesce(sum(pay_cash),0), 'card', coalesce(sum(pay_card),0),
        'set_n', coalesce(sum(set_n),0), 'set_amount', coalesce(sum(set_amount),0),
        'ar_start', (select ar0 from base), 'ar_end', (select ar_end from day_rows order by d desc limit 1),
        'ci_teams', coalesce(sum(ci_teams),0), 'ci_pax', coalesce(sum(ci_pax),0), 'co_teams', coalesce(sum(co_teams),0), 'co_pax', coalesce(sum(co_pax),0),
        'wk_teams', coalesce(sum(wk_teams),0), 'wk_pax', coalesce(sum(wk_pax),0),
        'closed_days', (select count(*) from settle_day_close where biz_date between p_from and p_to),
        'past_days', (select count(*) from days where d <= v_today)
      ) from day_rows),
    'by_cat', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'n', n, 'net', net, 'tax', tax, 'gross', gross) order by gross desc), '[]'::jsonb)
               from (select category, count(*) n, sum(net) net, sum(tax) tax, sum(gross) gross from chg where d between p_from and p_to group by category) x),
    'by_source', (select coalesce(jsonb_agg(jsonb_build_object('source', src, 'n', n, 'gross', gross) order by gross desc), '[]'::jsonb)
               from (select src, count(*) n, sum(gross) gross from chg where d between p_from and p_to group by src) x),
    'unsettled', (select coalesce(jsonb_agg(jsonb_build_object('event_seq', event_seq, 'co_date', co_date, 'rep_name', rep_name, 'tag', tag, 'walkin', walkin,
                      'gross', gross, 'paid', paid, 'balance', balance, 'open_n', open_n, 'ym', ym) order by co_date desc, event_seq), '[]'::jsonb)
                  from (select * from unsettled order by co_date desc, event_seq limit 300) u),
    'b2b', (select jsonb_build_object('teams', teams, 'pax', pax, 'lodge', lodge, 'trans', trans, 'total', lodge + trans) from b2b)
  ) into res;
  return res;
end $$;
revoke execute on function public.settle_report(date, date) from public, anon;
grant  execute on function public.settle_report(date, date) to authenticated;

-- ── ③ 일 마감 / 마감 취소 ───────────────────────────────────────────────────
create or replace function public.settle_day_close(p_date date, p_cash integer default null, p_note text default null, p_by text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_by text; v_rep jsonb; v_row settle_day_close;
begin
  if not (coalesce(is_admin(), false) or coalesce(has_any_area(array['settle']), false)) then
    raise exception '권한 없음(정산 마감 — 관리자 또는 정산 영역)';
  end if;
  if p_date is null or p_date > v_today then
    raise exception '오늘(JST) 이후 날짜는 마감할 수 없습니다';
  end if;
  if exists (select 1 from settle_day_close where biz_date = p_date) then
    raise exception '이미 마감된 날입니다 — 마감 취소 뒤 다시 마감하세요';
  end if;
  v_by := coalesce(nullif(p_by,''),
                   nullif(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'name',''),
                   (select name from user_access where user_id = auth.uid()),
                   current_setting('request.jwt.claims', true)::jsonb->>'email');
  v_rep := settle_report(p_date, p_date);
  insert into settle_day_close(biz_date, closed_by, cash_counted, note, payload)
    values (p_date, v_by, p_cash, nullif(p_note,''), v_rep)
    returning * into v_row;
  insert into change_log(entity, entity_id, action, label, changes, changed_by)
    values ('settle_close', p_date::text, 'close', '정산 일 마감 ' || to_char(p_date, 'YYYY-MM-DD'),
            jsonb_build_object('totals', v_rep->'totals', 'cash_counted', p_cash, 'note', nullif(p_note,'')), v_by);
  return jsonb_build_object('ok', true, 'biz_date', v_row.biz_date, 'closed_at', v_row.closed_at, 'closed_by', v_row.closed_by,
                            'cash_counted', v_row.cash_counted, 'note', v_row.note, 'totals', v_rep->'totals');
end $$;
revoke execute on function public.settle_day_close(date, integer, text, text) from public, anon;
grant  execute on function public.settle_day_close(date, integer, text, text) to authenticated;

create or replace function public.settle_day_reopen(p_date date, p_by text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_by text; v_row settle_day_close;
begin
  if not (coalesce(is_admin(), false) or coalesce(has_any_area(array['settle']), false)) then
    raise exception '권한 없음(정산 마감 취소 — 관리자 또는 정산 영역)';
  end if;
  delete from settle_day_close where biz_date = p_date returning * into v_row;
  if not found then
    raise exception '마감된 날이 아닙니다';
  end if;
  v_by := coalesce(nullif(p_by,''),
                   nullif(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'name',''),
                   (select name from user_access where user_id = auth.uid()),
                   current_setting('request.jwt.claims', true)::jsonb->>'email');
  insert into change_log(entity, entity_id, action, label, changes, changed_by)
    values ('settle_close', p_date::text, 'reopen', '정산 일 마감 취소 ' || to_char(p_date, 'YYYY-MM-DD'),
            jsonb_build_object('closed_at', v_row.closed_at, 'closed_by', v_row.closed_by, 'totals', v_row.payload->'totals'), v_by);
  return jsonb_build_object('ok', true, 'biz_date', p_date);
end $$;
revoke execute on function public.settle_day_reopen(date, text) from public, anon;
grant  execute on function public.settle_day_reopen(date, text) to authenticated;

-- ── ④ area_tree 재시드(34행) — settle 자식 settle_report ─────────────────
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
  ('shizu_sheet','shizu'),('inv_shizu','shizu')
on conflict (child) do update set parent = excluded.parent;
delete from public.area_tree where child not in ('nametag','keyslip','aircover','dispatch','dinner','qrcards','transfer','notice','frontdesk','inv_front','room_assign','occupancy','staychart','roomstats','inv_room','housekeeping','inv_hk','course','cart','inv_golf','kds','kds_front','inv_fnb','pos_front','pos_golf','pos_restaurant','pos_customer','settle_onsite','settle_merit','settle_report','stats_mgmt','staycal','shizu_sheet','inv_shizu');

-- 기존 계정 승계: 현장 정산(settle_onsite) 보유 → 정산 보고서(settle_report) (수정은 수정·보기는 보기). settle 그룹 보유자는 area_expand 로 자동.
update public.user_access
   set areas = array_append(coalesce(areas,'{}'), 'settle_report')
 where 'settle_onsite' = any(coalesce(areas,'{}'))
   and not ('settle_report' = any(coalesce(areas,'{}')));
update public.user_access
   set read_areas = array_append(coalesce(read_areas,'{}'), 'settle_report')
 where 'settle_onsite' = any(coalesce(read_areas,'{}'))
   and not ('settle_report' = any(coalesce(read_areas,'{}')));

-- ── ⑤ data_audit 검수 짝 — settle_check · settle_close_drift ───────────────
--  data_audit() 본문은 Supabase 적용본이 정본. 아래 DO 블록은 적용본을 읽어 `return res;` 앞에 ⑳·㉑ 을 끼운다(이미 있으면 건너뜀) — 멱등.
do $do$
declare d text; blk text;
begin
  d := pg_get_functiondef('public.data_audit()'::regprocedure);
  if d like '%''settle_check''%' then raise notice 'data_audit: settle_check already present'; return; end if;
  blk := $blk$
  -- ⑳ 정산 보고서 검산 (156) — 보고서(JST 날짜 캐스팅 집계) vs 타임스탬프 경계로 다시 더한 값 · 미수 기말(오늘) = 계산서 잔액 합 − 아직 날짜가 안 된 청구
  declare
    v_sr jsonb; v_g1 numeric; v_g2 numeric; v_p1 numeric; v_p2 numeric; v_a1 numeric; v_a2 numeric; v_t0 timestamptz; v_t1 timestamptz;
  begin
    v_sr := settle_report(v_mf, v_today);
    v_g1 := coalesce((v_sr->'totals'->>'gross')::numeric, 0);
    v_p1 := coalesce((v_sr->'totals'->>'pay')::numeric, 0);
    v_a1 := coalesce((v_sr->'totals'->>'ar_end')::numeric, 0);
    v_t0 := (v_mf::timestamp at time zone 'Asia/Tokyo');
    v_t1 := ((v_today + 1)::timestamp at time zone 'Asia/Tokyo');
    v_g2 := (select coalesce(sum(amount + tax + service_charge), 0) from charges
              where not voided and charged_at >= v_t0 and charged_at < v_t1);
    v_p2 := (select coalesce(sum(amount), 0) from payments
              where not voided and paid_at >= v_t0 and paid_at < v_t1);
    v_a2 := (select coalesce(sum(balance), 0) from v_folio_balance)
          - (select coalesce(sum(amount + tax + service_charge), 0) from charges
              where not voided and charged_at >= v_t1);
    res := res || jsonb_build_object(
      'key','settle_check','sev','error',
      'count', (case when v_g1 <> v_g2 then 1 else 0 end) + (case when v_p1 <> v_p2 then 1 else 0 end) + (case when v_a1 <> v_a2 then 1 else 0 end),
      'samples', jsonb_build_array(
        jsonb_build_object('event_seq', 0, 'detail', '이번 달 매출(税込) 보고서 ' || v_g1 || ' / 재계산 ' || v_g2 || case when v_g1 = v_g2 then ' · 일치' else ' · 불일치' end),
        jsonb_build_object('event_seq', 0, 'detail', '이번 달 입금 보고서 ' || v_p1 || ' / 재계산 ' || v_p2 || case when v_p1 = v_p2 then ' · 일치' else ' · 불일치' end),
        jsonb_build_object('event_seq', 0, 'detail', '미수 기말(오늘) 보고서 ' || v_a1 || ' / 계산서 잔액−미래 청구 ' || v_a2 || case when v_a1 = v_a2 then ' · 일치' else ' · 불일치' end)));
  end;
  -- ㉑ 마감 후 변경 (156) — 최근 60일 마감일의 스냅샷(매출·입금)과 지금 재계산이 다른 날. 마감을 다시 하거나 사유를 메모에 남긴다.
  res := res || jsonb_build_object(
    'key','settle_close_drift','sev','warn',
    'count', (select count(*) from settle_day_close s
               where s.biz_date >= v_today - 60
                 and ( coalesce((s.payload->'totals'->>'gross')::numeric,0) <> coalesce((settle_report(s.biz_date, s.biz_date)->'totals'->>'gross')::numeric,0)
                    or coalesce((s.payload->'totals'->>'pay')::numeric,0)   <> coalesce((settle_report(s.biz_date, s.biz_date)->'totals'->>'pay')::numeric,0) )),
    'samples', (select coalesce(jsonb_agg(jsonb_build_object('event_seq', 0, 'detail',
                  s.biz_date || ' · 마감 매출 ' || coalesce(s.payload->'totals'->>'gross','0') || ' → 지금 ' || coalesce(settle_report(s.biz_date, s.biz_date)->'totals'->>'gross','0')
                  || ' / 입금 ' || coalesce(s.payload->'totals'->>'pay','0') || ' → ' || coalesce(settle_report(s.biz_date, s.biz_date)->'totals'->>'pay','0')) order by s.biz_date desc), '[]'::jsonb)
                from settle_day_close s
                where s.biz_date >= v_today - 60
                  and ( coalesce((s.payload->'totals'->>'gross')::numeric,0) <> coalesce((settle_report(s.biz_date, s.biz_date)->'totals'->>'gross')::numeric,0)
                     or coalesce((s.payload->'totals'->>'pay')::numeric,0)   <> coalesce((settle_report(s.biz_date, s.biz_date)->'totals'->>'pay')::numeric,0) )));
$blk$;
  d := replace(d, E'  return res;\nend $function$', blk || E'  return res;\nend $function$');
  execute d;
end $do$;
revoke execute on function public.data_audit() from public, anon;
grant  execute on function public.data_audit() to authenticated;

-- 확인
-- select count(*) from area_tree;                                         -- 34
-- select settle_report(current_date - 7, current_date);                   -- (admin 세션)
-- select proname from pg_proc where proname in ('settle_report','settle_day_close','settle_day_reopen');
