-- ============================================================================
--  61_event_note_set_rpc.sql — 운영 메모(event_notes) 범용 편집 RPC(맥락 화면에서 인라인 입력)
-- ----------------------------------------------------------------------------
--  목적: 프론트데스크 등 '일하는 화면'에서 event_notes(memo·remarks·team_label)를
--    바로 편집(별도 notes 페이지에 안 들어가도 됨). event_notes 쓰기는 notes 영역 전용(19_rls)
--    이라 front/print/room 사용자는 직접 못 씀 → security definer RPC로 최소권한 우회.
--   · 필드 화이트리스트(memo/remarks/team_label)만 — format %I 안전.
--   · 권한: front / print / notes / room (admin·manager는 has_any_area 내장 통과)만 실행.
--   · 변경 시 event_note_log(field)에 이전→이후 자동 기록.
--  44_dispatch_set_memo(memo 전용)의 일반화 버전. dispatch는 기존 RPC 그대로 사용.
--  멱등. ⚠ Supabase SQL Editor 수동 실행(또는 MCP). 60 이후.
-- ============================================================================

create or replace function event_note_set(p_event_seq bigint, p_session_ym text, p_field text, p_value text, p_user text)
returns void language plpgsql security definer set search_path=public as $$
declare v_old text; v_val text;
begin
  if p_field not in ('memo','remarks','team_label') then
    raise exception 'invalid field: %', p_field;
  end if;
  if not has_any_area(array['front','print','notes','room']) then
    raise exception '권한이 없습니다(운영 메모는 front/print/notes/room 영역)';
  end if;
  v_val := nullif(btrim(p_value),'');
  execute format('select %I from event_notes where event_seq=$1', p_field) into v_old using p_event_seq;
  execute format(
    'insert into event_notes(event_seq, session_ym, %I, updated_by) values ($1,$2,$3,$4) '
    'on conflict (event_seq) do update set %I=excluded.%I, updated_by=excluded.updated_by, '
    'session_ym=coalesce(event_notes.session_ym, excluded.session_ym)',
    p_field, p_field, p_field)
  using p_event_seq, p_session_ym, v_val, nullif(p_user,'');
  if coalesce(v_old,'') is distinct from coalesce(v_val,'') then
    insert into event_note_log(event_seq, field, old_value, new_value, changed_by)
    values (p_event_seq, p_field, v_old, v_val, nullif(p_user,''));
  end if;
end $$;

revoke all on function event_note_set(bigint,text,text,text,text) from public;
grant execute on function event_note_set(bigint,text,text,text,text) to authenticated;
