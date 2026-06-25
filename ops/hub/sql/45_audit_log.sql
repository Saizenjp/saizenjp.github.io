-- ============================================================================
--  45_audit_log.sql — 전 카드 공통 서버 자동 감사(변경 이력)
-- ----------------------------------------------------------------------------
--  주요 운영·금전 테이블의 모든 INSERT/UPDATE/DELETE를 audit_log에 자동 기록.
--   · 클라이언트(페이지/PC)와 무관 → 우회 불가, 다중 사용자 추적에 안전.
--   · 누가(changed_by=JWT email/uid)·언제·op·이전(old)·이후(new)·바뀐 컬럼.
--   · old/new = 민감(금전·PII) → audit_log 직접 읽기는 admin/manager만.
--     일반 사용자는 audit_feed() RPC로 '누가 무슨 필드를 언제'만 조회(값 비노출).
--   · step1 대량 테이블(bookings/passengers/guests/guest_members)·event_notes·
--     menu_items·inv_txns는 이미 전용 로그(import_log/event_note_log/change_log/원장) → 제외.
--  멱등 재실행 가능. ⚠ Supabase SQL Editor 수동 실행.
-- ============================================================================

create table if not exists audit_log (
  id             bigint generated always as identity primary key,
  table_name     text        not null,
  op             text        not null,          -- INSERT / UPDATE / DELETE
  row_pk         text,                           -- 대상 행 PK(텍스트)
  changed_by     text,                           -- JWT email/uid (없으면 system)
  changed_at     timestamptz not null default now(),
  old_data       jsonb,
  new_data       jsonb,
  changed_fields text[]                          -- UPDATE 시 바뀐 컬럼
);
create index if not exists idx_audit_log_tbl_pk on audit_log(table_name, row_pk, changed_at desc);
create index if not exists idx_audit_log_at      on audit_log(changed_at desc);

-- ── 감사 트리거 함수 (PK 컬럼명을 인자로 받음) ──
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_user text;
  v_pkcol text := TG_ARGV[0];
  v_pk text;
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
begin
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
    -- 의미없는 변경(updated_at만) 스킵
    if v_changed is null or v_changed <@ array['updated_at']::text[] then return NEW; end if;
    insert into audit_log(table_name,op,row_pk,changed_by,old_data,new_data,changed_fields)
      values (TG_TABLE_NAME,'UPDATE',v_pk,v_user,v_old,v_new,v_changed);
    return NEW;
  end if;
end $$;

-- ── 대상 테이블에 트리거 부착(테이블,PK) ──
do $$
declare r record;
begin
  for r in select * from (values
    ('rooms','id'),('room_inventory','id'),('room_closures','id'),
    ('print_overrides','event_seq'),('dinner_addons','id'),
    ('folios','id'),('charges','id'),('payments','id'),('transactions','id'),
    ('dining','id'),('rounds','id'),
    ('settle_remarks','event_seq'),('settle_deductions','id'),
    ('announcements','id'),('inv_items','id'),('kitchen_tickets','id'),
    ('user_access','user_id'),('member_codes','member_key')
  ) as t(tbl,pk) loop
    if to_regclass('public.'||r.tbl) is null then continue; end if;
    execute format('drop trigger if exists trg_audit_%I on public.%I', r.tbl, r.tbl);
    execute format('create trigger trg_audit_%I after insert or update or delete on public.%I for each row execute function audit_row(%L)', r.tbl, r.tbl, r.pk);
  end loop;
end $$;

-- ── RLS: 전체(값 포함) 직접 읽기는 admin/manager만. 트리거(definer)가 insert. 불변. ──
alter table audit_log enable row level security;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='audit_log' loop
    execute format('drop policy if exists %I on public.audit_log', pol.policyname);
  end loop;
  execute 'create policy audit_log_sel on public.audit_log for select to authenticated using (has_any_area(array[]::text[]))';
  -- insert/update/delete 정책 없음 → API 직접 쓰기·수정·삭제 불가(트리거만 기록)
end $$;

-- ── 안전 조회 RPC: 값(old/new) 제외, '누가 무슨 필드를 언제'만 — 로그인 전체 ──
create or replace function audit_feed(p_table text default null, p_row_pk text default null, p_limit int default 40, p_offset int default 0)
returns table(id bigint, table_name text, op text, row_pk text, changed_by text, changed_at timestamptz, changed_fields text[])
language sql security definer set search_path=public as $$
  select id, table_name, op, row_pk, changed_by, changed_at, changed_fields
  from audit_log
  where (p_table is null or table_name = any(string_to_array(p_table, ',')))
    and (p_row_pk is null or row_pk = p_row_pk)
  order by changed_at desc, id desc
  limit greatest(1, least(p_limit,200)) offset greatest(0,p_offset);
$$;
revoke all on function audit_feed(text,text,int,int) from public;
grant execute on function audit_feed(text,text,int,int) to authenticated;
