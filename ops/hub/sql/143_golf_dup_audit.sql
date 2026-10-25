-- ============================================================================
-- 143_golf_dup_audit.sql — 데이터 검수 ⑲ 「조편성 중복·같은 자리 충돌」(golf_dup)
-- ----------------------------------------------------------------------------
--  사고(2026-10-25): 코스 배정표 「이달 전체 자동 배정」이 **오래된 월 상태(MONTHG)** 를 기준으로
--  planDate 를 돌려, 몇 초 전 화면에서 저장한 오늘 조 69개를 「없는 것」으로 보고 다시 넣었다
--  → 69조가 138조(조원 236명이 전부 두 조에), 수기 조와 자동 조가 같은 슬롯에 겹치기도 했다.
--  화면(course.html)은 ① 이달 자동배정 전에 월 상태를 DB 에서 다시 읽고 열려 있는 날은 화면 상태를 쓴다
--  ② 저장이 겹치지 않게 한다(SAVING) ③ 로드 때 중복·충돌을 찾아 빨간 띠 + [정리] 를 띄운다.
--  이 파일은 그 **검수 짝**(§3-3): data_audit() 에 golf_dup 항목을 붙인다.
--   · dup  = 같은 날·같은 팀·같은 조원 집합(조원 없으면 코스·슬롯·정원) 조 2개 이상
--   · coll = 같은 날·같은 코스·같은 슬롯에 조 2개 이상 (표는 한 칸에 하나만 그려 나머지가 숨는다)
--   · 범위 = 오늘-7일 이후(지난 일은 고칠 것이 없다)
--  ⚠ data_audit() 본문은 Supabase 적용본이 정본(129 「전문」 뒤 134~137 이 블록을 덧붙임).
--     아래 DO 블록은 적용본을 읽어 `return res;` 앞에 ⑲ 를 끼워 넣는다(이미 있으면 건너뜀) — 멱등.
--  ⚠ RPC 권한(§119): create or replace 는 기존 EXECUTE 권한을 유지한다(authenticated 전용 그대로).
--  MCP 적용 완료 2026-10-25. 00_VERIFY 143 = prosrc 에 golf_dup 포함 여부.
-- ============================================================================
do $do$
declare d text; blk text;
begin
  d := pg_get_functiondef('public.data_audit()'::regprocedure);
  if d like '%''golf_dup''%' then raise notice 'data_audit: golf_dup already present'; return; end if;
  blk := $blk$
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
$blk$;
  d := replace(d, E'  return res;\nend $function$', blk || E'  return res;\nend $function$');
  execute d;
end $do$;
