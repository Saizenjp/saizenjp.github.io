-- ============================================================================
--  186_dup_index_cleanup.sql — 같은 표·같은 열에 두 벌 있는 인덱스 5곳에서 한 벌 지우기
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  왜
--   22차 검수(D3 — docs/audit-2026-11.md 「결정되면 작성할 것」 8번)에서 운영 DB 에 같은 표·같은 열·같은 조건의
--   인덱스가 두 벌씩 있는 곳이 5곳 나왔다. 옛 파일과 뒤 파일이 이름만 다르게 같은 인덱스를 만들었거나(01↔06 · 26↔101),
--   PK·유일 제약이 이미 만든 인덱스 위에 조회용을 한 벌 더 만들었다(01↔79 · 62). 조회 결과·속도는 같고,
--   쓰기마다 두 벌을 고치고 공간만 더 쓴다 → 동작 영향 없이 한 벌을 지운다.
--
--     표            지우는 쪽                남기는 쪽                        만든 파일(지우는 쪽 ↔ 남기는 쪽)
--     charges       idx_charges_cat          idx_charges_category             저장소에 없음(DB 에서 직접 만든 것) ↔ 09
--     golf_groups   idx_golf_groups_event    golf_groups_event_seq_idx        26 ↔ 101
--     member_codes  idx_member_codes_key     member_codes_pkey (PK)           01 ↔ 79(PK 를 member_key 하나로 바꿨다)
--     rooms         idx_rooms_event          idx_rooms_event_seq              01 ↔ 06
--     order_tokens  idx_order_tokens_token   order_tokens_token_key (유일)    62 ↔ 62(token text unique)
--   남기는 쪽 고른 기준: PK·유일 제약에 묶인 인덱스는 반드시 남긴다(지우면 제약이 사라진다 — member_codes·order_tokens).
--   둘 다 조회용이면 저장소에 기록 파일이 있는 쪽(charges) · 뒤 번호 파일이 만든 쪽(golf_groups 101 · rooms 06)을 남긴다.
--
--  어떻게(줄마다 따로 판단 — 한 줄을 건너뛰어도 나머지는 진행)
--   지우기 전에 아래를 확인하고, 하나라도 어긋나면 그 줄은 알림(notice)만 남기고 건너뛴다.
--    · 지울 인덱스가 그 표에 실제로 있다(없으면 = 이미 지웠다 → 건너뜀. 다시 실행해도 같은 결과 = 멱등).
--    · 지울 인덱스가 PK·유일·배제·복제 식별(replica identity) 인덱스가 아니고, 어떤 제약(PK·유일·외래키 참조)에도 묶여 있지 않다.
--    · 같은 표에 「같은 열(순서·INCLUDE 포함)·같은 연산자 클래스·정렬 옵션·콜레이션·같은 식·같은 조건(부분 인덱스 where)·
--      같은 방식(btree 등)」의 다른 인덱스가 실제로 남아 있고 쓸 수 있는 상태(valid·ready·live)다.
--      위 표의 남기는 쪽이 아니어도 이 조건을 채우는 다른 인덱스가 있으면 그것을 남은 쪽으로 보고 알림에 이름을 적는다.
--   지우기 = drop index if exists(멱등). cascade 를 쓰지 않는다(무엇이 묶여 있으면 지우지 않고 오류로 멈춘다).
--   잠금: drop index 는 그 표를 잠깐 배타 잠금한다(다섯 표 모두 작다 — 순식간). 다른 작업이 표를 오래 잡고 있을 때
--         POS·방배정 저장이 줄줄이 기다리지 않게 lock_timeout 5초(이 트랜잭션 안에서만). 넘으면 오류로 멈추고
--         MCP apply_migration·SQL Editor 처럼 한 트랜잭션이면 아무것도 지워지지 않는다 → 잠시 뒤 다시 실행.
--         (drop index concurrently 는 트랜잭션·do 블록 안에서 쓸 수 없어 이 적용 방식에 맞지 않는다.)
--
--  하지 않는 것: 옛 정산 뷰 3개·빈 컬럼 2개 삭제(이번에 지우지 않는다) · 남기는 인덱스·PK·유일 제약 변경 ·
--               함수·정책·권한·데이터 변경(anon 이 실행할 수 있는 security definer 함수 수 15 그대로).
--  ⚠ 01·26·62 를 다시 실행하면 지운 인덱스가 다시 생긴다(해롭지는 않지만 중복이 돌아온다 — 옛 파일은 통째로 다시 실행하지 않는다).
--  멱등. 다른 번호와 순서 상관없음.
--
--  적용 전에 떠 두기(대조 + 되돌릴 때 그대로 쓴다 — 읽기 전용):
--    select tablename, indexname, indexdef from pg_indexes where schemaname = 'public'
--     and indexname in ('idx_charges_cat','idx_charges_category','idx_golf_groups_event','golf_groups_event_seq_idx',
--                       'idx_member_codes_key','member_codes_pkey','idx_rooms_event','idx_rooms_event_seq',
--                       'idx_order_tokens_token','order_tokens_token_key')
--     order by 1, 2;
--  되돌리는 법: 떠 둔 지우는 쪽 5개의 indexdef 를 그대로 실행한다. 떠 둔 것이 없으면
--    create index if not exists idx_charges_cat        on public.charges(category);
--    create index if not exists idx_golf_groups_event  on public.golf_groups(event_seq);
--    create index if not exists idx_member_codes_key   on public.member_codes(member_key);
--    create index if not exists idx_rooms_event        on public.rooms(event_seq);
--    create index if not exists idx_order_tokens_token on public.order_tokens(token);
-- ============================================================================

