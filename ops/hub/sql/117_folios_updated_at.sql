-- ============================================================================
--  117_folios_updated_at.sql — 🔴 정산 마감이 실패하던 버그 수정
-- ----------------------------------------------------------------------------
--  증상: `folios` 를 UPDATE 하면 무조건 실패했다.
--    ERROR: record "new" has no field "updated_at"
--    (set_updated_at() 트리거는 붙어 있는데 테이블에 updated_at 컬럼이 없었다)
--
--  영향(정산 화면 settle.html):
--   · settleClose()  = 결제 기록 후 `folios.status='settled'` 로 마감 → **실패**
--     → payments 는 들어가서 잔액은 0이 되지만 folio 가 계속 open 으로 남았다.
--   · setFolioStatus() = folio 상태·메모 변경 → **실패**
--   실제로 운영 DB에 settled folio 가 0건이었다(결제 자체를 한 적이 없기도 하지만,
--   있었어도 마감이 안 됐다).
--
--  수정: 다른 테이블과 같은 규약으로 `updated_at` 컬럼을 추가한다.
--        (트리거를 지우는 대신 컬럼을 맞춘다 — 수정 시각이 남는 편이 이력에 유리)
--
--  멱등 재실행 가능. ⚠ Supabase SQL Editor 수동 실행(또는 MCP 적용).
-- ============================================================================

alter table folios add column if not exists updated_at timestamptz not null default now();

-- 확인용
--   update folios set note = note where id = (select id from folios limit 1);
--   → 에러 없이 1행 갱신되어야 한다.
--   select column_name from information_schema.columns
--     where table_name='folios' and column_name='updated_at';
