-- ============================================================================
--  00_SNAPSHOT_2026-11-21.sql — 본문이 운영 DB 에만 있던 함수 4개의 전문 기록(읽기 전용 자료)
-- ----------------------------------------------------------------------------
--  ⚠ 실행하지 않는다. 마이그레이션이 아니다 — 2026-11-21(SQL 188 적용 뒤) 운영 pg_get_functiondef 결과를 글자 그대로 옮긴 것.
--    이 함수들은 번호 파일이 「바뀐 블록만」 텍스트 치환·덧붙이기로 고쳐 와서(121·130~133 등) 저장소에 전문이 없었다.
--    뒤 번호 파일이 이 함수를 다시 고치면 이 기록은 낡는다 — 그때의 정본은 운영 DB 다(pg_get_functiondef 로 뽑는다).
--    다음 수정 파일의 ⓪ 대조(주석·공백을 뺀 md5)나 치환 대상 글자를 찾을 때 이 파일을 읽는다.
--  옮겨 적은 뒤 함수별 md5(pg_get_functiondef 전체)를 운영과 대조해 모두 일치했다:
--    data_audit()                  37767자 · md5 f11813344e012e3d521863ad9152c2c8 · 121·129·132·133·143·145·156·158·160·173·183·184·187 이 블록을 이어 붙였다
--    exec_stats(date,date)          6884자 · md5 7caa98372b39af60149a4f3c64736268 · 53 + 130·131·138·174 치환 + 187 입금 기준
--    today_summary()                1146자 · md5 1a013e5e65ba607c2c0e903ae4ff2df1 · 131 판
--    booking_trend(text,integer)    4387자 · md5 cdf61e6281a3af8516d842d746c6b3d4 · 126 + 138·174 치환 + 187 「지금」 범위
-- ============================================================================