do $cleanup$
declare
  r       record;
  v_tbl   regclass;
  v_idx   oid;
  v_bound text;
  v_keep  text;
  v_drop  int := 0;
  v_skip  int := 0;
begin
  -- 표를 오래 잡은 작업이 있으면 기다리지 않고 멈춘다(이 트랜잭션 안에서만)
  perform set_config('lock_timeout', '5s', true);

  for r in
    select * from (values
      (1, 'charges',      'idx_charges_cat',        'idx_charges_category'),
      (2, 'golf_groups',  'idx_golf_groups_event',  'golf_groups_event_seq_idx'),
      (3, 'member_codes', 'idx_member_codes_key',   'member_codes_pkey'),
      (4, 'rooms',        'idx_rooms_event',        'idx_rooms_event_seq'),
      (5, 'order_tokens', 'idx_order_tokens_token', 'order_tokens_token_key')
    ) as t(ord, tbl, drop_name, keep_name)
    order by ord
  loop
    -- ① 지울 인덱스가 그 표에 있는가
    v_tbl := to_regclass(format('public.%I', r.tbl));
    v_idx := null;
    if v_tbl is not null then
      select i.indexrelid into v_idx
        from pg_index i
        join pg_class c on c.oid = i.indexrelid
       where i.indrelid = v_tbl
         and c.relnamespace = 'public'::regnamespace
         and c.relname::text = r.drop_name;
    end if;
    if v_idx is null then
      raise notice '186 건너뜀: %.% 없음(이미 지웠거나 표가 없다)', r.tbl, r.drop_name;
      v_skip := v_skip + 1;
      continue;
    end if;

    -- ② 제약에 묶인 인덱스는 지우지 않는다
    select case
             when i.indisprimary   then 'PK 인덱스'
             when i.indisunique    then '유일 인덱스'
             when i.indisexclusion then '배제 인덱스'
             when i.indisreplident then '복제 식별 인덱스'
             when exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
               then '제약에 묶임(' || (select string_agg(k.conname::text, ', ') from pg_constraint k where k.conindid = i.indexrelid) || ')'
           end
      into v_bound
      from pg_index i
     where i.indexrelid = v_idx;
    if v_bound is not null then
      raise notice '186 건너뜀: %.% — % 라서 지우지 않는다', r.tbl, r.drop_name, v_bound;
      v_skip := v_skip + 1;
      continue;
    end if;

    -- ③ 같은 표·같은 열·같은 조건의 다른 인덱스가 실제로 남아 있는가(표에 적은 남길 쪽을 먼저, 다음 PK·유일)
    select c2.relname::text into v_keep
      from pg_index i1
      join pg_class c1 on c1.oid = i1.indexrelid
      join pg_index i2 on i2.indrelid = i1.indrelid and i2.indexrelid <> i1.indexrelid
      join pg_class c2 on c2.oid = i2.indexrelid
     where i1.indexrelid = v_idx
       and c2.relam = c1.relam
       and i2.indnatts = i1.indnatts
       and i2.indnkeyatts = i1.indnkeyatts
       and i2.indkey::text = i1.indkey::text
       and i2.indclass::text = i1.indclass::text
       and i2.indcollation::text = i1.indcollation::text
       and i2.indoption::text = i1.indoption::text
       and pg_get_expr(i2.indexprs, i2.indrelid) is not distinct from pg_get_expr(i1.indexprs, i1.indrelid)
       and pg_get_expr(i2.indpred,  i2.indrelid) is not distinct from pg_get_expr(i1.indpred,  i1.indrelid)
       and i2.indisvalid and i2.indisready and i2.indislive
     order by (c2.relname::text = r.keep_name) desc, i2.indisprimary desc, i2.indisunique desc, c2.relname::text
     limit 1;
    if v_keep is null then
      raise notice '186 건너뜀: %.% — 같은 열·같은 조건의 다른 인덱스가 없다(지우면 조회 인덱스가 사라진다)', r.tbl, r.drop_name;
      v_skip := v_skip + 1;
      continue;
    end if;

    -- ④ 지운다
    execute format('drop index if exists public.%I', r.drop_name);
    v_drop := v_drop + 1;
    if v_keep = r.keep_name then
      raise notice '186 지움: %.% (남은 같은 인덱스 = %)', r.tbl, r.drop_name, v_keep;
    else
      raise notice '186 지움: %.% (남은 같은 인덱스 = % — 표에 적은 % 가 아니다)', r.tbl, r.drop_name, v_keep, r.keep_name;
    end if;
  end loop;

  raise notice '186 끝: 지움 %개 · 건너뜀 %개', v_drop, v_skip;
end
$cleanup$;

-- 확인(읽기 전용): 지울 쪽 0행 · 남길 쪽 5행
--   select indexname from pg_indexes where schemaname = 'public'
--    and indexname in ('idx_charges_cat','idx_golf_groups_event','idx_member_codes_key','idx_rooms_event','idx_order_tokens_token');
--   select indexname from pg_indexes where schemaname = 'public'
--    and indexname in ('idx_charges_category','golf_groups_event_seq_idx','member_codes_pkey','idx_rooms_event_seq','order_tokens_token_key');
