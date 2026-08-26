-- ============================================================================
--  126_kuju_rate_15000.sql — 쿠주힐즈 B2B 단가 15,000 (2026-09 출발건부터)
-- ----------------------------------------------------------------------------
--  Min 2026-08 통보: 쿠주힐즈 숙박팀은 **1박당 -1,000엔 차감 없이 15,000엔 전액**을
--  메리트에서 송금받는 구조로 바뀌었다. **9월 출발건부터** 적용.
--
--  ⚠ 소급하지 않는다 — 8월 이전 출발건은 14,000 그대로여야 이미 보낸 청구와 맞는다.
--     그래서 단가 판정에 dep_date 를 넣는다(saizen-core.accomRate 와 같은 식).
--
--  53_exec_stats.sql 의 exec_stats() 를 대체(create or replace, 나머지 로직 동일).
--  멱등. Supabase SQL Editor 또는 MCP apply_migration.
-- ============================================================================
create or replace function exec_stats(p_from date, p_to date)
returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare
  v_role text; v_areas text[]; v_days int; res jsonb;
begin
  select role, areas into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or 'stats' = any(coalesce(v_areas,'{}'))) then
    raise exception '권한 없음(경영 통계 — 관리자 또는 stats 권한자 전용)';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception '기간이 올바르지 않습니다';
  end if;
  v_days := (p_to - p_from) + 1;

  with bk as (
    select b.event_seq, coalesce(b.pax,0) pax, b.dep_date, b.arr_date, b.origin, g.accom,
      greatest((b.arr_date - b.dep_date), 0) as nights,
      to_char(b.dep_date,'YYYY-MM') as ym,
      -- 단가는 **출발일 기준**. 쿠주힐즈는 2026-09-01 출발건부터 15,000(그전 14,000).
      case when g.accom ilike '%쿠주%' or g.accom ilike '%久住%' or g.accom ilike '%구주%'
             then case when b.dep_date >= date '2026-09-01' then 15000 else 14000 end
           when g.accom ilike '%간지%' then 16000
           when g.accom ilike '%시즈%' or g.accom ilike '%료칸%' then 16000
           when g.accom is null or g.accom = '' then 0
           else 14000 end as rate,
      case when b.origin ilike '%PUS%' or b.origin ilike '%부산%' or b.origin ilike '%김해%' then 'PUS' else 'ICN' end as orig
    from bookings b left join guests g on g.event_seq = b.event_seq
    where b.dep_date between p_from and p_to
  ),
  bk_rev as ( select *, (pax*nights*rate) as lodge, (pax*6000) as trans from bk ),
  book_m as (
    select ym, count(*) teams, coalesce(sum(pax),0) pax, coalesce(sum(lodge+trans),0) b2b
    from bk_rev group by ym
  ),
  chg as (
    select coalesce(c.amount,0)+coalesce(c.tax,0)+coalesce(c.service_charge,0) as gross,
      c.pay_method, c.category,
      to_char((coalesce(c.charged_at,c.created_at) at time zone 'Asia/Tokyo'),'YYYY-MM') as ym
    from charges c
    where coalesce(c.voided,false) = false
      and (coalesce(c.charged_at,c.created_at) at time zone 'Asia/Tokyo')::date between p_from and p_to
  ),
  chg_m as (
    select ym, coalesce(sum(gross),0) onsite,
      coalesce(sum(gross) filter (where pay_method='현금'),0) cash,
      coalesce(sum(gross) filter (where pay_method='카드'),0) card,
      coalesce(sum(gross) filter (where pay_method is null or pay_method=''),0) unset
    from chg group by ym
  ),
  months as ( select ym from book_m union select ym from chg_m ),
  months_j as (
    select m.ym,
      coalesce(b.teams,0) teams, coalesce(b.pax,0) pax, coalesce(b.b2b,0) b2b,
      coalesce(c.onsite,0) onsite, coalesce(c.cash,0) cash, coalesce(c.card,0) card, coalesce(c.unset,0) unset
    from months m left join book_m b using(ym) left join chg_m c using(ym)
    order by m.ym
  ),
  mem as (
    select gm.event_seq,
      ( (coalesce(gm.member_grade,'')<>'' and gm.member_grade !~ '일반|비회원')
        or (coalesce(gm.member_class,'')<>'' and gm.member_class !~ '일반|비회원')
        or (coalesce(gm.member_div,'')<>'' and gm.member_div !~ '일반|비회원') ) as is_mem,
      coalesce(nullif(gm.member_class,''), nullif(gm.member_grade,'')) as grade_raw
    from guest_members gm join bk on bk.event_seq = gm.event_seq
  ),
  occ as (
    select r.facility, coalesce(r.assigned_pax,1) apax, (r.check_out - r.check_in) as nights
    from rooms r where r.check_in between p_from and p_to and r.check_out > r.check_in
  ),
  cap as ( select facility, coalesce(sum(capacity),0) cap from room_inventory where active group by facility ),
  captot as ( select coalesce(sum(capacity),0) c from room_inventory where active )
  select jsonb_build_object(
    'range', jsonb_build_object('from',p_from,'to',p_to,'days',v_days),
    'months', coalesce((select jsonb_agg(to_jsonb(mj)) from months_j mj),'[]'::jsonb),
    'totals', (select jsonb_build_object(
        'teams', coalesce(sum(teams),0), 'pax', coalesce(sum(pax),0),
        'b2b', coalesce(sum(b2b),0), 'onsite', coalesce(sum(onsite),0),
        'cash', coalesce(sum(cash),0), 'card', coalesce(sum(card),0), 'unset', coalesce(sum(unset),0)
      ) from months_j),
    'by_accom', coalesce((select jsonb_agg(x) from (
        select coalesce(nullif(accom,''),'(미지정)') accom, count(*) teams, coalesce(sum(pax),0) pax, coalesce(sum(lodge+trans),0) b2b
        from bk_rev group by 1 order by 4 desc) x),'[]'::jsonb),
    'by_origin', coalesce((select jsonb_agg(x) from (
        select orig origin, count(*) teams, coalesce(sum(pax),0) pax from bk_rev group by 1 order by 1) x),'[]'::jsonb),
    'onsite_by_cat', coalesce((select jsonb_agg(x) from (
        select coalesce(nullif(category,''),'(기타)') category, coalesce(sum(gross),0) amount
        from chg group by 1 order by 2 desc) x),'[]'::jsonb),
    'members', (select jsonb_build_object(
        'member', count(*) filter (where is_mem), 'nonmember', count(*) filter (where not is_mem),
        'by_grade', coalesce((select jsonb_agg(y) from (
            select case when is_mem then coalesce(grade_raw,'(등급미상)') else '일반' end grade, count(*) persons
            from mem group by 1 order by 2 desc) y),'[]'::jsonb)
      ) from mem),
    'occupancy', jsonb_build_object(
        'occupied', (select coalesce(sum(apax*nights),0) from occ),
        'avail', (select c from captot) * v_days,
        'by_facility', coalesce((select jsonb_agg(z) from (
            select o.facility, coalesce(sum(o.apax*o.nights),0) occupied, coalesce(max(cp.cap),0)*v_days avail
            from occ o left join cap cp on cp.facility = o.facility group by o.facility order by 2 desc) z),'[]'::jsonb)
      )
  ) into res;
  return res;
end $$;

grant execute on function exec_stats(date,date) to authenticated;
