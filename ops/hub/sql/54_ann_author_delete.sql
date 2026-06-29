-- ============================================================================
--  54_ann_author_delete.sql — 공지 삭제 = 작성자 본인 + 마스터(admin)
-- ----------------------------------------------------------------------------
--  목적: 공지(announcements) 삭제를 「작성자 본인만」으로 좁히되, 고아 공지
--    (작성자 퇴사·부적절 글)는 마스터(admin)가 정리할 수 있게 override.
--    · author_uid = 작성자 user_id(이름은 바뀌거나 겹쳐 RLS 기준 부적합).
--    · 작성·수정·핀고정·정렬 = 기존대로 admin·manager(운영성).
--    · 삭제(DELETE) = author_uid=auth.uid() OR is_admin().
--  ⚠ 기존 글은 author_uid=null → 마스터만 삭제 가능(레거시 정리). 백필 없음.
--  멱등. ⚠ Supabase SQL Editor 수동 실행(53 이후). (MCP로도 적용)
-- ============================================================================

alter table announcements add column if not exists author_uid uuid;

-- 기존 통합 쓰기 정책(ALL) 제거 → insert/update/delete 분리
drop policy if exists ann_write on announcements;

-- 작성(INSERT) = admin·manager. author_uid 위조 방지(본인 또는 null만 허용).
drop policy if exists ann_insert on announcements;
create policy ann_insert on announcements for insert to authenticated
  with check (
    exists(select 1 from user_access where user_id=auth.uid() and active and role in ('admin','manager'))
    and (author_uid is null or author_uid = auth.uid())
  );

-- 수정·핀·정렬(UPDATE) = admin·manager(운영성 — 타인 글도 핀/정렬 가능).
drop policy if exists ann_update on announcements;
create policy ann_update on announcements for update to authenticated
  using (exists(select 1 from user_access where user_id=auth.uid() and active and role in ('admin','manager')))
  with check (exists(select 1 from user_access where user_id=auth.uid() and active and role in ('admin','manager')));

-- 삭제(DELETE) = 작성자 본인 또는 마스터(admin).
drop policy if exists ann_delete on announcements;
create policy ann_delete on announcements for delete to authenticated
  using ( author_uid = auth.uid() or is_admin() );

-- 읽기(ann_read = true)는 그대로 유지.
