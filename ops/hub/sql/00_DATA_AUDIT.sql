-- 00_DATA_AUDIT.sql — 운영 데이터 정합성 상시 점검(읽기 전용)
--   · 목적: 오늘류 버그(타 리조트 오염·태그 불일치·고아·정원초과·유령행 등)를 배포/임포트 전후 1분에 잡는다.
--   · 사용: Supabase SQL Editor에서 통째로 실행 → 각 행의 cnt가 0이면 정상(6·유령행은 재임포트로 자연 해소).
--   · 읽기 전용(SELECT만) — 데이터 변경 없음. 검출만 하고 교정은 별도(재임포트/수기).
--   ⚠ 이건 '마이그레이션 적용 여부'를 보는 00_VERIFY.sql과 별개 — 이쪽은 '데이터 자체'를 본다.
select '1_비사이젠 오염(bookings)' as check, count(*) cnt,
       '타 리조트(스가다이라·14hills·벳푸·시로사토·미야자키 등)가 bookings에 적재됨 → step1 accom 게이트 확인' as note
  from bookings
  where product_name !~ '쿠주|구주힐즈|久住|장기숙박|별장전용|간지|ガーンジー|GUERNSEY|시즈노야도|しずの宿|야마나미|돔하우스|소보별장|아소별장|관내별장'
union all
select '2_태그 불일치(person_tag≠group_code)', count(*),
       'guest_members.person_tag가 팀 group_code로 시작하지 않음 → 코드 재배정/임포트 정합 확인'
  from guests g join guest_members gm on gm.event_seq=g.event_seq
  where g.group_code is not null and gm.person_tag is not null and gm.person_tag not like g.group_code||'-%'
union all
select '3_고아 방배정(member 없음)', count(*),
       'rooms.member_id가 guest_members에 없음(FK 끊김) → 트리거/삭제 순서 확인'
  from rooms r where not exists(select 1 from guest_members gm where gm.id=r.member_id)
union all
select '4_방 facility null', count(*),
       'rooms.facility null → 예약표 로드(.eq(facility))에서 방배정 사라짐. SQL 84 트리거로 자동채움돼야 0'
  from rooms where facility is null
union all
select '5_정원초과(한 사람 겹침 2방)', count(*),
       '같은 사람이 겹치는 날짜에 방 2개 → 중복배정'
  from (select r1.member_id from rooms r1 join rooms r2
          on r1.member_id=r2.member_id and r1.id<r2.id and r1.check_in<r2.check_out and r2.check_in<r1.check_out) t
union all
select '6_명단수≠passengers(유령행)', count(*),
       'guest_members 수 ≠ passengers 수(운영팀) → 재임포트 유령행(step1 초과자리 정리로 해소, 방배정 무해)'
  from (select g.event_seq from guests g where g.group_code is not null
          and (select count(*) from guest_members gm where gm.event_seq=g.event_seq)
            <> (select count(*) from passengers p where p.event_seq=g.event_seq)) t
union all
select '7_개인번호 결번(seq_in_team≠1..N)', count(*),
       'guest_members.seq_in_team이 1..N 연속이 아님 → 네임택 개인번호 결번(재임포트로 교정)'
  from (select event_seq from guest_members group by event_seq
          having max(seq_in_team)<>count(*) or min(seq_in_team)<>1) t
union all
select '8_F코드 30일내 중복(현지 동시존재)', count(*),
       '같은 F그룹코드를 30일 이내 두 팀이 사용 → 네임택·식사 혼동(신규 임포트분은 SZCore.nmCodeConflict로 방지)'
  from (
    with f as (select gu.event_seq, gu.group_code, b.dep_date, b.arr_date
               from guests gu join bookings b on b.event_seq=gu.event_seq
               where gu.group_code ~ '^F[A-Z][ぁ-んァ-ン]$' and b.dep_date is not null and b.arr_date is not null)
    select f1.event_seq from f f1 join f f2
      on f1.group_code=f2.group_code and f1.event_seq<>f2.event_seq
      and f1.dep_date <= f2.arr_date + 30 and f2.dep_date <= f1.arr_date + 30) t
order by check;
