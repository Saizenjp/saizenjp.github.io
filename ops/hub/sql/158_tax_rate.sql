-- ============================================================================
-- 158_tax_rate.sql — 세율 구분(10% / 8% 軽減 / 非課税 / 不課税) + 소비세 단수처리 = 버림(切り捨て)
--                   (P1, docs/06 정산 보강 2026-10-27 · Min 결정 D1=버림 · D2=8% 품목은 현장이 메뉴 관리에서 지정)
-- ----------------------------------------------------------------------------
--  규칙(명세 §P1 계산 규칙):
--   · 단가는 지금처럼 税込(内税).
--   · 세액은 **청구서(folio) 단위·세율별로 1회 단수처리**(적격청구서 요건) = floor(세율별 税込合計 × rate ÷ (100+rate)).
--     행별 세액(charges.tax)은 참고값(행별 추정)으로만 남긴다 — 표시·출력은 세율별 집계값.
--   · 단수처리 = **버림(切り捨て)**(D1). 음수(환불·조정)는 0 방향으로 버림(절대값 버림·부호 유지) — 返還分도 같은 식.
--  이 파일이 하는 일:
--   ① tax_included(税込, 세율%) 를 버림으로 교체(157 의 四捨五入 → 切り捨て). JS SZCore.taxIncluded 와 같은 값(정수 전수 테스트).
--   ② menu_items.tax_rate(10/8/0, 기본 10)·tax_class(taxable/exempt/outside, 기본 taxable) + 조합 check.
--   ③ charges.tax_rate·tax_class — 청구 시점 복사 저장(기존 행은 10·taxable 로 채움) + 조합 check.
--   ④ 세액을 만드는 트리거·RPC 4종(cart_sync_charge 100/116 · dinner_addon_sync_charge 58 · single_charge_sync_charge 59 · golf_add_charge 146)의
--      식을 tax_included() 로 교체(적용본을 읽어 식만 바꿈 — 다른 본문 불변). 값 변화 = 四捨五入→버림(1엔 이내).
--   ⑤ 뷰 v_settlement_by_rate(session_ym × 세율·구분 — 세액은 folio·세율별 1회 버림의 합) security_invoker.
--   ⑥ settle_report() 재정의 — by_rate(세율별 税込·세액·税抜) + 일별 세액을 「folio·세율 누적액의 세액 차분」으로(기간 합 = 청구서 세액 합) + by_cat 는 税込만.
--   ⑦ data_audit 검수 짝 tax_rate_check(§3-3) — 이번 달 세율별 세액을 다른 모양의 쿼리로 재계산 대조 + 조합 위반 0.
--  하지 않는 일: 기존 charges 의 amount·tax 재계산 없음(참고값·불변) · 정산 기록 삭제 없음(§0.4) · RLS 정책 변경 없음(새 컬럼은 같은 행 정책).
--  멱등. Min 승인(2026-10-27 「sql 158 적용해」「지금 실행해」) 뒤 MCP execute_sql 로 적용 완료 — MCP 실행 확인 질문이 2회 무응답 시간 초과(230초)된 뒤 3회차에 승인되어 적용.
--  적용 확인(2026-10-27): tax_included 90/80/−90/0 · 컬럼 4 · 트리거·RPC 4개 tax_included 사용 · v_settlement_by_rate(security_invoker, anon 불가) · settle_report by_rate ·
--  data_audit tax_rate_check=0(이번 달 10% 세액 보고서=재계산 일치) · settle_check 0 · 기존 charges·menu_items 전 행 10·taxable 백필 · anon secdef 15 유지. 00_VERIFY 157(90)·158.
-- ============================================================================

-- ── ① 소비세(内税) 공통 함수 — 버림(切り捨て). 정수 나눗셈은 0 방향 버림이라 음수도 부호만 바뀐다 ───────────
create or replace function public.tax_included(p_gross integer, p_rate integer default 10)
returns integer
language sql immutable strict as $$
  select case when p_rate <= 0 then 0
              else ((p_gross::bigint * p_rate) / (100 + p_rate))::integer end;
