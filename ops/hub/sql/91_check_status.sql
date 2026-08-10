-- ============================================================================
--  91_check_status.sql — 팀 체크아웃 처리(프런트 데스크)
-- ----------------------------------------------------------------------------
--  guests.check_status(01_schema, 기본 '체크인전')를 실제로 쓰기 시작한다.
--  · 값: 체크인전 / 체크인 / 체크아웃   (DB 저장값 = 한국어 고정, 화면만 번역)
--  · 왜 RPC인가: guests 쓰기 RLS는 step1 영역 전용(19_rls_areas)이라
--    프런트(front)·객실(room)·정산(settle) 담당자가 직접 update 할 수 없다.
--    영역을 넓히면 임포트 데이터 전체가 열리므로, check_status 한 컬럼만
--    security definer 로 열어 준다(다른 컬럼은 그대로 잠김).
--  · 담당자는 로그인 이름(saizen_ops_user)을 클라이언트가 넘긴다 → change_log 기록.
--  ⚠ 「정산완료 판정」은 담당자가 이 버튼을 누르는 것(Min 결정).
--     잔액 0 자동판정은 못 쓴다 — 아무것도 안 산 팀은 입실 첫날부터 잔액 0이라
--     도착하자마자 체크아웃 처리되어 버린다.
--  멱등(create or replace). 번호 91.
-- ============================================================================

create or replace function set_check_status(
  p_seqs   bigint[],
  p_status text,
  p_by     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int := 0;
  v_seq     bigint;
  v_old     text;
begin
  -- 권한: 마스터 또는 프런트·객실·정산 영역 보유자
  if not (is_admin() or has_any_area(array['front','room','settle'])) then
    raise exception '권한 없음(front·room·settle 영역 필요)';
  end if;
  if p_status not in ('체크인전','체크인','체크아웃') then
    raise exception '잘못된 상태값: %', p_status;
  end if;
  if p_seqs is null or array_length(p_seqs, 1) is null then
    return jsonb_build_object('ok', true, 'updated', 0);
  end if;

  -- 팀별로 이전값을 남기며 갱신(변경된 팀만 이력 기록 → 중복 클릭이 로그를 더럽히지 않음)
  foreach v_seq in array p_seqs loop
    select check_status into v_old from guests where event_seq = v_seq;
    if v_old is null then continue; end if;             -- 없는 팀은 조용히 건너뜀
    if v_old is not distinct from p_status then continue; end if;

    update guests set check_status = p_status where event_seq = v_seq;
    v_updated := v_updated + 1;

    insert into change_log(entity, entity_id, action, label, field, old_value, new_value, changed_by)
    select 'check_status', v_seq::text, 'update',
           coalesce(g.team_tag, g.group_code, v_seq::text) || ' ' || coalesce(b.rep_name, ''),
           'check_status', v_old, p_status, nullif(p_by, '')
    from guests g left join bookings b on b.event_seq = g.event_seq
    where g.event_seq = v_seq;
  end loop;

  return jsonb_build_object('ok', true, 'updated', v_updated);
end $$;

grant execute on function set_check_status(bigint[], text, text) to authenticated;

-- 확인:
--   select set_check_status(array[30012474]::bigint[], '체크아웃', '테스트');
--   select event_seq, check_status from guests where event_seq = 30012474;
--   select * from change_log where entity='check_status' order by changed_at desc limit 5;
