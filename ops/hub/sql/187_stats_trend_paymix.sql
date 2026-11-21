-- ============================================================================
--  187_stats_trend_paymix.sql — 예약 추이 「지금」을 기준 기록과 같은 범위로 · 경영 통계 현금/카드를 실제 입금 기준으로
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  순서: 09(payments)·126(booking_snapshots·booking_trend)·53/130/131(exec_stats)·138·174(② 「보기」 권한 줄)·156/158/160/161(data_audit 블록) 이후.
--  멱등: 다시 실행하면 「already applied」 알림만 남기고 아무것도 바꾸지 않는다.
--
--  왜
--   ① 예약 추이(booking_trend, 126)
--      비교 기준(스냅샷 take_booking_snapshot)은 「찍은 날의 지난달 1일 이후 출발」을 찍는다.
--      「지금」(now_m)은 `b.dep_date >= date_trunc('month', d0)::date`, 곧 이번 달부터만 센다.
--      그래서 월별 표에 기준에만 있는 지난달이 「지금 0팀 · −전체」로 나왔다.
--      22차(2026-11-12)에는 화면(stats.html)이 오늘 달부터만 그리도록 막아 두었다.
--      권장안(docs/audit-2026-11.md §2-2 1번)은 지난달까지 실제로 비교하는 것이다.
--   ② 경영 통계(exec_stats, 53)의 현금/카드
--      charges.pay_method(정산 화면에서 줄마다 미리 고르는 값, 50)로 나눈다(chg_m 의 filter(where pay_method=…)).
--      POS·프론트 데스크 당일 손님 결제와 금액 기준 부분 결제는 payments 에만 수단을 남긴다.
--      그 돈은 「미지정」으로 잡히고, 실제로 받은 수단과 다르게 나온다.
--      정산 보고서(settle_report, 156)는 이미 payments 로 나눈다 → 두 화면의 현금/카드가 서로 다르다.
--
--  무엇을(운영 본문 글자 치환 — 174·177 의 꼴. 대상 글자가 정확히 1번이 아니면 아무것도 바꾸지 않고 멈춘다)
--   ① booking_trend: now_m 의 범위 식 한 곳
--        b.dep_date >= date_trunc('month', d0)::date
--      → b.dep_date >= (date_trunc('month', coalesce(<비교 기준일 = d1 이하 가장 가까운 스냅샷 날짜>, d0)) - interval '1 month')::date
--      비교 기준일의 범위(take_booking_snapshot 규칙)와 같다. 스냅샷이 아직 없으면 오늘의 지난달 1일부터 센다.
--      그래서 「지금」과 「이전」이 같은 달 집합을 갖고, 지난달 행에도 실제 팀·인원이 나온다.
--      30일 비교처럼 기준일이 지난달에 있으면 지지난달까지 같은 범위로 센다.
--      take_booking_snapshot 의 범위 식이 저장소(126)와 같은지도 먼저 본다(다르면 멈춘다 — 맞출 범위가 다르다).
--   ② exec_stats: 현금·카드·미입금(cash·card·unset)을 payments 기준으로. 결과 열쇠는 그대로다.
--      cash·card = 그 기간 입금(payments)의 수단별 합계(취소 제외, 입금일은 JST 기준)
--      unset     = 청구(onsite) − 현금·카드 입금. 0 미만이면 0(화면 이름 「미입금」).
--                  월별 줄(months_j)은 그 달끼리 빼고, 기간 합계(totals)는 기간 전체로 다시 뺀다.
--                  월별 값을 더하면 달을 넘긴 체크아웃(31일 청구·1일 입금)이 한 달은 미입금, 다음 달은 0 으로 깎여
--                  합계가 부푼다(올해·최근 12개월 보기).
--      payments.method 는 check('현금','카드')(09) — 현금+카드 = 입금 전체. 검수 짝이 이 전제를 본다.
--      새 CTE pay_m 은 chg_m 앞에 넣는다. 그 밖의 치환:
--        months 에 pay_m 의 달을 더한다(청구가 없는 달에 받은 입금도 빠지지 않게) ·
--        months_j 에 left join pay_m · months_j 의 cash·card·unset 세 식 · totals 의 unset 식.
--      totals 의 cash·card 는 months_j 를 더하는 식(53)인지 확인만 한다(아니면 멈춘다).
--      chg_m 안의 pay_method 집계 열은 남는다. 이제 아무 데서도 읽지 않는다(지우는 치환은 하지 않는다).
--   ③ data_audit 검수 짝 pay_mix_check(§3-3, 156·158 의 꼴): `return res;` 앞에 블록 하나를 넣는다.
--      이번 달 exec_stats(v_mf, v_today) 의 현금·카드·미입금을, charges·payments 를 시각 경계(JST 0시)로 직접 더한 값과 견준다.
--      현금+카드가 이번 달 입금 전체와 같은지도 본다. 현금·카드 밖의 수단이 생기면 어긋난다.
--      exec_stats 호출이 실패하면 그 사유를 count 1 로 낸다(검수 전체를 멈추지 않는다).
--
--  바꾸지 않는 것
--   두 함수의 권한 확인(138 의 `&& array['stats','stats_mgmt']` · 174 의 read_areas 줄)과 나머지 집계 ·
--   결과 jsonb 의 열쇠 · security definer·search_path·변동성 · 실행 권한(로그인 전용) · take_booking_snapshot ·
--   스냅샷 표·cron · data_audit 의 다른 항목.
--   새 함수가 없어, anon 이 실행할 수 있는 security definer 함수는 15개 그대로다.
--
--  운영 본문(2026-11-21, 읽기 전용 조회 — BRIEF11)
--   booking_trend: 4067자 · md5(prosrc) 6bef64e9…(126 + 138 치환 + 174 ② 치환, 주석 빠짐). 저장소 글자로는 다시 맞추지 못했다
--     (126 에서 주석을 지우고 두 치환을 넣으면 4073자 — 6자가 다르다). 대상 글자 `b.dep_date >= date_trunc('month', d0)::date`
--     는 한 줄 안의 글자라 공백 차이에 영향받지 않는다. 실제로 1번인지는 적용하는 쪽이 운영에서 확인한다(아니면 멈춘다).
--   exec_stats: 6145자 · md5(prosrc) 88cd8dd7…. 저장소에 전문이 없다(53 + 130·131 은 바뀐 블록만 · 138 · 174).
--     대상 글자 7개와 확인 글자 2개는 모두 53 의 한 줄 안 글자다. 적용하는 쪽이 운영에서 각 1번인지 확인한다
--     (예: select (length(prosrc)-length(replace(prosrc,'coalesce(c.cash,0) cash','')))/length('coalesce(c.cash,0) cash') …).
--   data_audit: 32965자 — 끝 `  return res;\nend $function$` 가 1번인지 이 파일이 확인한다.
--
--  ⚠ 화면 짝: stats.html 은 22차의 「오늘 달부터만」 거름을 되돌리고 현금/카드를 「입금(현금 / 카드)」「미입금」으로 부른다.
--    이 SQL 을 먼저 적용하고 화면을 배포한다. 거꾸로 하면 그사이 지난달 「지금 0팀」 행이 다시 보이고,
--    이름은 입금인데 숫자는 지정값인 상태가 된다(둘 다 표시만의 문제다).
--
--  되돌리는 법: 맨 아래 주석의 「되돌리기」 do 블록을 주석을 풀어 한 번 실행한다(같은 치환을 거꾸로 하고, 넣은 검수 블록을 뺀다).
--  확인: 00_VERIFY 187 행(3줄).
-- ============================================================================

