-- ============================================================================
--  SaiZen Hub — 20 주방 티켓 "접수(수락)" 상태 추가
-- ----------------------------------------------------------------------------
--  기존 2단계(new → done)에 주방 수락 단계를 추가해 3단계로:
--    new(신규) → accepted(접수·조리중) → done(완료)
--  · 주방(kitchen.html)이 [접수] 클릭 → accepted(누가·언제 기록)
--  · 프론트(pos.html) "주문 현황"이 이 상태를 실시간으로 확인
--
--  RLS는 19에서 kitchen_tickets 쓰기=pos·kitchen 허용이므로 변경 불요.
--  실행: Supabase SQL Editor. 12 이후. 멱등.
-- ============================================================================

alter table kitchen_tickets add column if not exists accepted_at timestamptz;
alter table kitchen_tickets add column if not exists accepted_by text;

-- status: new | accepted | done
do $$
begin
  if exists (select 1 from pg_constraint where conname='kitchen_tickets_status_chk') then
    alter table kitchen_tickets drop constraint kitchen_tickets_status_chk;
  end if;
  alter table kitchen_tickets add constraint kitchen_tickets_status_chk
    check (status in ('new','accepted','done'));
end $$;

-- 조회 인덱스(접수 포함 큐)
create index if not exists idx_ktickets_live on kitchen_tickets(status, created_at)
  where status in ('new','accepted');

-- ============================================================================
--  끝.
-- ============================================================================
