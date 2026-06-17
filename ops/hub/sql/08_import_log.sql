-- 08_import_log.sql
-- 데이터 등록 변경이력(업로드 감사 로그). 담당자별 병렬 운영 구조에서 "누가·언제·무슨 파일"을 추적.
-- 01~07 이후 1회 실행. 멱등(create if not exists / drop policy if exists).

create table if not exists import_log (
  id           bigserial    primary key,
  session_ym   text,                          -- 등록 대상 월 "2026-06"
  uploaded_by  text,                          -- 담당자명 (등록 시 입력)
  files        text,                          -- 업로드 파일명(들), 콤마 구분
  counts       jsonb,                         -- {bookings,passengers,member_codes,guests,guest_members}
  note         text,
  uploaded_at  timestamptz  not null default now()
);
create index if not exists idx_import_log_ym on import_log(session_ym);
create index if not exists idx_import_log_at on import_log(uploaded_at desc);

-- RLS (다른 운영 테이블과 동일: anon+authenticated 허용)
alter table import_log enable row level security;
drop policy if exists p_all_import_log on import_log;
create policy p_all_import_log on import_log
  for all to anon, authenticated using (true) with check (true);
