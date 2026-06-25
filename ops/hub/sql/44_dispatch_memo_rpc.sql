-- ============================================================================
--  44_dispatch_memo_rpc.sql — 現地手配書(dispatch) 現地メモ 편집 RPC
-- ----------------------------------------------------------------------------
--  dispatch.html(print 영역)에서 event_notes.memo(現地メモ)만 직접 수정.
--   · event_notes 테이블 쓰기는 notes 영역 전용(19_rls) → print 영역 사용자는
--     테이블 직접 쓰기 불가. 최소권한 유지 위해 memo만 갱신하는 security definer RPC.
--   · 권한: print / notes / room (또는 admin·manager = has_any_area 내장)만 실행.
--   · 변경 시 event_note_log(field='memo')에 이전→이후 자동 기록(다중 사용자 추적).
--  멱등 재실행 가능. ⚠ Supabase SQL Editor 수동 실행.
-- ============================================================================

create or replace function dispatch_set_memo(p_event_seq bigint, p_session_ym text, p_memo text, p_user text)
returns void language plpgsql security definer set search_path=public as $$
declare v_old text;
begin
  if not has_any_area(array['print','notes','room']) then
    raise exception '권한이 없습니다(現地メモ는 print/notes/room 영역)';
  end if;
  select memo into v_old from event_notes where event_seq=p_event_seq;
  insert into event_notes(event_seq, session_ym, memo, updated_by)
  values (p_event_seq, p_session_ym, nullif(btrim(p_memo),''), nullif(p_user,''))
  on conflict (event_seq) do update
    set memo=excluded.memo, updated_by=excluded.updated_by,
        session_ym=coalesce(event_notes.session_ym, excluded.session_ym);
  if coalesce(v_old,'') is distinct from coalesce(nullif(btrim(p_memo),''),'') then
    insert into event_note_log(event_seq, field, old_value, new_value, changed_by)
    values (p_event_seq, 'memo', v_old, nullif(btrim(p_memo),''), nullif(p_user,''));
  end if;
end $$;

revoke all on function dispatch_set_memo(bigint,text,text,text) from public;
grant execute on function dispatch_set_memo(bigint,text,text,text) to authenticated;