-- ── data_audit() ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.data_audit()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  res jsonb := '[]'::jsonb;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_mf date; v_mn date; v_m1 bigint; v_m2 bigint; v_cg bigint; v_fg bigint; v_nofolio bigint;
begin
  if not coalesce(is_admin(), false) then
    raise exception 'admin only';
  end if;
  v_mf := date_trunc('month', v_today)::date;
  v_mn := (date_trunc('month', v_today) + interval '1 month')::date;

  res := res || jsonb_build_object(
    'key','seq_gap','sev','warn',
    'count',(select count(*) from (
        select event_seq from guest_members
        group by event_seq having max(seq_in_team) <> count(*) or min(seq_in_team) <> 1) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select event_seq,
               coalesce(string_agg(distinct regexp_replace(person_tag,'-[0-9]+[A-Za-z]*$',''),','),'')
                 || ' · seq ' || string_agg(seq_in_team::text, ',' order by seq_in_team) as detail
        from guest_members
        group by event_seq having max(seq_in_team) <> count(*) or min(seq_in_team) <> 1
        order by event_seq limit 20) s)
  );
  res := res || jsonb_build_object(
    'key','count_mismatch','sev','warn',
    'count',(select count(*) from (
        select g.event_seq from (select event_seq, count(*) n from guest_members group by event_seq) g
        join (select event_seq, count(*) n from passengers group by event_seq) p using(event_seq)
        where g.n <> p.n) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select g.event_seq, ('명단 gm=' || g.n || ' / pax=' || p.n) as detail
        from (select event_seq, count(*) n from guest_members group by event_seq) g
        join (select event_seq, count(*) n from passengers group by event_seq) p using(event_seq)
        where g.n <> p.n
        order by g.event_seq limit 20) s)
  );
  res := res || jsonb_build_object(
    'key','dup_tag','sev','warn',
    'count',(select count(*) from (
        select event_seq from guest_members
        group by event_seq
        having count(*) filter (where person_tag is not null) <> count(distinct person_tag)) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select event_seq, string_agg(person_tag, ',' order by person_tag) as detail
        from (
          select event_seq, person_tag
          from guest_members
          where person_tag is not null
          group by event_seq, person_tag having count(*) > 1) d
        group by event_seq
        order by event_seq limit 20) s)
  );
  res := res || jsonb_build_object(
    'key','orphan_room','sev','error',
    'count',(select count(*) from rooms r
        left join guest_members m on m.id = r.member_id
        where r.member_id is not null and m.id is null),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select r.event_seq, ('room ' || coalesce(r.room_no,'?') || ' · member_id=' || r.member_id) as detail
        from rooms r left join guest_members m on m.id = r.member_id
        where r.member_id is not null and m.id is null
        order by r.event_seq limit 20) s)
  );
  res := res || jsonb_build_object(
    'key','room_over','sev','error',
    'count',(select count(*) from (
        select a.id
        from rooms a join room_inventory i on i.id = a.inventory_id
        where a.member_id is not null
          and a.check_out >= ((now() at time zone 'Asia/Tokyo')::date - 7)
          and (select coalesce(max(nightly.pax),0) from (
                 select (select coalesce(sum(b.assigned_pax),0) from rooms b
                          where b.inventory_id = a.inventory_id and b.member_id is not null
                            and b.check_in <= starts.night and b.check_out > starts.night) as pax
                 from (select distinct r2.check_in as night from rooms r2
                        where r2.inventory_id = a.inventory_id and r2.member_id is not null
                          and r2.check_in >= a.check_in and r2.check_in < a.check_out) starts) nightly) > i.max_capacity) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select a.event_seq,
               ('room ' || coalesce(i.room_no,'?') || ' · ' || a.check_in || '~' || a.check_out
                || ' · ' || (select coalesce(max(nightly.pax),0) from (
                 select (select coalesce(sum(b.assigned_pax),0) from rooms b
                          where b.inventory_id = a.inventory_id and b.member_id is not null
                            and b.check_in <= starts.night and b.check_out > starts.night) as pax
                 from (select distinct r2.check_in as night from rooms r2
                        where r2.inventory_id = a.inventory_id and r2.member_id is not null
                          and r2.check_in >= a.check_in and r2.check_in < a.check_out) starts) nightly)
                || '/' || i.max_capacity || '名') as detail
        from rooms a join room_inventory i on i.id = a.inventory_id
        where a.member_id is not null
          and a.check_out >= ((now() at time zone 'Asia/Tokyo')::date - 7)
          and (select coalesce(max(nightly.pax),0) from (
                 select (select coalesce(sum(b.assigned_pax),0) from rooms b
                          where b.inventory_id = a.inventory_id and b.member_id is not null
                            and b.check_in <= starts.night and b.check_out > starts.night) as pax
                 from (select distinct r2.check_in as night from rooms r2
                        where r2.inventory_id = a.inventory_id and r2.member_id is not null
                          and r2.check_in >= a.check_in and r2.check_in < a.check_out) starts) nightly) > i.max_capacity
        order by a.event_seq limit 20) s)
  );
  res := res || jsonb_build_object(
    'key','member_dup','sev','warn',
    'count',(select count(*) from (
        select name_kr, code from member_codes
        where code is not null and name_kr is not null
        group by name_kr, code having count(*) > 1) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',0,'detail',detail)),'[]'::jsonb) from (
        select (name_kr || ' · ' || code || ' · 생년 '
                || string_agg(right(member_key,6), ' / ' order by member_key)) as detail
        from member_codes
        where code is not null and name_kr is not null
        group by name_kr, code having count(*) > 1
        order by name_kr limit 20) s)
  );
  res := res || jsonb_build_object(
    'key','stay_gap','sev','error',
    'count',(select count(*) from (
        select b.event_seq
        from bookings b
        where b.arr_date > current_date
          and b.arr_date > b.dep_date
          and exists (select 1 from rooms r where r.event_seq = b.event_seq and r.member_id is not null)
          and not exists (select 1 from rooms r
                          where r.event_seq = b.event_seq and r.member_id is not null
                            and r.check_in <= b.arr_date - 1 and r.check_out > b.arr_date - 1)) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select b.event_seq,
               (coalesce(b.rep_name,'') || ' · 예약 ' || b.dep_date || '~' || b.arr_date
                || '(' || (b.arr_date - b.dep_date) || '박) · 배정 '
                || (select min(r.check_in)::text from rooms r where r.event_seq=b.event_seq and r.member_id is not null)
                || '~'
                || (select max(r.check_out)::text from rooms r where r.event_seq=b.event_seq and r.member_id is not null)
                || ' · 마지막 '
                || (b.arr_date - (select max(r.check_out) from rooms r where r.event_seq=b.event_seq and r.member_id is not null))
                || '박 빔') as detail
        from bookings b
        where b.arr_date > current_date
          and b.arr_date > b.dep_date
          and exists (select 1 from rooms r where r.event_seq = b.event_seq and r.member_id is not null)
          and not exists (select 1 from rooms r
                          where r.event_seq = b.event_seq and r.member_id is not null
                            and r.check_in <= b.arr_date - 1 and r.check_out > b.arr_date - 1)
        order by b.dep_date limit 20) s)
  );
  res := res || jsonb_build_object(
    'key','stat_pax','sev','warn',
    'count',(select count(*) from bookings b
        where b.arr_date >= v_today and coalesce(b.status,'')<>'대기'
          and (select count(*) from passengers p where p.event_seq=b.event_seq) > 0
          and (select count(*) from passengers p where p.event_seq=b.event_seq) <> coalesce(b.pax,0)),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select b.event_seq, (coalesce(b.rep_name,'')||' · 예약 '||coalesce(b.pax,0)||'명 / 명단 '
               ||(select count(*) from passengers p where p.event_seq=b.event_seq)||'명') detail
        from bookings b
        where b.arr_date >= v_today and coalesce(b.status,'')<>'대기'
          and (select count(*) from passengers p where p.event_seq=b.event_seq) > 0
          and (select count(*) from passengers p where p.event_seq=b.event_seq) <> coalesce(b.pax,0)
        order by b.dep_date limit 20) s)
  );
  res := res || jsonb_build_object(
    'key','stat_nights','sev','warn',
    'count',(select count(*) from (
        select b.event_seq from bookings b
        where b.arr_date >= v_today and coalesce(b.status,'')<>'대기'
          and (regexp_match(coalesce(b.nights_label,b.product_name,''), '([0-9]+)\s*박'))[1] is not null
          and (regexp_match(coalesce(b.nights_label,b.product_name,''), '([0-9]+)\s*박'))[1]::int <> (b.arr_date-b.dep_date)) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select b.event_seq, (coalesce(b.rep_name,'')||' · 날짜상 '||(b.arr_date-b.dep_date)||'박 / 상품 '
               ||(regexp_match(coalesce(b.nights_label,b.product_name,''), '([0-9]+)\s*박'))[1]||'박') detail
        from bookings b
        where b.arr_date >= v_today and coalesce(b.status,'')<>'대기'
          and (regexp_match(coalesce(b.nights_label,b.product_name,''), '([0-9]+)\s*박'))[1] is not null
          and (regexp_match(coalesce(b.nights_label,b.product_name,''), '([0-9]+)\s*박'))[1]::int <> (b.arr_date-b.dep_date)
        order by b.dep_date limit 20) s)
  );
  res := res || jsonb_build_object(
    'key','charge_future','sev','warn',
    'count',(select count(*) from charges c where not c.voided
        and (c.charged_at at time zone 'Asia/Tokyo')::date > v_today),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',0,'detail',detail)),'[]'::jsonb) from (
        select (x.ym||' · '||x.n||'건 · ¥'||to_char(x.g,'FM999,999,999')||' · '||x.src) detail
        from (select to_char((c.charged_at at time zone 'Asia/Tokyo'),'YYYY-MM') ym, count(*) n,
                     sum(c.amount+c.tax+c.service_charge) g, string_agg(distinct c.source,',') src
              from charges c where not c.voided and (c.charged_at at time zone 'Asia/Tokyo')::date > v_today
              group by 1) x
        order by x.ym limit 20) s)
  );
  res := res || jsonb_build_object(
    'key','wait_leak','sev','error',
    'count',(select count(*) from bookings b where b.status='대기' and (
          exists(select 1 from rooms r where r.event_seq=b.event_seq)
       or exists(select 1 from charges c where c.event_seq=b.event_seq and not c.voided)
       or exists(select 1 from folios f where f.event_seq=b.event_seq)
       or exists(select 1 from cart_bookings cb where cb.event_seq=b.event_seq and cb.cancelled=0))),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select b.event_seq, (coalesce(b.rep_name,'')||' · '||b.dep_date||' · '
          ||concat_ws(', ',
              case when exists(select 1 from rooms r where r.event_seq=b.event_seq) then '방배정' end,
              case when exists(select 1 from charges c where c.event_seq=b.event_seq and not c.voided) then '청구' end,
              case when exists(select 1 from folios f where f.event_seq=b.event_seq) then '계산서' end,
              case when exists(select 1 from cart_bookings cb where cb.event_seq=b.event_seq and cb.cancelled=0) then '카트' end)) detail
        from bookings b where b.status='대기' and (
          exists(select 1 from rooms r where r.event_seq=b.event_seq)
       or exists(select 1 from charges c where c.event_seq=b.event_seq and not c.voided)
       or exists(select 1 from folios f where f.event_seq=b.event_seq)
       or exists(select 1 from cart_bookings cb where cb.event_seq=b.event_seq and cb.cancelled=0))
        order by b.dep_date limit 20) s)
  );
  select coalesce(sum(b.pax * greatest(least(b.arr_date, v_mn) - greatest(b.dep_date, v_mf), 0)),0)
    into v_m1 from bookings b
    where b.dep_date < v_mn and b.arr_date > v_mf and coalesce(b.status,'')<>'대기';
  select coalesce(sum(b.pax),0) into v_m2
    from generate_series(v_mf, v_mn - 1, '1 day') d
    join bookings b on b.dep_date <= d and b.arr_date > d and coalesce(b.status,'')<>'대기';
  res := res || jsonb_build_object(
    'key','occ_check','sev','error',
    'count', case when v_m1 = v_m2 then 0 else 1 end,
    'samples', jsonb_build_array(jsonb_build_object('event_seq',0,
        'detail', to_char(v_mf,'YYYY-MM')||' · 곱셈 '||v_m1||' / 펼침 '||v_m2||' · '||case when v_m1=v_m2 then '일치' else '불일치' end))
  );
  select coalesce(sum(amount+tax+service_charge),0) into v_cg from charges where not voided;
  select coalesce(sum(gross_total),0) into v_fg from v_folio_balance;
  select count(*) into v_nofolio from charges where not voided and folio_id is null;
  res := res || jsonb_build_object(
    'key','sales_check','sev','error',
    'count', (case when v_cg = v_fg then 0 else 1 end) + (case when v_nofolio > 0 then 1 else 0 end),
    'samples', jsonb_build_array(
        jsonb_build_object('event_seq',0,'detail','청구 합 ¥'||to_char(v_cg,'FM999,999,999')||' / 계산서 합 ¥'||to_char(v_fg,'FM999,999,999')||' · '||case when v_cg=v_fg then '일치' else '불일치' end),
        jsonb_build_object('event_seq',0,'detail','계산서 없는 청구 '||v_nofolio||'건'))
  );

  -- ⑭ 무기명 자리가 이름을 얻은 뒤 남은 옛 줄 (같은 사람이 방을 두 개 차지)
  res := res || jsonb_build_object(
    'key','placeholder_stale','sev','error',
    'count',(select count(*) from guest_members gm
        left join passengers p on p.id = gm.passenger_id
        where gm.person_key like '무기명|#%'
          and (p.id is null or (trim(coalesce(p.name_kr,''))<>'' and p.name_kr<>'무기명'))),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select gm.event_seq,
               (coalesce(b.rep_name,'')||'팀 · 자리#'||gm.seq_in_team||' · '||gm.person_key
                ||case when p.id is null then ' · 원본 명단에서 사라짐' else ' · 지금 이름 '||p.name_kr end
                ||' · 방 '||(select count(*) from rooms r where r.member_id=gm.id)||'건') detail
        from guest_members gm
        left join passengers p on p.id = gm.passenger_id
        left join bookings b on b.event_seq = gm.event_seq
        where gm.person_key like '무기명|#%'
          and (p.id is null or (trim(coalesce(p.name_kr,''))<>'' and p.name_kr<>'무기명'))
        order by b.dep_date limit 20) s)
  );

  -- ⑮ 안내 모니터 석식 합계 = 夕食 규칙 재계산 (134)
  declare v_sg int; v_re int;
  begin
    v_sg := (_signage_dinner_live(v_today)->>'total')::int;
    select coalesce(sum(greatest(coalesce(b.pax,g.pax,0) - (select count(*) from guest_members gm where gm.event_seq=b.event_seq and gm.actual_dep<=v_today),0)),0)::int
      into v_re
      from bookings b join guests g using(event_seq) left join print_overrides po using(event_seq)
      where b.dep_date<=v_today and b.arr_date>v_today and coalesce(b.status,'')<>'대기'
        and coalesce(g.accom,'')<>'' and not coalesce(po.excluded,false);
    -- 145: 장소별(레스토랑/컨벤션) 합계도 대조 — 팀별 장소(dinner_team_venue) 우선, 없으면 날짜 장소
    declare v_js jsonb; v_sr int; v_sc int; v_rr int; v_rc int;
    begin
      v_js := _signage_dinner_live(v_today);
      v_sr := coalesce((v_js->'by_venue'->'restaurant'->>'pax')::int,0);
      v_sc := coalesce((v_js->'by_venue'->'convention'->>'pax')::int,0);
      select coalesce(sum(case when coalesce(tv.venue,dv.venue)='restaurant' then s.e else 0 end),0)::int,
             coalesce(sum(case when coalesce(tv.venue,dv.venue)='convention' then s.e else 0 end),0)::int
        into v_rr, v_rc
        from (select b.event_seq,
                     greatest(coalesce(b.pax,g.pax,0) - (select count(*) from guest_members gm where gm.event_seq=b.event_seq and gm.actual_dep<=v_today),0) as e
                from bookings b join guests g using(event_seq) left join print_overrides po using(event_seq)
               where b.dep_date<=v_today and b.arr_date>v_today and coalesce(b.status,'')<>'대기'
                 and coalesce(g.accom,'')<>'' and not coalesce(po.excluded,false)) s
        left join dinner_team_venue tv on tv.event_seq=s.event_seq and tv.dinner_date=v_today
        left join dinner_venue dv on dv.dinner_date=v_today;
      res := res || jsonb_build_object(
        'key','dinner_check','sev','error',
        'count', (case when v_sg = v_re then 0 else 1 end) + (case when v_sr=v_rr and v_sc=v_rc then 0 else 1 end),
        'samples', jsonb_build_array(
          jsonb_build_object('event_seq',0,'detail', v_today||' · 모니터 '||v_sg||'명 / 재계산 '||v_re||'명 · '||case when v_sg=v_re then '일치' else '불일치' end),
          jsonb_build_object('event_seq',0,'detail', '장소별 · 레스토랑 '||v_sr||'/'||v_rr||' · 컨벤션 '||v_sc||'/'||v_rc||' · '||case when v_sr=v_rr and v_sc=v_rc then '일치' else '불일치' end)));
    end;
  end;

  -- ⑯ 로비 모니터 환영판·출발 인원 = 예약 재계산 (135)
  declare v_lb jsonb; v_w1 int; v_w2 int; v_o1 int; v_o2 int;
  begin
    v_lb := signage_lobby(v_today);
    v_w1 := (v_lb->>'welcome_pax')::int;
    select coalesce(sum(coalesce(b.pax,g.pax,0)),0)::int into v_w2
      from bookings b join guests g using(event_seq)
      where b.dep_date=v_today and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>'';
    select coalesce(sum((x->>'pax')::int),0)::int into v_o1 from jsonb_array_elements(v_lb->'departures') x;
    select coalesce(sum(case when (select count(*) from passengers p where p.event_seq=b.event_seq)>0
                              then (select count(*) from passengers p where p.event_seq=b.event_seq)
                              else coalesce(b.pax,g.pax,0) end),0)::int into v_o2
      from bookings b join guests g using(event_seq)
      where b.arr_date in (v_today, v_today+1) and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>'';
    res := res || jsonb_build_object(
      'key','lobby_check','sev','error',
      'count', (case when v_w1 = v_w2 then 0 else 1 end) + (case when v_o1 = v_o2 then 0 else 1 end),
      'samples', jsonb_build_array(
          jsonb_build_object('event_seq',0,'detail', v_today||' · 환영판 '||v_w1||'명 / 재계산 '||v_w2||'명 · '||case when v_w1=v_w2 then '일치' else '불일치' end),
          jsonb_build_object('event_seq',0,'detail', '출발(오늘·내일) '||v_o1||'명 / 재계산 '||v_o2||'명 · '||case when v_o1=v_o2 then '일치' else '불일치' end)));
  end;

  -- ⑰ 코스 모니터 인원 합계 = 조 재계산 (136)
  declare v_c1 int; v_c2 int;
  begin
    v_c1 := (_signage_course_live(v_today)->>'total')::int;
    select coalesce(sum(case when m.n > 0 then m.n else coalesce(gg.capacity,0) end),0)::int into v_c2
      from golf_groups gg
      left join bookings b on b.event_seq = gg.event_seq
      left join lateral (select count(*) n from golf_group_members x
                          where x.group_id = gg.id
                            and x.member_id not in (select a.member_id from golf_absentees a where a.play_date = gg.play_date and a.member_id is not null)) m on true
      where gg.play_date = v_today and gg.course_code is not null and gg.slot_no is not null
        and (gg.event_seq is not null or coalesce(gg.label,'') <> '')
        and coalesce(b.status,'') <> '대기'
        and gg.event_seq not in (select sk.event_seq from golf_skips sk where sk.play_date = gg.play_date and sk.event_seq is not null);
    res := res || jsonb_build_object(
      'key','course_check','sev','error',
      'count', case when v_c1 = v_c2 then 0 else 1 end,
      'samples', jsonb_build_array(jsonb_build_object('event_seq',0,
          'detail', v_today||' · 코스 모니터 '||v_c1||'명 / 재계산 '||v_c2||'명 · '||case when v_c1=v_c2 then '일치' else '불일치' end)));
  end;

  -- ⑱ 직원 모니터 체크인·재실 인원 = 예약 재계산 (137)
  declare v_of jsonb; v_a1 int; v_a2 int; v_s1 int; v_s2 int;
  begin
    v_of := signage_office(v_today);
    v_a1 := (v_of->'checkin'->>'pax')::int;
    v_s1 := (v_of->'staying'->>'pax')::int;
    select coalesce(sum(coalesce(b.pax,g.pax,0)),0)::int into v_a2 from bookings b join guests g using(event_seq)
      where b.dep_date=v_today and coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>'';
    select coalesce(sum(coalesce(b.pax,g.pax,0)),0)::int into v_s2 from generate_series(v_today, v_today, '1 day') d
      join bookings b on b.dep_date<=d and b.arr_date>d join guests g on g.event_seq=b.event_seq
      where coalesce(b.status,'')<>'대기' and coalesce(g.accom,'')<>'';
    res := res || jsonb_build_object(
      'key','office_check','sev','error',
      'count', (case when v_a1=v_a2 then 0 else 1 end)+(case when v_s1=v_s2 then 0 else 1 end),
      'samples', jsonb_build_array(
        jsonb_build_object('event_seq',0,'detail', v_today||' · 체크인 '||v_a1||'명 / 재계산 '||v_a2||'명 · '||case when v_a1=v_a2 then '일치' else '불일치' end),
        jsonb_build_object('event_seq',0,'detail', '재실 '||v_s1||'명 / 재계산 '||v_s2||'명 · '||case when v_s1=v_s2 then '일치' else '불일치' end)));
  end;

  -- ⑲ 조편성 중복·자리 충돌 (143)
  res := res || jsonb_build_object(
    'key','golf_dup','sev','error',
    'count',(select count(*) from (
        select g.play_date, g.event_seq,
               coalesce((select string_agg(m.member_id::text,',' order by m.member_id) from golf_group_members m where m.group_id=g.id),
                        'slot:'||coalesce(g.course_code,'')||'#'||coalesce(g.slot_no::text,'')||'/'||g.capacity) mk
        from golf_groups g where g.play_date >= v_today - 7
        group by 1,2,3 having count(*)>1) t)
      + (select count(*) from (select play_date, course_code, slot_no from golf_groups
          where play_date >= v_today - 7 and course_code is not null and slot_no is not null
          group by 1,2,3 having count(*)>1) t2),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        (select g.event_seq, (g.play_date||' · 같은 조 '||count(*)||'개 · '||coalesce(max(g.label),'')) as detail
           from golf_groups g where g.play_date >= v_today - 7
           group by g.play_date, g.event_seq,
             coalesce((select string_agg(m.member_id::text,',' order by m.member_id) from golf_group_members m where m.group_id=g.id),
                      'slot:'||coalesce(g.course_code,'')||'#'||coalesce(g.slot_no::text,'')||'/'||g.capacity)
           having count(*)>1 order by g.play_date limit 10)
        union all
        (select 0::bigint, (play_date||' · '||course_code||'#'||slot_no||' 자리에 '||count(*)||'조: '||string_agg(coalesce(label,'?'),' | ')) as detail
           from golf_groups where play_date >= v_today - 7 and course_code is not null and slot_no is not null
           group by play_date, course_code, slot_no having count(*)>1 order by play_date limit 10)) s)
  );

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

  -- ㉓ 구마모토 시내·트라이얼 호텔 블록 초과 밤 (160) — 화면 블록 띠의 빨간 칸과 같은 수(오늘 이후 120일)
  res := res || jsonb_build_object(
    'key','partner_block_over','sev','warn',
    'count',(select count(*) from (
        select h.id, dd::date
        from partner_hotels h
        cross join generate_series(v_today, v_today + 120, interval '1 day') dd
        where h.active and h.block_twin > 0
          and (h.block_from is null or dd::date >= h.block_from) and (h.block_to is null or dd::date <= h.block_to)
          and (select coalesce(sum(o.twin),0) from partner_ops o join partner_bookings b on b.event_seq=o.event_seq
                where o.hotel_id=h.id and coalesce(o.use_block,true) and b.status is distinct from '대기' and b.seg_from <= dd::date and b.seg_to > dd::date) > h.block_twin) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',0,'detail',detail)),'[]'::jsonb) from (
        select (h.name_ja||' '||to_char(dd::date,'MM/DD')||' ツイン '||
                (select coalesce(sum(o.twin),0) from partner_ops o join partner_bookings b on b.event_seq=o.event_seq
                  where o.hotel_id=h.id and coalesce(o.use_block,true) and b.status is distinct from '대기' and b.seg_from <= dd::date and b.seg_to > dd::date)::text||'/'||h.block_twin) as detail
        from partner_hotels h
        cross join generate_series(v_today, v_today + 120, interval '1 day') dd
        where h.active and h.block_twin > 0
          and (h.block_from is null or dd::date >= h.block_from) and (h.block_to is null or dd::date <= h.block_to)
          and (select coalesce(sum(o.twin),0) from partner_ops o join partner_bookings b on b.event_seq=o.event_seq
                where o.hotel_id=h.id and coalesce(o.use_block,true) and b.status is distinct from '대기' and b.seg_from <= dd::date and b.seg_to > dd::date) > h.block_twin
        order by dd limit 10) s)
  );
  -- ㉔ 싱글 이용인데 요금 미정 (160) — 기본값(partner_settings.partner_defaults.single_rate)도 없을 때
  res := res || jsonb_build_object(
    'key','partner_single_norate','sev','warn',
    'count',(select count(*) from partner_ops o join partner_bookings b on b.event_seq=o.event_seq
              where o.single > 0 and o.single_rate is null and b.status is distinct from '대기' and b.seg_to >= v_today
                and coalesce((select nullif(value->>'single_rate','')::int from partner_settings where key='partner_defaults'), 0) = 0 and not exists (select 1 from partner_rates r where r.kind='hotel' and (r.ref_id is null or r.ref_id=o.hotel_id) and (r.from_date is null or r.from_date < b.seg_to) and (r.to_date is null or r.to_date >= b.seg_from) and (coalesce(nullif(r.prices->'single'->>'wk','')::int,0) > 0 or coalesce(nullif(r.prices->'single'->>'hi','')::int,0) > 0))),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select b.event_seq, (to_char(b.seg_from,'MM/DD')||' '||coalesce(b.rep_name,'')||' シングル '||o.single||'室') as detail
        from partner_ops o join partner_bookings b on b.event_seq=o.event_seq
        where o.single > 0 and o.single_rate is null and b.status is distinct from '대기' and b.seg_to >= v_today
          and coalesce((select nullif(value->>'single_rate','')::int from partner_settings where key='partner_defaults'), 0) = 0 and not exists (select 1 from partner_rates r where r.kind='hotel' and (r.ref_id is null or r.ref_id=o.hotel_id) and (r.from_date is null or r.from_date < b.seg_to) and (r.to_date is null or r.to_date >= b.seg_from) and (coalesce(nullif(r.prices->'single'->>'wk','')::int,0) > 0 or coalesce(nullif(r.prices->'single'->>'hi','')::int,0) > 0))
        order by b.seg_from limit 10) s)
  );

  res := res || jsonb_build_object(
    'key','golf_two_groups','sev','error',
    'count',(select count(*) from (
        select g.play_date, m.member_id
          from golf_group_members m join golf_groups g on g.id = m.group_id
         where m.member_id is not null
           and g.play_date >= (now() at time zone 'Asia/Tokyo')::date - 7
         group by g.play_date, m.member_id
        having count(distinct g.id) > 1) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select coalesce(max(gm.event_seq), max(m.event_seq), 0)::bigint as event_seq,
               (g.play_date || ' · ' || coalesce(max(gm.person_tag), '?') || ' · ' || count(distinct g.id) || '조: '
                 || string_agg(distinct coalesce(g.course_code, '-') || '#' || coalesce(g.slot_no::text, '-') || coalesce(' ' || g.tee_time, ''), ' | '
                               order by coalesce(g.course_code, '-') || '#' || coalesce(g.slot_no::text, '-') || coalesce(' ' || g.tee_time, ''))) as detail
          from golf_group_members m join golf_groups g on g.id = m.group_id
          left join guest_members gm on gm.id = m.member_id
         where m.member_id is not null
           and g.play_date >= (now() at time zone 'Asia/Tokyo')::date - 7
         group by g.play_date, m.member_id
        having count(distinct g.id) > 1
         order by g.play_date, 1
         limit 20) s)
  );
  -- ⟪187 pay_mix_check⟫ 경영 통계 현금/카드/미입금 검산 — exec_stats 이번 달 값 vs 청구(charges)·입금(payments)을 시각 경계(JST 0시)로 직접 합 · 현금+카드 = 이번 달 입금 전체
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
  return res;