$$;
comment on function public.tax_included(integer, integer) is
  '税込 금액에 포함된 소비세(内税) — 버림(切り捨て, D1 2026-10-27). JS SZCore.taxIncluded 와 동일. rate 0 → 0(非課税·不課税).';
revoke all on function public.tax_included(integer, integer) from public;
grant execute on function public.tax_included(integer, integer) to authenticated, anon;

-- ── ② menu_items 세율·구분 ──────────────────────────────────────────────────
alter table public.menu_items add column if not exists tax_rate  smallint not null default 10;
alter table public.menu_items add column if not exists tax_class text     not null default 'taxable';
alter table public.menu_items drop constraint if exists menu_items_tax_combo_chk;
alter table public.menu_items add  constraint menu_items_tax_combo_chk
  check ( (tax_class = 'taxable' and tax_rate in (10, 8))
       or (tax_class in ('exempt','outside') and tax_rate = 0) );
comment on column public.menu_items.tax_rate  is '소비세율 %: 10 / 8(軽減) / 0(非課税·不課税). 기본 10. 8% 품목은 현장이 지정(D2).';
comment on column public.menu_items.tax_class is 'taxable(課税) / exempt(非課税) / outside(不課税: ゴルフ場利用税·入湯税 등 立替·預り). 0% 는 둘 중 하나.';

-- ── ③ charges 세율·구분(청구 시점 복사 저장 — 메뉴 세율이 뒤에 바뀌어도 과거 청구 불변) ───────────────────
alter table public.charges add column if not exists tax_rate  smallint not null default 10;
alter table public.charges add column if not exists tax_class text     not null default 'taxable';
update public.charges set tax_rate = 10 where tax_rate is null;             -- not null default 라 보통 0행
update public.charges set tax_class = 'taxable' where tax_class is null;
alter table public.charges drop constraint if exists charges_tax_combo_chk;
alter table public.charges add  constraint charges_tax_combo_chk
  check ( (tax_class = 'taxable' and tax_rate in (10, 8))
       or (tax_class in ('exempt','outside') and tax_rate = 0) );
comment on column public.charges.tax_rate  is '청구 시점 세율 %(10/8/0). 세액 표시·출력은 folio·세율별 1회 버림 집계(행 tax 는 참고값).';
comment on column public.charges.tax_class is 'taxable / exempt / outside — 청구 시점 복사. outside(不課税)는 청구서에서 「(不課税)」 별도 줄.';

-- ── ④ 세액 식 교체 — 적용본(pg_get_functiondef)을 읽어 식만 바꾼다(멱등: 이미 tax_included 면 건너뜀) ─────────
do $do$
declare
  v_name text; v_def text; v_new text;
begin
  -- 트리거 3종: v_net := round(v_gross / 1.1); v_tax := v_gross - v_net;  →  tax_included 기반
  foreach v_name in array array['cart_sync_charge','dinner_addon_sync_charge','single_charge_sync_charge'] loop
    v_def := pg_get_functiondef(('public.'||v_name||'()')::regprocedure);
    if v_def like '%tax_included(%' then
      raise notice '% already uses tax_included', v_name; continue;
    end if;
    v_new := regexp_replace(v_def,
      'v_net\s+:=\s*round\(v_gross\s*/\s*1\.1\);\s*v_tax\s+:=\s*v_gross\s*-\s*v_net;',
      E'v_tax   := tax_included(v_gross::integer, 10);   -- 158: 소비세 공통 함수(버림)\n  v_net   := v_gross - v_tax;');
    if v_new = v_def then raise exception '% — 세액 식을 찾지 못했다(본문이 달라졌다). 수동 확인 필요', v_name; end if;
    -- insert ... values 의 tax 다음에 세율·구분을 명시하지 않는다 — 컬럼 default(10·taxable)가 같은 뜻이고 본문을 덜 건드린다.
    execute v_new;
    raise notice '% — tax formula replaced', v_name;
  end loop;

  -- RPC golf_add_charge(146): v_tax := round(v_gross - v_gross / 1.1);
  v_def := pg_get_functiondef('public.golf_add_charge(bigint, text, integer, integer, text)'::regprocedure);
  if v_def like '%tax_included(%' then
    raise notice 'golf_add_charge already uses tax_included';
  else
    v_new := regexp_replace(v_def,
      'v_tax\s*:=\s*round\(v_gross\s*-\s*v_gross\s*/\s*1\.1\);',
      'v_tax := tax_included(v_gross, 10);   -- 158: 소비세 공통 함수(버림)');
    if v_new = v_def then raise exception 'golf_add_charge — 세액 식을 찾지 못했다. 수동 확인 필요'; end if;
    execute v_new;
    raise notice 'golf_add_charge — tax formula replaced';
  end if;
