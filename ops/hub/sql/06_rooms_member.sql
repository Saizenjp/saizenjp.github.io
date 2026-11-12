-- ════════════════════════════════════════════════════════════════════════
-- 06_rooms_member.sql
-- STEP2 방배정을 "팀 단위" → "개인(승객) 단위"로 전환한다.
--   · rooms 1행 = 1명 (assigned_pax 는 항상 1)
--   · 누가 그 방에 들어갔는지는 guest_members.id 를 FK로 못박는다(member_id)
--   · 화면 태그코드(RJあ-2G 등)는 표시용일 뿐, 저장은 PK(member_id)로 한다
--      → 그룹코드/임시코드가 바뀌어도 배정 연결이 깨지지 않는다
--
-- 전제: "데이터 다 무시하고 새로 시작" → 기존 rooms 배정 전부 비운다.
--       (transactions 중 방배정에 딸린 싱글차지도 함께 비운다)
-- PostgreSQL / Supabase 에서 실행. 01~05 실행 완료 상태에서 이어 실행할 것.
-- ⚠ 초기 1회용 — 지금은 다시 실행하지 않는다(운영 데이터가 있는 DB).
--    아래 1) 의 truncate 가 방배정(rooms) 전체를 비운다 — 자동·수기 배정이 모두 지워진다.
--    2) 의 delete 는 싱글차지 기록(transactions 의 single_charge)을 지운다.
--    위의 전제(「데이터 다 무시하고 새로 시작」)는 최초 구축 때만 맞는 말이다.
--    컬럼이 있는지는 00_VERIFY.sql 의 06 행으로 확인하고, 방배정 구조를 고칠 때는 새 번호 파일로 적는다.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- 1) 기존 방배정 전부 삭제 (새 출발)
truncate table rooms restart identity cascade;

-- 2) 방배정에 딸렸던 싱글차지 정리 (현장 기록 초기화)
delete from transactions where category = 'single_charge';

-- 3) member_id 컬럼 추가 (개인 식별자 = guest_members.id)
--    nullable 로 두어 과거 호환을 남기되, 신규 배정은 항상 채운다.
alter table rooms
  add column if not exists member_id bigint
    references guest_members(id) on delete cascade;

-- 4) 조회 성능용 인덱스
create index if not exists idx_rooms_member       on rooms(member_id);
create index if not exists idx_rooms_inventory    on rooms(inventory_id);
create index if not exists idx_rooms_event_seq    on rooms(event_seq);

-- 5) 같은 사람을 같은 방에 중복 배정 방지
--    (한 사람이 기간을 나눠 다른 방에 갈 수는 있으므로 inventory_id 까지 포함)
create unique index if not exists uq_rooms_member_room
  on rooms(member_id, inventory_id)
  where member_id is not null;

commit;

-- 확인용
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_name = 'rooms' order by ordinal_position;