end $function$
;

-- ── exec_stats(date,date) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.exec_stats(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text; v_areas text[]; v_days int; v_today date; res jsonb;
begin
  select role, coalesce(areas,'{}') || coalesce(read_areas,'{}') into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or coalesce(v_areas,'{}') && array['stats','stats_mgmt']) then
    raise exception '권한 없음(경영 통계 — 관리자 또는 stats 권한자 전용)';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception '기간이 올바르지 않습니다';
  end if;
  v_days := (p_to - p_from) + 1;
  v_today := (now() at time zone 'Asia/Tokyo')::date;

  with bk as (
    select b.event_seq, coalesce(b.pax,0) pax, b.dep_date, b.arr_date, b.origin, g.accom,
      greatest((b.arr_date - b.dep_date), 0) as nights,
      to_char(b.dep_date,'YYYY-MM') as ym,
      case when g.accom ilike '%쿠주%' or g.accom ilike '%久住%' or g.accom ilike '%구주%' then 14000
           when g.accom ilike '%간지%' then 16000
           when g.accom ilike '%시즈%' or g.accom ilike '%료칸%' then 16000
           when g.accom is null or g.accom = '' then 0
           else 14000 end as rate,
      case when b.origin ilike '%PUS%' or b.origin ilike '%부산%' or b.origin ilike '%김해%' then 'PUS' else 'ICN' end as orig
    from bookings b left join guests g on g.event_seq = b.event_seq
    where b.dep_date between p_from and p_to
      and coalesce(b.status,'') <> '대기'   -- 출국 전 정리되는 예약 — 오지 않는다
  ),
  bk_rev as ( select *, (pax*nights*rate) as lodge, (pax*6000) as trans from bk ),
  book_m as (
    select ym, count(*) teams, coalesce(sum(pax),0) pax, coalesce(sum(lodge+trans),0) b2b
    from bk_rev group by ym
  ),
  chg as (
    select coalesce(c.amount,0)+coalesce(c.tax,0)+coalesce(c.service_charge,0) as gross,
      c.pay_method, c.category,
      to_char((coalesce(c.charged_at,c.created_at) at time zone 'Asia/Tokyo'),'YYYY-MM') as ym,
      ((coalesce(c.charged_at,c.created_at) at time zone 'Asia/Tokyo')::date > v_today) as is_future
    from charges c
    where coalesce(c.voided,false) = false
      and (coalesce(c.charged_at,c.created_at) at time zone 'Asia/Tokyo')::date between p_from and p_to
  ),
  pay_m as (
    select to_char((p.paid_at at time zone 'Asia/Tokyo'),'YYYY-MM') as ym,
      coalesce(sum(p.amount) filter (where p.method = '현금'),0) as cash,
      coalesce(sum(p.amount) filter (where p.method = '카드'),0) as card
    from payments p
    where not coalesce(p.voided,false)
      and (p.paid_at at time zone 'Asia/Tokyo')::date between p_from and p_to
    group by 1
  ),
  chg_m as (
    select ym, coalesce(sum(gross),0) onsite,
      coalesce(sum(gross) filter (where is_future),0) future,
      coalesce(sum(gross) filter (where pay_method='현금'),0) cash,
      coalesce(sum(gross) filter (where pay_method='카드'),0) card,
      coalesce(sum(gross) filter (where pay_method is null or pay_method=''),0) unset
    from chg group by ym
  ),
  months as ( select ym from book_m union select ym from chg_m union select ym from pay_m ),
  months_j as (
    select m.ym, coalesce(b.teams,0) teams, coalesce(b.pax,0) pax, coalesce(b.b2b,0) b2b,
      coalesce(c.onsite,0) onsite, coalesce(c.future,0) future,
      coalesce(pm.cash,0) cash, coalesce(pm.card,0) card, greatest(coalesce(c.onsite,0) - coalesce(pm.cash,0) - coalesce(pm.card,0), 0) unset
    from months m left join book_m b using(ym) left join chg_m c using(ym) left join pay_m pm using(ym) order by m.ym
  ),
  mem as (
    select gm.event_seq,
      ( (coalesce(gm.member_grade,'')<>'' and gm.member_grade !~ '일반|비회원')
        or (coalesce(gm.member_class,'')<>'' and gm.member_class !~ '일반|비회원')
        or (coalesce(gm.member_div,'')<>'' and gm.member_div !~ '일반|비회원') ) as is_mem,
      coalesce(nullif(gm.member_class,''), nullif(gm.member_grade,'')) as grade_raw
    from guest_members gm join bk on bk.event_seq = gm.event_seq
  ),
  occ_book as (
    select coalesce(sum(coalesce(b.pax,0) *
      greatest(least(b.arr_date, p_to + 1) - greatest(b.dep_date, p_from), 0)),0) n
    from bookings b
    where b.dep_date <= p_to and b.arr_date > p_from and coalesce(b.status,'') <> '대기'
  ),
  occ_room as (
    select r.facility, coalesce(r.assigned_pax,1) *
      greatest(least(r.check_out, p_to + 1) - greatest(r.check_in, p_from), 0) as bn
    from rooms r where r.check_in <= p_to and r.check_out > p_from
  ),
  cap as ( select facility, coalesce(sum(capacity),0) cap from room_inventory where active group by facility ),
  captot as ( select coalesce(sum(capacity),0) c from room_inventory where active )
  select jsonb_build_object(
    'range', jsonb_build_object('from',p_from,'to',p_to,'days',v_days,'today',v_today),
    'months', coalesce((select jsonb_agg(to_jsonb(mj)) from months_j mj),'[]'::jsonb),
    'totals', (select jsonb_build_object(
        'teams', coalesce(sum(teams),0), 'pax', coalesce(sum(pax),0),
        'b2b', coalesce(sum(b2b),0), 'onsite', coalesce(sum(onsite),0),
        'onsite_future', coalesce(sum(future),0),
        'cash', coalesce(sum(cash),0), 'card', coalesce(sum(card),0), 'unset', greatest(coalesce(sum(onsite),0) - coalesce(sum(cash),0) - coalesce(sum(card),0), 0)
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
        'occupied', (select n from occ_book),
        'avail',    (select c from captot) * v_days,
        'assigned', (select coalesce(sum(bn),0) from occ_room),
        'by_facility', coalesce((select jsonb_agg(z) from (
            select o.facility, coalesce(sum(o.bn),0) occupied, coalesce(max(cp.cap),0)*v_days avail
            from occ_room o left join cap cp on cp.facility = o.facility
            group by o.facility order by 2 desc) z),'[]'::jsonb)
      )
  ) into res;
  return res;
end $function$
;

-- ── today_summary() ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.today_summary()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with d as (select (timezone('Asia/Tokyo', now()))::date as today)
  select json_build_object(
    'date',           (select today from d),
    'checkin_teams',  (select count(*)                  from bookings, d
                         where dep_date = today and coalesce(status,'') <> '대기'),
    'checkin_pax',    (select coalesce(sum(pax),0)::int from bookings, d
                         where dep_date = today and coalesce(status,'') <> '대기'),
    'checkout_teams', (select count(*)                  from bookings, d
                         where arr_date = today and coalesce(status,'') <> '대기'),
    'orders',         (select count(*) from charges, d
                         where (charged_at at time zone 'Asia/Tokyo')::date = today and not voided),
    'sales',          (select coalesce(sum(amount+tax+service_charge),0)::bigint
                         from charges, d
                         where (charged_at at time zone 'Asia/Tokyo')::date = today and not voided)
  );
$function$
;

-- ── booking_trend(text,integer) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.booking_trend(p_ym text DEFAULT NULL::text, p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text; v_areas text[]; d0 date; d1 date; ym text; res jsonb;
begin
  select role, coalesce(areas,'{}') || coalesce(read_areas,'{}') into v_role, v_areas from user_access where user_id = auth.uid() and active;
  if not (coalesce(v_role,'') = 'admin' or coalesce(v_areas,'{}') && array['stats','stats_mgmt']) then
    raise exception '권한 없음(예약 추이 — 관리자 또는 stats 권한자 전용)';
  end if;
  d0 := (now() at time zone 'Asia/Tokyo')::date;
  d1 := d0 - greatest(coalesce(p_days,7),1);
  ym := coalesce(nullif(p_ym,''), to_char(d0,'YYYY-MM'));

  with now_m as (
    select to_char(b.dep_date,'YYYY-MM') dep_ym,
           coalesce(nullif(btrim(b.status),''),'(없음)') status,
           coalesce(nullif(btrim(g.accom),''),'(미지정)') accom,
           count(*) teams, coalesce(sum(coalesce(b.pax,0)),0) pax
    from bookings b left join guests g on g.event_seq = b.event_seq
    where b.dep_date >= (date_trunc('month', coalesce((select max(s0.snap_date) from booking_snapshots s0 where s0.snap_date <= d1), d0)) - interval '1 month')::date
    group by 1,2,3
  ),
  base_day as (
    select max(snap_date) sd from booking_snapshots where snap_date <= d1
  ),
  prev_m as (
    select dep_ym, status, accom, teams, pax
    from booking_snapshots where snap_date = (select sd from base_day)
  ),
  months as ( select dep_ym from now_m union select dep_ym from prev_m ),
  m_now as ( select dep_ym, sum(teams) t, sum(pax) p from now_m group by 1 ),
  m_prev as ( select dep_ym, sum(teams) t, sum(pax) p from prev_m group by 1 ),
  m_join as (
    select mo.dep_ym ym,
           coalesce(n.t,0) teams, coalesce(n.p,0) pax,
           coalesce(v.t,0) prev_teams, coalesce(v.p,0) prev_pax
    from months mo left join m_now n using(dep_ym) left join m_prev v using(dep_ym)
    order by mo.dep_ym
  ),
  series as (
    select snap_date sd, sum(teams) t, sum(pax) p
    from booking_snapshots
    where dep_ym = ym and snap_date >= d0 - 90
    group by 1 order by 1
  ),
  st_now as ( select status, sum(teams) t, sum(pax) p from now_m where dep_ym = ym group by 1 ),
  st_prev as ( select status, sum(teams) t, sum(pax) p from prev_m where dep_ym = ym group by 1 ),
  st as (
    select coalesce(a.status,b.status) status,
           coalesce(a.t,0) teams, coalesce(a.p,0) pax,
           coalesce(b.t,0) prev_teams, coalesce(b.p,0) prev_pax
    from st_now a full join st_prev b using(status)
  ),
  ac_now as ( select accom, sum(teams) t, sum(pax) p from now_m where dep_ym = ym group by 1 ),
  ac_prev as ( select accom, sum(teams) t, sum(pax) p from prev_m where dep_ym = ym group by 1 ),
  ac as (
    select coalesce(a.accom,b.accom) accom,
           coalesce(a.t,0) teams, coalesce(a.p,0) pax,
           coalesce(b.t,0) prev_teams, coalesce(b.p,0) prev_pax
    from ac_now a full join ac_prev b using(accom)
  ),
  imp as (
    select changes from import_log
    where uploaded_at >= (d1::timestamptz) and changes is not null
  ),
  ev as (
    select 'added' k, (e->>'no') no, (e->>'rep') rep, (e->>'n') n
      from imp, jsonb_array_elements(coalesce(changes->'teams_added','[]')) e
    union all
    select 'removed', (e->>'no'), (e->>'rep'), (e->>'n')
      from imp, jsonb_array_elements(coalesce(changes->'teams_removed','[]')) e
    union all
    select 'cancelled', (e->>'no'), (e->>'rep'), null
      from imp, jsonb_array_elements(coalesce(changes->'teams_cancelled','[]')) e
  ),
  ev1 as (
    select distinct on (k, no) k, no, rep, n from ev
    where no like (substr(ym,3,2) || substr(ym,6,2) || '%')
    order by k, no
  )
  select jsonb_build_object(
    'ym', ym,
    'today', d0,
    'base_date', (select sd from base_day),
    'days', greatest(coalesce(p_days,7),1),
    'months', coalesce((select jsonb_agg(to_jsonb(x)) from m_join x),'[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object('d',sd,'teams',t,'pax',p) order by sd) from series),'[]'::jsonb),
    'by_status', coalesce((select jsonb_agg(to_jsonb(x)) from st x),'[]'::jsonb),
    'by_accom',  coalesce((select jsonb_agg(to_jsonb(x)) from ac x),'[]'::jsonb),
    'changes',   coalesce((select jsonb_agg(to_jsonb(x)) from ev1 x),'[]'::jsonb)
  ) into res;
  return res;
end $function$
;