end $do$;
-- create or replace 는 기존 권한을 그대로 둔다(139 교훈) — 그래도 명시 회수·부여(변동 없음 확인용)
revoke execute on function public.golf_add_charge(bigint, text, integer, integer, text) from public, anon;
grant  execute on function public.golf_add_charge(bigint, text, integer, integer, text) to authenticated;
revoke execute on function public.cart_sync_charge()          from public, anon, authenticated;
revoke execute on function public.dinner_addon_sync_charge()  from public, anon, authenticated;
revoke execute on function public.single_charge_sync_charge() from public, anon, authenticated;

-- ── ⑤ 세율별 매출 요약 뷰 — 세액 = folio·세율별 1회 버림의 합(적격청구서와 같은 값) ───────────────────────
drop view if exists public.v_settlement_by_rate;
create view public.v_settlement_by_rate with (security_invoker = on) as
with fr as (
  select f.session_ym, c.folio_id,
         coalesce(c.tax_class,'taxable') as tax_class,
         case when coalesce(c.tax_class,'taxable') = 'taxable' then coalesce(c.tax_rate,10) else 0 end as tax_rate,
         count(*) as line_count,
         sum(coalesce(c.amount,0) + coalesce(c.tax,0) + coalesce(c.service_charge,0))::integer as gross
  from charges c
  join folios f on f.id = c.folio_id
  where not coalesce(c.voided,false)
  group by f.session_ym, c.folio_id, 3, 4
)
select session_ym, tax_class, tax_rate,
       sum(line_count)::bigint                                    as line_count,
       count(*)::bigint                                           as folio_count,
       sum(gross)::bigint                                         as gross_total,
       sum(tax_included(gross, tax_rate))::bigint                 as tax_amount,
       (sum(gross) - sum(tax_included(gross, tax_rate)))::bigint  as charge_amount
from fr
group by session_ym, tax_class, tax_rate;
comment on view public.v_settlement_by_rate is '월(session_ym)×세율·구분 매출 — 세액은 계산서(folio)·세율별 1회 버림의 합(158). 읽기 = 기반 테이블 RLS(security_invoker).';
revoke all on public.v_settlement_by_rate from public, anon;
grant select on public.v_settlement_by_rate to authenticated;

