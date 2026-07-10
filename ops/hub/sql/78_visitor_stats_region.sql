-- ============================================================================
--  78_visitor_stats_region.sql — 방문 통계에 출발지(ICN/PUS)·숙소별·평균체류 추가
-- ----------------------------------------------------------------------------
--  55_visitor_stats 확장(같은 함수 create or replace):
--    ① by_origin  = 출발지 공항별 방문(ICN/PUS) × 회원/일반.
--       분류 = SZCore.originPort 규칙과 동일: 항공사 ZE→PUS·TW→ICN 우선,
--              없으면 출발지 부산·김해·PUS·BUS·PNS=PUS, 그 외 ICN(기본).
--    ② by_accom   = 숙소별 방문(야마나미·쿠주힐즈·간지호텔·시즈노야도 등) × 회원/일반.
--       숙소 = guests.accom(event_seq 매칭, 팀 숙소). 미지정은 '(미지정)'.
--    ③ avg_nights = 방문 1건당 평균 체류일(arr_date - dep_date, 인원 가중).
--  나머지(total·member·gender·by_age·series·members)·권한(report)·기준 불변.
--  멱등(create or replace). ⚠ Supabase SQL Editor 수동 실행(또는 MCP).
-- ============================================================================

create or replace function visitor_stats(p_from date, p_to date, p_gran text default 'month')
returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare
  v_role text; v_areas text[]; v_fmt text; res jsonb;
begin
  select role, areas into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or 'report' = any(coalesce(v_areas,'{}'))) then
    raise exception '권한 없음(방문 통계 — 관리자 또는 report 권한자 전용)';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception '기간이 올바르지 않습니다';
  end if;
  v_fmt := case p_gran
             when 'day'  then 'YYYY-MM-DD'
             when 'week' then 'IYYY-"W"IW'
             when 'year' then 'YYYY'
             else 'YYYY-MM' end;

  with vis as (
    select
      pa.name_kr,
      case when pa.gender in ('M','남','男') then 'M'
           when pa.gender in ('F','여','女') then 'F' else '?' end as gd,
      pa.birth,
      ( (coalesce(pa.member_grade,'') <> '' and pa.member_grade !~ '일반|비회원')
        or (coalesce(pa.member_class,'') <> '' and pa.member_class !~ '일반|비회원')
        or (coalesce(pa.member_div,'')   <> '' and pa.member_div   !~ '일반|비회원') ) as is_mem,
      coalesce(nullif(pa.member_class,''), nullif(pa.member_grade,'')) as grade_raw,
      b.dep_date as vdate,
      greatest((b.arr_date - b.dep_date), 0) as nights,
      -- 출발지 공항: 항공사 우선(ZE→PUS·TW→ICN), 없으면 출발지 문자열, 기본 ICN
      case when coalesce(pa.airline,'') ~* 'ZE|이스타' then 'PUS'
           when coalesce(pa.airline,'') ~* 'TW|티웨이' then 'ICN'
           when coalesce(pa.origin,'')  ~* '부산|김해|PUS|BUS|PNS' then 'PUS'
           else 'ICN' end as port,
      (select g.accom from guests g where g.event_seq = pa.event_seq limit 1) as accom,
      case when pa.birth is null then -1
           else least(floor(extract(year from age(b.dep_date, pa.birth)) / 10) * 10, 70)::int end as age_band
    from passengers pa
    join bookings b on b.event_seq = pa.event_seq
    where b.dep_date between p_from and p_to
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'gran', p_gran),
    'total',     (select count(*) from vis),
    'member',    (select count(*) filter (where is_mem) from vis),
    'nonmember', (select count(*) filter (where not is_mem) from vis),
    'avg_nights', (select round(avg(nights)::numeric, 1) from vis where nights > 0),
    'gender', (select jsonb_build_object(
        'm_mem', count(*) filter (where gd = 'M' and is_mem),
        'f_mem', count(*) filter (where gd = 'F' and is_mem),
        'm_non', count(*) filter (where gd = 'M' and not is_mem),
        'f_non', count(*) filter (where gd = 'F' and not is_mem),
        'u',     count(*) filter (where gd = '?')
      ) from vis),
    'by_origin', coalesce((select jsonb_agg(x order by x->>'port') from (
        select jsonb_build_object(
            'port', port,
            'member',    count(*) filter (where is_mem),
            'nonmember', count(*) filter (where not is_mem),
            'total',     count(*)) as x
        from vis group by port) q),'[]'::jsonb),
    'by_accom', coalesce((select jsonb_agg(x order by (x->>'total')::int desc) from (
        select jsonb_build_object(
            'accom', coalesce(nullif(accom,''),'(미지정)'),
            'member',    count(*) filter (where is_mem),
            'nonmember', count(*) filter (where not is_mem),
            'total',     count(*)) as x
        from vis group by coalesce(nullif(accom,''),'(미지정)')) q),'[]'::jsonb),
    'by_age', coalesce((select jsonb_agg(x order by x->>'band') from (
        select jsonb_build_object(
            'band', age_band,
            'member',    count(*) filter (where is_mem),
            'nonmember', count(*) filter (where not is_mem)) as x
        from vis group by age_band) q),'[]'::jsonb),
    'series', coalesce((select jsonb_agg(s order by s->>'bucket') from (
        select jsonb_build_object(
            'bucket', to_char(vdate, v_fmt),
            'total',     count(*),
            'member',    count(*) filter (where is_mem),
            'nonmember', count(*) filter (where not is_mem)) as s
        from vis group by to_char(vdate, v_fmt)) q),'[]'::jsonb),
    'members', coalesce((select jsonb_agg(m order by (m->>'visits')::int desc) from (
        select jsonb_build_object(
            'name', name_kr,
            'birth', to_char(birth,'YYYY-MM-DD'),
            'grade', coalesce(max(grade_raw),'(등급미상)'),
            'visits', count(*)) as m
        from vis
        where is_mem and coalesce(name_kr,'') <> ''
        group by name_kr, birth
        order by count(*) desc
        limit 200) q),'[]'::jsonb)
  ) into res;
  return res;
end $$;

grant execute on function visitor_stats(date, date, text) to authenticated;
