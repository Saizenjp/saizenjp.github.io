-- ============================================================================
--  76_shizu_water.sql — 시즈 別棟 '현장 물채우기' 박수 기록(청구 아님·기록/표시용)
-- ----------------------------------------------------------------------------
--  別棟(개인 탕 객실)에 사전신청 없이 배정된 팀이 현장에서 탕을 쓰고 싶으면
--  1박·1방당 ¥4,000 현장 발생 비용이 든다(메리트 B2B 사전신청과 별개).
--  이건 청구 시스템이 아니라 '그 팀이 몇 박 지불·사용했는지'를 예약표에 기록·표시만 한다.
--  · event_seq PK, nights = 지불·사용한 박수(정수). 팀 단위.
--  · RLS = 읽기 로그인 전체 / 쓰기 shizu·room 영역(+admin). shizu_onsen과 동일 정책.
--  멱등. ⚠ 수동/MCP 적용.
-- ============================================================================

create table if not exists shizu_water_fill (
  event_seq  bigint      primary key references bookings(event_seq) on delete cascade,
  nights     int         not null default 0,        -- 현장 물채우기 지불·사용 박수(청구 아님)
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table shizu_water_fill enable row level security;
drop policy if exists swf_sel on shizu_water_fill;
create policy swf_sel on shizu_water_fill for select to authenticated using (true);
drop policy if exists swf_ins on shizu_water_fill;
create policy swf_ins on shizu_water_fill for insert to authenticated with check (has_any_area(array['shizu','room']));
drop policy if exists swf_upd on shizu_water_fill;
create policy swf_upd on shizu_water_fill for update to authenticated using (has_any_area(array['shizu','room'])) with check (has_any_area(array['shizu','room']));
drop policy if exists swf_del on shizu_water_fill;
create policy swf_del on shizu_water_fill for delete to authenticated using (has_any_area(array['shizu','room']));