-- ── ⑥ settle_report 재정의(156 → 158) — by_rate 추가 · 일별 세액 = folio·세율 누적 세액의 차분 · by_cat 는 税込 ──
--  일별 세액을 행 세액 합으로 두면 월 합계가 청구서 세액 합과 몇 엔씩 어긋난다. 그래서 (folio, 세율)마다 그날까지의 누적 税込에 대한
--  세액(1회 버림)을 구해 **전날 누적 세액과의 차분**을 그날 세액으로 둔다 → 어느 기간을 더해도 「기간 끝 누적 세액 − 기간 앞 누적 세액」
--  = 그 안에 다 들어온 계산서는 청구서 세액 그대로. net = gross − tax.
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
           coalesce(c.amount,0)+coalesce(c.tax,0)+coalesce(c.service_charge,0) as gross,
           c.category, coalesce(nullif(c.source,''),'(기타)') as src, c.pay_method, c.folio_id, c.event_seq,
           coalesce(c.tax_class,'taxable') as cls,
           case when coalesce(c.tax_class,'taxable') = 'taxable' then coalesce(c.tax_rate,10) else 0 end as rate
    from charges c where coalesce(c.voided,false) = false
  ),
  pay as (
    select (p.paid_at at time zone 'Asia/Tokyo')::date as d, p.method, coalesce(p.amount,0) as amt, p.folio_id
    from payments p where coalesce(p.voided,false) = false
  ),
  -- (folio, 구분, 세율, 날짜) 누적 税込 → 누적 세액(1회 버림) → 전날과의 차분 = 그날 세액
  fr_day as ( select folio_id, cls, rate, d, sum(gross)::integer as g from chg group by 1,2,3,4 ),
  fr_cum as (
    select folio_id, cls, rate, d, g,
           tax_included((sum(g) over (partition by folio_id, cls, rate order by d))::integer, rate) as tax_cum
    from fr_day ),
  fr_tax as (
    select folio_id, cls, rate, d, g,
           tax_cum - coalesce(lag(tax_cum) over (partition by folio_id, cls, rate order by d), 0) as tax_d
    from fr_cum ),
  tax_d as ( select d, sum(tax_d) as tax from fr_tax where d between p_from and p_to group by d ),
  chg_d as (
    select d, count(*) as n, sum(gross) as gross,
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
      coalesce(c.n,0) as ch_n, coalesce(c.gross,0) - coalesce(tx.tax,0) as ch_net, coalesce(tx.tax,0) as ch_tax, coalesce(c.gross,0) as ch_gross, coalesce(c.unset,0) as ch_unset,
      coalesce(cc.by_cat,'{}'::jsonb) as by_cat,
      coalesce(p.n,0) as pay_n, coalesce(p.total,0) as pay_total, coalesce(p.cash,0) as pay_cash, coalesce(p.card,0) as pay_card,
      coalesce(s.n,0) as set_n, coalesce(s.amount,0) as set_amount,
      (select ar0 from base) + sum(coalesce(c.gross,0) - coalesce(p.total,0)) over (order by dy.d) as ar_end,
      b.ci_teams, b.ci_pax, b.co_teams, b.co_pax, b.stay_pax, b.wk_teams, b.wk_pax
    from days dy
    left join chg_d c  on c.d  = dy.d
    left join tax_d tx on tx.d = dy.d
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
  ),
  by_rate as (
    select t.cls, t.rate,
           (select count(*) from chg c where c.d between p_from and p_to and c.cls = t.cls and c.rate = t.rate) as n,
           sum(t.g) as gross, sum(t.tax_d) as tax
    from fr_tax t where t.d between p_from and p_to
    group by t.cls, t.rate
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'today', v_today, 'days', (p_to - p_from) + 1),
    'tax', jsonb_build_object('rounding', 'floor', 'unit', 'folio_rate', 'sql', 158),
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
    'by_cat', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'n', n, 'gross', gross) order by gross desc), '[]'::jsonb)
               from (select category, count(*) n, sum(gross) gross from chg where d between p_from and p_to group by category) x),
    'by_rate', (select coalesce(jsonb_agg(jsonb_build_object('cls', cls, 'rate', rate, 'n', n, 'gross', gross, 'tax', tax, 'net', gross - tax)
                          order by (case cls when 'taxable' then 0 when 'exempt' then 1 else 2 end), rate desc), '[]'::jsonb)
                from by_rate),
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

