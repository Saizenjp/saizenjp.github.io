-- ============================================================================
--  98_dedupe_guest_members.sql — 명단(guest_members) 중복 정리 (1회성)
-- ----------------------------------------------------------------------------
--  증상: 방배정 화면에 「명단 중복 N명을 숨겼습니다」(관측 830명, DB 전체 1,432행).
--
--  원인: 과거 step1 은 seq_in_team 에 엠클릭의 **전역 행번호**(753·754…)를 넣었고,
--   지금은 **팀 내 순번**(1·2·3…)을 넣는다. guest_members 의 upsert 충돌키가
--   (event_seq, seq_in_team) 이라, 옛 번호 행과 새 번호 행이 **서로 다른 키**가 되어
--   같은 사람이 두 벌 남았다. (현재 step1 은 1..N 로 매기고 초과 자리행을 지우므로 재발 없음.)
--
--  ⚠ 그냥 재임포트하면 안 되는 이유:
--   rooms.member_id 는 `on delete set null` 이다. 재임포트가 옛 행을 지우면 그 사람의
--   방배정이 **이름 없는 배정(member_id=null)** 으로 남아 방을 차지한 채 유령이 된다.
--   그래서 지우기 전에 **배정을 남길 사람에게 옮기는** 이 스크립트가 필요하다.
--
--  남길 사람(keep) 고르는 순서: ① 방배정이 붙어 있는 행 → ② seq_in_team 이 작은 행
--   (= 현재 형식인 1..N) → ③ id. 이름이 빈 행은 같은 사람인지 알 수 없어 **건드리지 않는다**.
--
--  실행: Supabase SQL Editor. ⚠ 되돌릴 수 없다 — 먼저 【0】 미리보기부터 본다.
-- ============================================================================

-- ── 【0】 미리보기 — 무엇이 지워지는지 먼저 확인 (변경 없음) ────────────────
--  ① 규모
--   with gm as (select g.*, (select count(*) from rooms r where r.member_id=g.id) rc
--                 from guest_members g where coalesce(g.name_kr,'')<>''),
--        d as (select id, event_seq, name_kr, seq_in_team, rc,
--                     count(*) over (partition by event_seq,name_kr,name_en) n,
--                     first_value(id) over (partition by event_seq,name_kr,name_en
--                       order by (rc>0) desc, seq_in_team asc, id asc) keep_id
--                from gm)
--   select count(*) as 지워질_행수, count(*) filter (where rc>0) as 그중_방배정_붙은_행
--     from d where n>1 and id<>keep_id;
--
--  ② 표본 20건 — 같은 사람이 옛 번호/새 번호로 두 벌인지 눈으로 확인
--   (위 with 절 그대로 이어서)
--   select event_seq, name_kr, seq_in_team, rc, (id=keep_id) as 남김
--     from d where n>1 order by event_seq, name_kr, seq_in_team limit 20;

-- ── 【1】 정리 — 한 트랜잭션으로 ────────────────────────────────────────────
begin;

create temp table _dup on commit drop as
with gm as (
  select g.*, (select count(*) from rooms r where r.member_id = g.id) rc
    from public.guest_members g
   where coalesce(g.name_kr,'') <> ''          -- 이름 없는 행(무기명 명단)은 제외
), d as (
  select id, event_seq, seq_in_team,
         count(*) over (partition by event_seq, name_kr, name_en) n,
         first_value(id) over (partition by event_seq, name_kr, name_en
                               order by (rc > 0) desc, seq_in_team asc, id asc) keep_id
    from gm
)
select id as dup_id, keep_id from d where n > 1 and id <> keep_id;

-- 정원 가드는 사람만 바뀌는 이 이동과 무관하다(인원 수 불변) → txn 한정 우회
select set_config('app.skip_room_guard', '1', true);

-- (a) 방배정을 남길 사람에게 옮긴다 — 단, 그 사람이 같은 기간에 이미 방이 있으면 옮기지 않는다
--     (한 사람이 같은 밤에 두 방을 차지하는 일 방지)
update public.rooms r
   set member_id = m.keep_id
  from _dup m
 where r.member_id = m.dup_id
   and not exists (
     select 1 from public.rooms r2
      where r2.member_id = m.keep_id
        and r2.check_in < r.check_out and r2.check_out > r.check_in);

-- (b) 옮기지 못한 것 = 같은 사람이 두 번 배정된 중복 → 삭제
delete from public.rooms r using _dup m where r.member_id = m.dup_id;

-- (c) 정산·골프 참조도 남길 사람으로(충돌하면 그대로 두고 아래 삭제 때 정리된다)
update public.charges c set member_id = m.keep_id from _dup m where c.member_id = m.dup_id;
update public.folios  f set member_id = m.keep_id from _dup m where f.member_id = m.dup_id
   and not exists (select 1 from public.folios f2
                    where f2.event_seq = f.event_seq and f2.member_id = m.keep_id);
update public.golf_group_members gm set member_id = m.keep_id from _dup m
 where gm.member_id = m.dup_id
   and not exists (select 1 from public.golf_group_members g2
                    where g2.group_id = gm.group_id and g2.member_id = m.keep_id);

-- (d) 중복 명단 행 삭제
delete from public.guest_members g using _dup m where g.id = m.dup_id;

select set_config('app.skip_room_guard', '', true);

-- 결과 확인용(커밋 전 눈으로 확인)
select count(*) as 남은_중복행
  from (select event_seq, name_kr, name_en, count(*) n
          from public.guest_members where coalesce(name_kr,'') <> ''
         group by event_seq, name_kr, name_en) t
 where n > 1;                                  -- 0 이면 정상

commit;

-- ── 【2】 사후 점검 ─────────────────────────────────────────────────────────
--  · 이름 없는 배정이 생기지 않았는지
--     select count(*) from rooms where member_id is null;
--  · 데이터 검수 페이지(감사)에서 「명단수 불일치」가 줄었는지 확인
--  · 방배정 화면의 「명단 중복 N명 숨김」 토스트가 사라져야 한다
