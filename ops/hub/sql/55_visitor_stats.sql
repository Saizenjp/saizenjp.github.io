-- ============================================================================
--  55_visitor_stats.sql — 방문 통계(골프장 협회·현청 보고용) 집계 RPC
-- ----------------------------------------------------------------------------
--  목적: 회원/비회원 방문객 수를 일·주·월·연 단위로 집계 + 성별·나이대·개인회원별.
--    골프장 협회 보고 / 현청(熊本県) 인원 조사 보고용.
--  권한: admin 또는 user_access.areas 에 'stats' 보유자(exec_stats와 동일 영역).
--  계산 기준:
--    · 방문 = passengers 1인 1체류, 현지 체크인(bookings.dep_date)이 기간 내 = 1방문(연인원).
--    · 회원판정 = member_grade·member_class·member_div 3컬럼 OR(하나라도 회원이면 회원) — 앱과 일치.
--    · 나이 = age(dep_date, birth) 만나이 → 10세 구간(70 이상은 '70대+'). birth 없으면 '미상'.
--    · 성별 = passengers.gender(M/남/男, F/여/女).
--    · 개인회원별 = 이름+생년(member_key) 단위 방문 횟수(상위 200).
--    · 시계열 = p_gran(day/week/month/year)별 버킷.
--  멱등. ⚠ Supabase SQL Editor 수동 실행(또는 MCP). exec_stats(53) 이후.
-- ============================================================================

create or replace function visitor_stats(p_from date, p_to date, p_gran text default 'month')
returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare
  v_role text; v_areas text[]; v_fmt text; res jsonb;
begin
  select role, areas into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or 'stats' = any(coalesce(v_areas,'{}'))) then
    raise exception '권한 없음(방문 통계 — 관리자 또는 stats 권한자 전용)';
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
    'gender', (select jsonb_build_object(
        'm_mem', count(*) filter (where gd = 'M' and is_mem),
        'f_mem', count(*) filter (where gd = 'F' and is_mem),
        'm_non', count(*) filter (where gd = 'M' and not is_mem),
        'f_non', count(*) filter (where gd = 'F' and not is_mem),
        'u',     count(*) filter (where gd = '?')
      ) from vis),
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
