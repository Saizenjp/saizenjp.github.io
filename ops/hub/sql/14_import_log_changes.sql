-- ════════════════════════════════════════════════════════════════════════
-- 14_import_log_changes.sql
-- 업로드 수정이력(diff) 저장: import_log 에 변경 내역(jsonb) 컬럼 추가.
--   · step1 업로드 시 그 달 기존 상태 ↔ 새 파일을 비교해 기록:
--       teams_added / teams_removed(취소) / persons_added / persons_removed(빠짐)
--       / grade_changed(등급변경)  ← 이름+생년6자리(사람 단위) 기준
--   · 이력 패널에서 업로드 줄 아래에 "↳ ❌취소 N팀 · ➖빠짐 M …" 으로 표시.
--
-- 번호: 정산 워크스트림 09·11~13 다음 → 14. (이 저장소 sql/ 는 01~08·10·14)
-- PostgreSQL / Supabase SQL Editor 에서 1회 실행. 멱등.
-- ════════════════════════════════════════════════════════════════════════

alter table import_log add column if not exists changes jsonb;

-- 확인용
-- select uploaded_at, session_ym, files, changes
--   from import_log order by uploaded_at desc limit 5;
