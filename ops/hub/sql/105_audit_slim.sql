-- ============================================================================
--  105_audit_slim.sql — 변경이력(audit_log) 비대화 차단 + 오래된 이력 정리
-- ----------------------------------------------------------------------------
--  문제(2026-08 측정): audit_log 240,409행 · 178MB = DB 전체(222MB)의 80%.
--    그 99%가 **방배정 자동배정**이다. 자동배정은 화면을 열 때마다 그 기간 배정을
--    통째로 지우고 다시 넣으므로(1,437행) 하루 2만 행씩 쌓인다.
--    이 속도면 1년에 약 900만 행·7GB → Supabase Pro 한도(8GB)에 닿는다.
--  대책:
--    ① audit_row(): rooms 의 **assign_source='auto'** 변경은 이력에서 제외.
--       사람이 한 수기 배정·이동·해제(manual)만 남긴다.
--       ※ 자동배정 자체의 요약("N명 재배치")은 change_log(entity=room_assign)에
--          이미 1건으로 남으므로 추적성은 그대로다.
--    ② audit_prune(p_months): 오래된 이력 삭제(기본 6개월). 수동/주기 실행.
--  멱등(create or replace). ⚠ Supabase SQL Editor 수동 실행(또는 MCP). 104 이후.
-- ============================================================================

create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_user text;
  v_pkcol text := TG_ARGV[0];
  v_pk text;
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
begin
  -- ① 자동배정(rooms.assign_source='auto')은 기록하지 않는다 — 재배치 잡음이 이력을 덮는다
  if TG_TABLE_NAME = 'rooms' then
    if TG_OP = 'INSERT' and (to_jsonb(NEW)->>'assign_source') = 'auto' then return NEW; end if;
    if TG_OP = 'DELETE' and (to_jsonb(OLD)->>'assign_source') = 'auto' then return OLD; end if;
    if TG_OP = 'UPDATE'
       and (to_jsonb(OLD)->>'assign_source') = 'auto'
       and (to_jsonb(NEW)->>'assign_source') = 'auto' then return NEW; end if;
  end if;

  begin
    v_user := coalesce(
      nullif(current_setting('request.jwt.claims', true),'')::json->>'email',
      nullif(current_setting('request.jwt.claims', true),'')::json->>'sub',
      'system');
  exception when others then v_user := 'system'; end;

  if TG_OP='DELETE' then
    v_old := to_jsonb(OLD); v_pk := v_old->>v_pkcol;
    insert into audit_log(table_name,op,row_pk,changed_by,old_data)
      values (TG_TABLE_NAME,'DELETE',v_pk,v_user,v_old);
    return OLD;
  elsif TG_OP='INSERT' then
    v_new := to_jsonb(NEW); v_pk := v_new->>v_pkcol;
    insert into audit_log(table_name,op,row_pk,changed_by,new_data)
      values (TG_TABLE_NAME,'INSERT',v_pk,v_user,v_new);
    return NEW;
  else
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_pk := v_new->>v_pkcol;
    select coalesce(array_agg(ky),'{}') into v_changed
      from (select jsonb_object_keys(v_new) as ky) s
      where (v_new->ky) is distinct from (v_old->ky);
    if v_changed is null or v_changed <@ array['updated_at']::text[] then return NEW; end if;
    insert into audit_log(table_name,op,row_pk,changed_by,old_data,new_data,changed_fields)
      values (TG_TABLE_NAME,'UPDATE',v_pk,v_user,v_old,v_new,v_changed);
    return NEW;
  end if;
end $$;

-- ② 오래된 이력 정리 — 기본 6개월. 삭제 건수를 반환한다.
--    돈·권한 관련 테이블은 더 오래 남긴다(정산 분쟁 대비 24개월).
create or replace function audit_prune(p_months int default 6)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_n bigint;
begin
  if not (select coalesce(role,'')='admin' from user_access where user_id=auth.uid() and active) then
    raise exception '권한 없음(이력 정리는 마스터 전용)';
  end if;
  with del as (
    delete from audit_log
     where changed_at < now() - make_interval(months => greatest(p_months,1))
       and table_name not in ('charges','payments','folios','transactions','user_access','settle_deductions')
    returning 1)
  select count(*) into v_n from del;
  return v_n;
end $$;

revoke all on function audit_prune(int) from public;
grant execute on function audit_prune(int) to authenticated;