-- ── ⑦ data_audit 검수 짝 — tax_rate_check(§3-3) ────────────────────────────────
--  보고서 by_rate 세액(누적 차분식) vs 「folio·세율별 월말 누적 세액 − 월초 전 누적 세액」을 직접 더한 값(다른 모양) · 조합 위반(check 가 막지만 0 확인).
do $do$
declare d text; blk text;
begin
  d := pg_get_functiondef('public.data_audit()'::regprocedure);
  if d like '%''tax_rate_check''%' then raise notice 'data_audit: tax_rate_check already present'; return; end if;
  blk := $blk$
  -- ㉒ 세율별 세액 검산 (158) — 보고서 by_rate(누적 차분) vs folio·세율별 [월말 누적 세액 − 월초 전 누적 세액] 직접 합. 1엔이라도 다르면 불일치.
  declare
    v_tr jsonb; v_bad int := 0; v_det jsonb := '[]'::jsonb; r record; v_t1 numeric; v_t2 numeric;
  begin
    v_tr := settle_report(v_mf, v_today);
    for r in
      with chg as (
        select (c.charged_at at time zone 'Asia/Tokyo')::date as d, c.folio_id,
               coalesce(c.amount,0)+coalesce(c.tax,0)+coalesce(c.service_charge,0) as gross,
               coalesce(c.tax_class,'taxable') as cls,
               case when coalesce(c.tax_class,'taxable')='taxable' then coalesce(c.tax_rate,10) else 0 end as rate
        from charges c where not coalesce(c.voided,false)),
      fr as (
        select folio_id, cls, rate,
               tax_included(coalesce(sum(gross) filter (where d <= v_today),0)::integer, rate)
             - tax_included(coalesce(sum(gross) filter (where d <  v_mf),0)::integer, rate) as tax
        from chg where d <= v_today group by folio_id, cls, rate)
      select cls, rate, sum(tax) as tax from fr group by cls, rate
    loop
      v_t2 := coalesce(r.tax, 0);
      v_t1 := coalesce((select (x->>'tax')::numeric from jsonb_array_elements(v_tr->'by_rate') x
                         where x->>'cls' = r.cls and (x->>'rate')::int = r.rate), 0);
      if v_t1 <> v_t2 then v_bad := v_bad + 1; end if;
      v_det := v_det || jsonb_build_object('event_seq', 0, 'detail',
        '이번 달 ' || r.cls || ' ' || r.rate || '% 세액 보고서 ' || v_t1 || ' / 재계산 ' || v_t2 || case when v_t1 = v_t2 then ' · 일치' else ' · 불일치' end);
    end loop;
    v_bad := v_bad + (select count(*) from charges
                       where not ((tax_class = 'taxable' and tax_rate in (10,8)) or (tax_class in ('exempt','outside') and tax_rate = 0)));
    if (select count(*) from charges where not ((tax_class = 'taxable' and tax_rate in (10,8)) or (tax_class in ('exempt','outside') and tax_rate = 0))) > 0 then
      v_det := v_det || jsonb_build_object('event_seq', 0, 'detail', '세율·구분 조합 위반 행 있음');
    end if;
    res := res || jsonb_build_object('key','tax_rate_check','sev','error','count', v_bad, 'samples', v_det);
  end;
$blk$;
  d := replace(d, E'  return res;\nend $function$', blk || E'  return res;\nend $function$');
  execute d;
end $do$;
revoke execute on function public.data_audit() from public, anon;
grant  execute on function public.data_audit() to authenticated;

-- ── 적용 확인(00_VERIFY 158) ────────────────────────────────────────────────
--  select tax_included(1000,10), tax_included(1080,8), tax_included(-1000,10);        -- 90 · 80 · -90
--  select column_name from information_schema.columns where table_name in ('menu_items','charges') and column_name in ('tax_rate','tax_class');
--  select proname from pg_proc where proname in ('cart_sync_charge','dinner_addon_sync_charge','single_charge_sync_charge','golf_add_charge') and prosrc like '%tax_included(%';
--  select * from v_settlement_by_rate order by session_ym desc limit 10;
--  select jsonb_pretty(settle_report(current_date, current_date)->'by_rate');