-- ── ① booking_trend — 「지금」을 비교 기준(스냅샷)과 같은 범위로 ─────────────────────
do $mig$
declare
  c_old  constant text := $q$b.dep_date >= date_trunc('month', d0)::date$q$;
  c_new  constant text := $q$b.dep_date >= (date_trunc('month', coalesce((select max(s0.snap_date) from booking_snapshots s0 where s0.snap_date <= d1), d0)) - interval '1 month')::date$q$;
  c_snap constant text := $q$(date_trunc('month', d) - interval '1 month')::date$q$;
  v_fn regprocedure := to_regprocedure('public.booking_trend(text,integer)');
  v_sn regprocedure := to_regprocedure('public.take_booking_snapshot(date)');
  d text; n int;
begin
  if v_fn is null or v_sn is null then
    raise exception '187 ①: booking_trend(text,integer)·take_booking_snapshot(date) 가 없다 — 126 먼저';
  end if;
  select p.prosrc into d from pg_proc p where p.oid = v_sn::oid;
  n := (length(d) - length(replace(d, c_snap, ''))) / length(c_snap);
  if n <> 1 then
    raise exception '187 ①: take_booking_snapshot 의 범위 식(찍은 날의 지난달 1일부터)이 %번 — 1번이어야 한다(「지금」을 맞출 범위가 다르다) — 운영 본문 확인', n;
  end if;

  d := pg_get_functiondef(v_fn::oid);
  if position(c_new in d) > 0 then
    if position(c_old in d) > 0 then
      raise exception '187 ①: booking_trend 에 새 범위와 옛 범위가 함께 있다 — 운영 본문 확인';
    end if;
    raise notice '187 ①: booking_trend already applied';
  else
    n := (length(d) - length(replace(d, c_old, ''))) / length(c_old);
    if n <> 1 then
      raise exception '187 ①: booking_trend 의 「지금」 범위 식이 %번 — 1번이어야 한다 — 운영 본문 확인', n;
    end if;
    execute replace(d, c_old, c_new);
  end if;

  if not exists (select 1 from pg_proc p
                  where p.oid = v_fn::oid and p.prosecdef
                    and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=public%'
                    and position(c_new in p.prosrc) > 0 and position(c_old in p.prosrc) = 0
                    and p.prosrc like '%coalesce(read_areas,''{}'') into v_role, v_areas%') then
    raise exception '187 ①: 바꾼 뒤 확인 실패(새 범위 식 · security definer·search_path · 174 보기 권한 줄)';
  end if;
