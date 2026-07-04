-- ============================================================================
--  62_order_tokens.sql — 팀별 주문 QR 토큰
-- ----------------------------------------------------------------------------
--  現地手配書(dispatch=print)에서 팀별 QR을 발급 → 손님이 체크인 때 QR을
--  촬영해 보관 → 주문 때 손님이 QR을 보여주면 직원 POS(pos.html)가 카메라로
--  스캔 → 토큰으로 그 팀(event_seq)을 즉시 선택해 주문을 받는다.
--   · token = 팀마다 추측 불가한 랜덤 문자열(event_seq 노출·순번 추측 방지).
--     발급은 클라이언트가 crypto.randomUUID()로 생성해 insert.
--   · 토큰 자체가 비밀 → 읽기(해석)는 로그인 직원 전체 허용(pos/front/settle/print),
--     발급(insert)·삭제는 print/room 영역만.
--   · event_seq 1팀=1토큰(PK). 재발급=삭제 후 재insert.
--  멱등. ⚠ Supabase SQL Editor 수동 실행(또는 MCP apply_migration).
-- ============================================================================

create table if not exists order_tokens (
  event_seq  bigint      primary key references bookings(event_seq) on delete cascade,
  token      text        unique not null,
  created_at timestamptz not null default now(),
  created_by text
);
create index if not exists idx_order_tokens_token on order_tokens(token);

alter table order_tokens enable row level security;

-- 읽기: 로그인 직원 전체(토큰→팀 해석). 토큰 값 자체가 비밀이라 매핑 열람은 허용.
drop policy if exists ot_sel on order_tokens;
create policy ot_sel on order_tokens for select to authenticated using (true);

-- 발급(insert): 手配書=print 또는 room 영역
drop policy if exists ot_ins on order_tokens;
create policy ot_ins on order_tokens for insert to authenticated
  with check (has_any_area(array['print','room']));

-- 삭제(재발급용): print 또는 room 영역
drop policy if exists ot_del on order_tokens;
create policy ot_del on order_tokens for delete to authenticated
  using (has_any_area(array['print','room']));

-- 확인:  select event_seq, token from order_tokens order by created_at desc limit 10;
