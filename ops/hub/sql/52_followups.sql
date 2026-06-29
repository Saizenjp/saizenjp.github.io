-- ============================================================================
--  52_followups.sql — 확인 필요(후속 조치) 알림
-- ----------------------------------------------------------------------------
--  목적: 어떤 행위(예: 조기 퇴실)가 다른 메뉴에 후속 작업(예: 정산 환불)을
--    남길 때, 담당자가 놓치지 않도록 「확인 필요」 항목을 남기는 범용 장치.
--    · 랜딩 🔔 배지 + 프론트데스크 패널에 미완료(open) 항목 노출(딥링크 + [완료]).
--    · area = 처리해야 할 영역 키(settle/room/…) — 표시·필터용(가드 아님).
--    · kind = 발생 유형(early_checkout 등). link = 딥링크(예: settle.html?ym=&seq=).
--    · 재사용: 객실 폐쇄·등급 불일치 등도 같은 테이블로 확장 가능.
--  RLS: 읽기·쓰기 모두 로그인 전체(모든 담당자가 확인 필요를 보고 완료 처리).
--  멱등. ⚠ Supabase SQL Editor 수동 실행(51 이후). (MCP로도 적용)
-- ============================================================================

create table if not exists followups (
  id          uuid primary key default gen_random_uuid(),
  event_seq   bigint references bookings(event_seq) on delete cascade,
  area        text not null default 'settle',
  kind        text not null default 'early_checkout',
  title       text not null,
  detail      text,
  link        text,
  status      text not null default 'open',          -- open | done
  created_by  text,
  created_at  timestamptz not null default now(),
  done_by     text,
  done_at     timestamptz
);
create index if not exists idx_followups_status on followups(status);
create index if not exists idx_followups_seq    on followups(event_seq);

alter table followups enable row level security;

-- 읽기: 로그인 전체
drop policy if exists followups_read on followups;
create policy followups_read on followups for select to authenticated using (true);

-- 생성: 로그인 전체
drop policy if exists followups_insert on followups;
create policy followups_insert on followups for insert to authenticated with check (true);

-- 수정(완료 처리): 로그인 전체
drop policy if exists followups_update on followups;
create policy followups_update on followups for update to authenticated using (true) with check (true);

-- 삭제: 로그인 전체(오기재 정리)
drop policy if exists followups_delete on followups;
create policy followups_delete on followups for delete to authenticated using (true);
