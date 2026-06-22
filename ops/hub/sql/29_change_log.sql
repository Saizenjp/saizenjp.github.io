-- ════════════════════════════════════════════════════════════════
-- 29_change_log.sql — 범용 변경이력(감사 로그)
--   모든 섹션(메뉴·정산·방배정·POS…)이 공유하는 단일 이력 테이블.
--   "누가·언제·무엇을·이전→이후" 를 한 곳에 남긴다. 불변(insert 전용).
--   첫 적용처: 메뉴 관리(menu.html, entity='menu_item').
--   ※ 기존 event_note_log(16)·import_log.changes(14)는 그대로 두고,
--     신규 이력은 이 테이블로 통일해 나간다.
--   멱등. 수동 실행. 번호 29.
-- ════════════════════════════════════════════════════════════════

create table if not exists change_log (
  id          bigint generated always as identity primary key,
  entity      text not null,                       -- 섹션/테이블 키: 'menu_item' 등
  entity_id   text,                                -- 대상 행 id(uuid/int 문자열)
  action      text not null,                       -- insert / update / delete
  label       text,                                -- 사람이 읽는 대상 라벨(코드·이름 등)
  field       text,                                -- 단일 필드명(선택)
  old_value   text,                                -- 단일 필드 이전값(선택)
  new_value   text,                                -- 단일 필드 이후값(선택)
  changes     jsonb,                               -- 다중 필드 diff {필드:{from,to}} (선택)
  changed_by  text,                                -- 담당자(로그인 이름 / saizen_ops_user)
  changed_at  timestamptz not null default now()
);
create index if not exists idx_change_log_entity on change_log(entity, changed_at desc);
create index if not exists idx_change_log_target on change_log(entity, entity_id, changed_at desc);

-- 테이블 권한
grant insert, select on change_log to authenticated;

alter table change_log enable row level security;

-- ── 기록(insert): 로그인 사용자 누구나 ──
drop policy if exists cl_insert on change_log;
create policy cl_insert on change_log
  for insert to authenticated with check (true);

-- ── 조회(select): 로그인 전체(각 섹션 담당자가 자기 이력 확인) ──
drop policy if exists cl_read on change_log;
create policy cl_read on change_log
  for select to authenticated using (true);

-- ※ update/delete 정책 없음 → 이력은 불변(수정·삭제 불가).