end $mig$;

-- ── ② exec_stats — 현금/카드 = 실제 입금(payments) · 미입금 = 청구 − 현금·카드 입금 ──────────
do $mig$
declare
  nl     constant text := chr(10);
  v_fn   regprocedure := to_regprocedure('public.exec_stats(date,date)');
  a_cte  constant text := 'chg_m as (';
  a_mon  constant text := 'union select ym from chg_m';
  a_join constant text := 'left join chg_m c using(ym)';
  a_cash constant text := 'coalesce(c.cash,0) cash';
  a_card constant text := 'coalesce(c.card,0) card';
  a_uns  constant text := 'coalesce(c.unset,0) unset';
  a_tun  constant text := $q$'unset', coalesce(sum(unset),0)$q$;
  n_cte  constant text := 'pay_m as (' || nl
                       || $q$    select to_char((p.paid_at at time zone 'Asia/Tokyo'),'YYYY-MM') as ym,$q$ || nl
                       || $q$      coalesce(sum(p.amount) filter (where p.method = '현금'),0) as cash,$q$ || nl
                       || $q$      coalesce(sum(p.amount) filter (where p.method = '카드'),0) as card$q$ || nl
                       || $q$    from payments p$q$ || nl
                       || $q$    where not coalesce(p.voided,false)$q$ || nl
                       || $q$      and (p.paid_at at time zone 'Asia/Tokyo')::date between p_from and p_to$q$ || nl
                       || $q$    group by 1$q$ || nl
                       || '  ),' || nl
                       || '  chg_m as (';
  n_mon  constant text := 'union select ym from chg_m union select ym from pay_m';
  n_join constant text := 'left join chg_m c using(ym) left join pay_m pm using(ym)';
  n_cash constant text := 'coalesce(pm.cash,0) cash';
  n_card constant text := 'coalesce(pm.card,0) card';
  n_uns  constant text := 'greatest(coalesce(c.onsite,0) - coalesce(pm.cash,0) - coalesce(pm.card,0), 0) unset';
  n_tun  constant text := $q$'unset', greatest(coalesce(sum(onsite),0) - coalesce(sum(cash),0) - coalesce(sum(card),0), 0)$q$;
  olds text[]; news text[]; chk text[];
  d text; src text; x text; i int; n int; h int := 0;
