-- ============================================================================
--  113_drop_seq_unique.sql — 자리번호 유니크 제거 (112 의 마무리)
-- ----------------------------------------------------------------------------
--  112 에서 명단의 신원키를 (event_seq, person_key) 로 바꿨는데,
--  옛 제약 `guest_members(event_seq, seq_in_team) UNIQUE` 가 그대로 남아 있었다.
--  → 재임포트에서 사람의 **자리번호가 바뀌면**(누가 취소돼 뒤 사람이 앞으로 당겨질 때)
--     같은 자리번호를 두 행이 잠깐 갖게 되어 **유니크 위반으로 등록이 통째로 실패**한다.
--     (실제 증상: 데이터 등록이 끝나지 않음 — 2026-08)
--  seq_in_team 은 이제 **표시용 순번**이지 신원이 아니다 → 유니크를 푼다(조회용 인덱스는 남긴다).
--  멱등. Supabase SQL Editor 수동 실행(또는 MCP apply_migration).
-- ============================================================================

alter table guest_members drop constraint if exists guest_members_event_seq_seq_in_team_key;
drop index if exists guest_members_event_seq_seq_in_team_key;
create index if not exists idx_gmembers_seq on guest_members(event_seq, seq_in_team);

-- 확인: (event_seq, person_key) 유니크만 남아야 한다
--   select indexname from pg_indexes where tablename='guest_members';