begin
  if v_fn is null then raise exception '187 ②: exec_stats(date,date) 없음 — 53 먼저'; end if;
  if to_regclass('public.payments') is null then raise exception '187 ②: payments 표 없음 — 09 먼저'; end if;
  olds := array[a_cte, a_mon, a_join, a_cash, a_card, a_uns, a_tun];
  news := array[n_cte, n_mon, n_join, n_cash, n_card, n_uns, n_tun];
  chk  := array[$q$'cash', coalesce(sum(cash),0)$q$, $q$'card', coalesce(sum(card),0)$q$];

  d := pg_get_functiondef(v_fn::oid);
  for i in 1..7 loop
    if position(news[i] in d) > 0 then h := h + 1; end if;
  end loop;

  if h = 7 then
    raise notice '187 ②: exec_stats already applied';
  elsif h > 0 then
    raise exception '187 ②: exec_stats 에 입금 기준 치환이 일부만 있다(%/7) — 운영 본문 확인', h;
  else
    if d ~ '\mpay_m\M' or d ~ '\mpm\.' then
      raise exception '187 ②: exec_stats 에 이미 pay_m·pm 이름이 있다 — 운영 본문 확인';
    end if;
    for i in 1..7 loop
      n := (length(d) - length(replace(d, olds[i], ''))) / length(olds[i]);
      if n <> 1 then
        raise exception '187 ②: exec_stats 의 치환 대상 「%」 가 %번 — 1번이어야 한다 — 운영 본문 확인', olds[i], n;
      end if;
    end loop;
    foreach x in array chk loop
      n := (length(d) - length(replace(d, x, ''))) / length(x);
      if n <> 1 then
        raise exception '187 ②: exec_stats 의 합계 식 「%」 가 %번 — totals 가 months_j 를 더하는 식(53)이 아니다 — 운영 본문 확인', x, n;
      end if;
    end loop;
    if position('coalesce(c.onsite,0)' in d) = 0 then
      raise exception '187 ②: exec_stats months_j 에 coalesce(c.onsite,0) 가 없다(미입금 식이 쓰는 열) — 운영 본문 확인';
    end if;
    for i in 1..7 loop
      d := replace(d, olds[i], news[i]);
    end loop;
    execute d;
  end if;

  select p.prosrc into src from pg_proc p where p.oid = v_fn::oid;
  for i in 1..7 loop
    if position(news[i] in src) = 0 then raise exception '187 ②: 바꾼 뒤 확인 실패(「%」 없음)', news[i]; end if;
  end loop;
  foreach x in array chk loop
    if (length(src) - length(replace(src, x, ''))) / length(x) <> 1 then
      raise exception '187 ②: 바꾼 뒤 확인 실패(합계 식 「%」 가 1번이 아니다)', x;
    end if;
  end loop;
  if position(a_cash in src) > 0 or position(a_card in src) > 0 or position(a_uns in src) > 0 or position(a_tun in src) > 0
     or (length(src) - length(replace(src, 'v_areas', ''))) / length('v_areas') <> 3
     or src not like '%coalesce(read_areas,''{}'') into v_role, v_areas%'
     or not exists (select 1 from pg_proc p where p.oid = v_fn::oid and p.prosecdef
                      and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=public%') then
    raise exception '187 ②: 바꾼 뒤 확인 실패(옛 식 남음 · 권한 확인 줄 · security definer·search_path)';
  end if;
end $mig$;

-- ── ③ data_audit 검수 짝 — pay_mix_check(§3-3) ────────────────────────────────────
do $mig$
declare
  c_anchor constant text := E'  return res;\nend $function$';
  d text; blk text; n int;
begin
  if to_regprocedure('public.data_audit()') is null then raise exception '187 ③: data_audit() 없음'; end if;
  d := pg_get_functiondef('public.data_audit()'::regprocedure);
  if position($q$'pay_mix_check'$q$ in d) > 0 then
    raise notice '187 ③: data_audit pay_mix_check already present';
    return;
  end if;
  n := (length(d) - length(replace(d, c_anchor, ''))) / length(c_anchor);
  if n <> 1 then
    raise exception '187 ③: data_audit 끝 「return res; end」 가 %번 — 1번이어야 한다 — 운영 본문 확인', n;
  end if;
  if d !~ '\mv_mf\M' or d !~ '\mv_today\M' then
    raise exception '187 ③: data_audit 에 v_mf·v_today 가 없다(156·158 의 블록이 쓰는 변수) — 운영 본문 확인';
  end if;
  blk := $blk$  -- ⟪187 pay_mix_check⟫ 경영 통계 현금/카드/미입금 검산 — exec_stats 이번 달 값 vs 청구(charges)·입금(payments)을 시각 경계(JST 0시)로 직접 합 · 현금+카드 = 이번 달 입금 전체
  declare
    v_pm_es jsonb; v_pm_err text;
    v_pm_c1 numeric; v_pm_k1 numeric; v_pm_u1 numeric;
    v_pm_c2 numeric; v_pm_k2 numeric; v_pm_all numeric; v_pm_g2 numeric; v_pm_u2 numeric;
    v_pm_t0 timestamptz := (v_mf::timestamp at time zone 'Asia/Tokyo');
    v_pm_t1 timestamptz := ((v_today + 1)::timestamp at time zone 'Asia/Tokyo');
  begin
    begin
      v_pm_es := exec_stats(v_mf, v_today);
    exception when others then
      v_pm_err := sqlerrm;
    end;
    select coalesce(sum(px187.amount) filter (where px187.method = '현금'), 0),
           coalesce(sum(px187.amount) filter (where px187.method = '카드'), 0),
           coalesce(sum(px187.amount), 0)
      into v_pm_c2, v_pm_k2, v_pm_all
      from payments px187
     where not coalesce(px187.voided, false) and px187.paid_at >= v_pm_t0 and px187.paid_at < v_pm_t1;
    select coalesce(sum(coalesce(cx187.amount,0) + coalesce(cx187.tax,0) + coalesce(cx187.service_charge,0)), 0)
      into v_pm_g2
      from charges cx187
     where not coalesce(cx187.voided, false)
       and coalesce(cx187.charged_at, cx187.created_at) >= v_pm_t0
       and coalesce(cx187.charged_at, cx187.created_at) < v_pm_t1;
    v_pm_u2 := greatest(v_pm_g2 - v_pm_all, 0);
    if v_pm_err is not null then
      res := res || jsonb_build_object('key','pay_mix_check','sev','error','count',1,
        'samples', jsonb_build_array(jsonb_build_object('event_seq',0,'detail','경영 통계(exec_stats) 호출 실패: ' || v_pm_err)));
    else
      v_pm_c1 := coalesce((v_pm_es->'totals'->>'cash')::numeric, 0);
      v_pm_k1 := coalesce((v_pm_es->'totals'->>'card')::numeric, 0);
      v_pm_u1 := coalesce((v_pm_es->'totals'->>'unset')::numeric, 0);
      res := res || jsonb_build_object(
        'key','pay_mix_check','sev','error',
        'count', (case when v_pm_c1 <> v_pm_c2 then 1 else 0 end)
               + (case when v_pm_k1 <> v_pm_k2 then 1 else 0 end)
               + (case when v_pm_c1 + v_pm_k1 <> v_pm_all then 1 else 0 end)
               + (case when v_pm_u1 <> v_pm_u2 then 1 else 0 end),
        'samples', jsonb_build_array(
          jsonb_build_object('event_seq',0,'detail','이번 달 현금 — 경영 통계 ' || v_pm_c1 || ' / 입금 재계산 ' || v_pm_c2
                                                     || case when v_pm_c1 = v_pm_c2 then ' · 일치' else ' · 불일치' end),
          jsonb_build_object('event_seq',0,'detail','이번 달 카드 — 경영 통계 ' || v_pm_k1 || ' / 입금 재계산 ' || v_pm_k2
                                                     || case when v_pm_k1 = v_pm_k2 then ' · 일치' else ' · 불일치' end),
          jsonb_build_object('event_seq',0,'detail','이번 달 현금+카드 ' || (v_pm_c1 + v_pm_k1) || ' / 입금 전체 ' || v_pm_all
                                                     || case when v_pm_c1 + v_pm_k1 = v_pm_all then ' · 일치' else ' · 불일치(현금·카드 밖의 입금 수단)' end),
          jsonb_build_object('event_seq',0,'detail','이번 달 미입금 — 경영 통계 ' || v_pm_u1 || ' / 청구 − 입금 재계산 ' || v_pm_u2
                                                     || case when v_pm_u1 = v_pm_u2 then ' · 일치' else ' · 불일치' end)));
    end if;
  end;
  -- ⟪/187⟫
$blk$;
  execute replace(d, c_anchor, blk || c_anchor);
end $mig$;

-- ── 실행 권한 — 로그인 전용 그대로(118·119·139·174 와 같은 상태를 다시 적는다) ──────────
revoke all on function public.booking_trend(text, integer) from public, anon;
grant execute on function public.booking_trend(text, integer) to authenticated;
revoke all on function public.exec_stats(date, date) from public, anon;
grant execute on function public.exec_stats(date, date) to authenticated;
revoke all on function public.data_audit() from public, anon;
grant execute on function public.data_audit() to authenticated;

-- 확인(읽기 전용)
-- select proname, length(prosrc), md5(prosrc), provolatile from pg_proc
--  where pronamespace = 'public'::regnamespace and proname in ('booking_trend','exec_stats','data_audit');
-- select prosrc like '%from booking_snapshots s0 where s0.snap_date <= d1), d0)) - interval ''1 month''%' from pg_proc where proname = 'booking_trend';   -- t
-- select prosrc like '%left join pay_m pm using(ym)%' and prosrc like '%''unset'', greatest(coalesce(sum(onsite),0)%' from pg_proc where proname = 'exec_stats';   -- t
-- select x from jsonb_array_elements(public.data_audit()) x where x->>'key' = 'pay_mix_check';                                                      -- count 0 (마스터 세션)
-- select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute');                                                -- 15 (불변)

-- 되돌리기(필요할 때만 · 주석을 풀어 한 번 실행 — 같은 치환을 거꾸로 하고, 넣은 검수 블록을 뺀다)
-- do $rb$
-- declare
--   nl constant text := chr(10);
--   b_old constant text := $q$b.dep_date >= date_trunc('month', d0)::date$q$;
--   b_new constant text := $q$b.dep_date >= (date_trunc('month', coalesce((select max(s0.snap_date) from booking_snapshots s0 where s0.snap_date <= d1), d0)) - interval '1 month')::date$q$;
--   n_cte constant text := 'pay_m as (' || nl
--                       || $q$    select to_char((p.paid_at at time zone 'Asia/Tokyo'),'YYYY-MM') as ym,$q$ || nl
--                       || $q$      coalesce(sum(p.amount) filter (where p.method = '현금'),0) as cash,$q$ || nl
--                       || $q$      coalesce(sum(p.amount) filter (where p.method = '카드'),0) as card$q$ || nl
--                       || $q$    from payments p$q$ || nl
--                       || $q$    where not coalesce(p.voided,false)$q$ || nl
--                       || $q$      and (p.paid_at at time zone 'Asia/Tokyo')::date between p_from and p_to$q$ || nl
--                       || $q$    group by 1$q$ || nl
--                       || '  ),' || nl
--                       || '  chg_m as (';
--   m0 constant text := '  -- ⟪187 pay_mix_check⟫';
--   m1 constant text := '  -- ⟪/187⟫' || chr(10);
--   d text; i int; j int;
-- begin
--   d := pg_get_functiondef('public.booking_trend(text,integer)'::regprocedure);
--   if position(b_new in d) > 0 then execute replace(d, b_new, b_old);
--   else raise notice '187 되돌리기 ①: booking_trend 는 이미 원래 본문'; end if;
--   d := pg_get_functiondef('public.exec_stats(date,date)'::regprocedure);
--   if position(n_cte in d) > 0 then
--     d := replace(d, $q$'unset', greatest(coalesce(sum(onsite),0) - coalesce(sum(cash),0) - coalesce(sum(card),0), 0)$q$, $q$'unset', coalesce(sum(unset),0)$q$);
--     d := replace(d, 'greatest(coalesce(c.onsite,0) - coalesce(pm.cash,0) - coalesce(pm.card,0), 0) unset', 'coalesce(c.unset,0) unset');
--     d := replace(d, 'coalesce(pm.card,0) card', 'coalesce(c.card,0) card');
--     d := replace(d, 'coalesce(pm.cash,0) cash', 'coalesce(c.cash,0) cash');
--     d := replace(d, 'left join chg_m c using(ym) left join pay_m pm using(ym)', 'left join chg_m c using(ym)');
--     d := replace(d, 'union select ym from chg_m union select ym from pay_m', 'union select ym from chg_m');
--     d := replace(d, n_cte, 'chg_m as (');
--     execute d;
--   else raise notice '187 되돌리기 ②: exec_stats 는 이미 원래 본문'; end if;
--   d := pg_get_functiondef('public.data_audit()'::regprocedure);
--   i := position(m0 in d); j := position(m1 in d);
--   if i > 0 and j > i then execute substr(d, 1, i - 1) || substr(d, j + length(m1));
--   else raise notice '187 되돌리기 ③: data_audit 에 187 블록 없음'; end if;
-- end $rb$;
