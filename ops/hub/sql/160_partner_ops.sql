-- ============================================================================
-- 160_partner_ops.sql — 구마모토 시내·트라이얼 「수배 목록(手配リスト)」: 수배 정보·골프 일정·배차·기본값 등록 (2026-11-02)
--
--  Min 2026-11-02: 현지(자회사) 담당 회사가 쓰던 월별 수배서 목록(xlsx: 1행=1팀, 호텔·골프장·항공·명단 송부·청구서 체크)을
--                  「이 파일 그대로가 아닌 우리 스타일에 맞게 — 안 봐도 되는 건 빼고, 꼭 봐야 하는 건 맞춰서, 기본값은 넣을 수 있게」.
--                  차량=하이에스 3·마이크로버스 1(증설 가능) · 담당 3명 · 호텔 블록=워싱턴 트윈 4·아마넥 트윈 4(밤마다) ·
--                  싱글 블록은 없고 싱글 이용 시 요금을 정해야 함 · 타 여행사 팀도 엠클릭에 넣어 메리트투어가 함께 관리(여행사 명은 따로 적음).
--  파일 자체(금액·이름 포함)는 저장소에 두지 않는다(§3-2) — 열 대응은 docs/partner-ops.md.
--
--  ① partner_bookings.agency — 여행사(판매처). step1 이 엠클릭 값으로 채운다(SZCore.partnerAgency: 명시 열 → 비고 「여행사: ○○」 → 상품명 「여행사」 접두 → 메리트투어).
--  ② 등록표(기본값, 화면에서 수정): partner_hotels(블록 트윈 수·기간) · partner_courses · partner_vehicles(정원) · partner_staff · partner_settings(싱글 요금 기본값 등 jsonb)
--  ③ partner_ops   — 팀별 수배 정보 1행(호텔·객실 수·싱글 요금·담당·여행사 수정값·묶음·메모 + 명단/일정표/청구서 체크 4종의 시각·담당)
--  ④ partner_golf  — 팀별 골프 일정(날짜·코스·티타임·비고·명단 송부). 기본 = 묵는 밤마다 1라운드(「3색 골프」) — 화면이 빈 줄을 미리 만든다.
--  ⑤ partner_dispatch — 배차(날짜·팀·구간 in/golf_out/golf_back/out/other·시각·차량·담당). 화면이 항공편·티타임으로 제안, 저장은 담당자.
--  RLS: 등록표 = 읽기 partner 키(자식 포함, 보기 포함) · 쓰기 partner 키(수정) 또는 마스터.
--       팀별 표 = partner_bookings 의 brand 로 — 읽기 partner_<brand> 보기 이상 · 쓰기 partner_<brand> 수정 또는 마스터. anon 없음(RPC 추가 없음, anon secdef 15 유지).
--  ⑤' 요금: 현지 요금표(新料金 2026.12·日別 料金表)의 구조를 SZCore.partnerQuote 로 — 밤마다 호텔(wk/hi)+라운드 골프(wk/sat/sun)+引率(day/last)+호텔 가산+1인 가산.
--      숫자(요금표)는 partner_settings.rates 에 화면에서 입력(저장소·SQL 에 두지 않는다). 팀별 확정 요금 메모·1인 가산은 partner_ops.
--  ⑥ data_audit 짝(§3-3): partner_block_over(블록 초과 밤) · partner_single_norate(싱글 있는데 요금 미정) — 화면 빨간 표시와 같은 수.
--  멱등(if not exists / on conflict / drop policy if exists). 00_VERIFY 160.
--  ✅ 적용 완료 2026-11-02(Min 「sql 160 적용해」 → MCP apply_migration). 검증: partner_% 표 10 · 정책 32(8표×4) · anon select 불가 · anon secdef 15 유지 ·
--     seed 호텔 5/골프장 6/차량 4/설정 2 · agency 컬럼 · data_audit ㉓㉔ 포함 · updated_at 트리거 · 시퀀스 authenticated 6/anon 0.
--     롤백 드라이런: 삽입 1/1/1 · 트리거 동작 · leg 체크 거부 · ㉓ 블록 초과 4밤(=기대) · ㉔ 싱글 미정 1(=기대) · cascade 0/0/0 · RLS(마스터 5행 / partner 없는 직원 0행·쓰기 거부 / partner 권한자 5행·쓰기 허용).
-- ============================================================================

-- ① 여행사
alter table public.partner_bookings add column if not exists agency text;

-- ② 등록표(기본값)
create table if not exists public.partner_hotels (
  id          serial primary key,
  name_ja     text not null unique,
  name_ko     text,
  block_twin  integer not null default 0,                 -- 밤마다 확보된 트윈 블록 수(0=블록 없음, 그때그때 예약)
  block_from  date,                                       -- 블록 기간(없으면 상시)
  block_to    date,
  surcharge   integer not null default 0,                 -- 이 호텔 1인·1박 가산(円) — 요금표 「○○は+1,000」 류. 숫자는 화면에서(저장소엔 없음)
  note        text,
  active      boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.partner_hotels add column if not exists surcharge integer not null default 0;
create table if not exists public.partner_courses (
  id          serial primary key,
  name_ja     text not null unique,
  name_ko     text,
  note        text,
  active      boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists public.partner_vehicles (
  id          serial primary key,
  name        text not null unique,
  capacity    integer not null default 9,                 -- 손님 정원(기사 제외)
  note        text,
  active      boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists public.partner_staff (
  id          serial primary key,
  name        text not null unique,
  active      boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists public.partner_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- ③ 팀별 수배 정보
create table if not exists public.partner_ops (
  event_seq        bigint primary key references public.partner_bookings(event_seq) on delete cascade,
  agency           text,                                  -- 담당자 수정값(없으면 partner_bookings.agency)
  staff            text,                                  -- 担当者(partner_staff 이름)
  hotel_id         integer references public.partner_hotels(id) on delete set null,
  hotel_note       text,                                  -- 등록 외 호텔·객실 특기
  twin             integer not null default 0,
  single           integer not null default 0,
  triple           integer not null default 0,
  single_rate      integer,                               -- 싱글 이용 1인·1박 요금(円) — 싱글이 있으면 반드시(Min). 비우면 partner_settings 기본값
  price_adj        integer not null default 0,            -- 1인 가산(円, 2バック 등 — 견적 SZCore.partnerQuote 에 더함)
  price_note       text,                                  -- 확정 요금 메모(견적과 다르게 합의한 금액 등)
  party            bigint,                                -- 묶음(같은 당사자로 움직이는 다른 예약) = 대표 event_seq
  memo             text,
  roster_hotel_at  timestamptz, roster_hotel_by text,     -- 호텔 名簿 송부
  roster_golf_at   timestamptz, roster_golf_by  text,     -- 골프장 名簿 송부
  itinerary_at     timestamptz, itinerary_by    text,     -- 日程表 송부
  invoiced_at      timestamptz, invoiced_by     text,     -- 請求書 발행
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ④ 골프 일정
create table if not exists public.partner_golf (
  id           bigserial primary key,
  event_seq    bigint not null references public.partner_bookings(event_seq) on delete cascade,
  play_date    date not null,
  course_id    integer references public.partner_courses(id) on delete set null,
  course_note  text,                                      -- 등록 외 코스 이름
  tee_time     text,                                      -- 'HH:MM' (복수면 'HH:MM,HH:MM')
  holes        text,                                      -- '18' | '27' | 'スルー' 등 자유
  note         text,
  roster_sent  boolean not null default false,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists partner_golf_seq_idx  on public.partner_golf(event_seq, play_date);
create index if not exists partner_golf_date_idx on public.partner_golf(play_date);

-- ⑤ 배차
create table if not exists public.partner_dispatch (
  id           bigserial primary key,
  trip_date    date not null,
  event_seq    bigint not null references public.partner_bookings(event_seq) on delete cascade,
  leg          text not null check (leg in ('in','golf_out','golf_back','out','other')),
  depart_time  text,                                      -- 'HH:MM'
  vehicle_id   integer references public.partner_vehicles(id) on delete set null,
  staff        text,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists partner_dispatch_date_idx on public.partner_dispatch(trip_date);
create index if not exists partner_dispatch_seq_idx  on public.partner_dispatch(event_seq);

-- updated_at 자동 갱신(공용 set_updated_at — updated_at 컬럼이 있는 표에만: 117 교훈)
do $t$
declare r record;
begin
  for r in select unnest(array['partner_hotels','partner_courses','partner_vehicles','partner_staff','partner_settings','partner_ops','partner_golf','partner_dispatch']) as tbl loop
    execute format('drop trigger if exists %I_updated on public.%I', r.tbl, r.tbl);
    execute format('create trigger %I_updated before update on public.%I for each row execute function public.set_updated_at()', r.tbl, r.tbl);
  end loop;
end $t$;

-- RLS
do $r$
declare r record;
begin
  for r in select unnest(array['partner_hotels','partner_courses','partner_vehicles','partner_staff','partner_settings','partner_ops','partner_golf','partner_dispatch']) as tbl loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('revoke all on public.%I from anon', r.tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.tbl);
  end loop;
  -- 시퀀스(serial/bigserial)도 authenticated 가 써야 insert 가 된다
  for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='S' and c.relname like 'partner\_%' loop
    execute format('grant usage, select on sequence public.%I to authenticated', r.relname);
    execute format('revoke all on sequence public.%I from anon', r.relname);
  end loop;
end $r$;

-- 등록표·설정: 읽기 = partner 키(보기 포함·자식 포함) / 쓰기 = partner 키(수정) 또는 마스터
do $p$
declare r record;
begin
  for r in select unnest(array['partner_hotels','partner_courses','partner_vehicles','partner_staff','partner_settings']) as tbl loop
    execute format('drop policy if exists %I_sel on public.%I', r.tbl, r.tbl);
    execute format('create policy %I_sel on public.%I for select to authenticated using (is_admin() or has_any_read_area(array[''partner'']))', r.tbl, r.tbl);
    execute format('drop policy if exists %I_ins on public.%I', r.tbl, r.tbl);
    execute format('create policy %I_ins on public.%I for insert to authenticated with check (is_admin() or has_any_area(array[''partner'']))', r.tbl, r.tbl);
    execute format('drop policy if exists %I_upd on public.%I', r.tbl, r.tbl);
    execute format('create policy %I_upd on public.%I for update to authenticated using (is_admin() or has_any_area(array[''partner''])) with check (is_admin() or has_any_area(array[''partner'']))', r.tbl, r.tbl);
    execute format('drop policy if exists %I_del on public.%I', r.tbl, r.tbl);
    execute format('create policy %I_del on public.%I for delete to authenticated using (is_admin() or has_any_area(array[''partner'']))', r.tbl, r.tbl);
  end loop;
  -- 팀별 표: partner_bookings 의 brand 로(partner_<brand>; 부모 partner 보유자는 area_expand 로 자동)
  for r in select unnest(array['partner_ops','partner_golf','partner_dispatch']) as tbl loop
    execute format('drop policy if exists %I_sel on public.%I', r.tbl, r.tbl);
    execute format($q$create policy %I_sel on public.%I for select to authenticated
      using (exists (select 1 from public.partner_bookings b where b.event_seq = %I.event_seq
                      and (is_admin() or has_any_read_area(array['partner_' || b.brand]))))$q$, r.tbl, r.tbl, r.tbl);
    execute format('drop policy if exists %I_ins on public.%I', r.tbl, r.tbl);
    execute format($q$create policy %I_ins on public.%I for insert to authenticated
      with check (exists (select 1 from public.partner_bookings b where b.event_seq = %I.event_seq
                      and (is_admin() or has_any_area(array['partner_' || b.brand]))))$q$, r.tbl, r.tbl, r.tbl);
    execute format('drop policy if exists %I_upd on public.%I', r.tbl, r.tbl);
    execute format($q$create policy %I_upd on public.%I for update to authenticated
      using (exists (select 1 from public.partner_bookings b where b.event_seq = %I.event_seq
                      and (is_admin() or has_any_area(array['partner_' || b.brand]))))
      with check (exists (select 1 from public.partner_bookings b where b.event_seq = %I.event_seq
                      and (is_admin() or has_any_area(array['partner_' || b.brand]))))$q$, r.tbl, r.tbl, r.tbl, r.tbl);
    execute format('drop policy if exists %I_del on public.%I', r.tbl, r.tbl);
    execute format($q$create policy %I_del on public.%I for delete to authenticated
      using (exists (select 1 from public.partner_bookings b where b.event_seq = %I.event_seq
                      and (is_admin() or has_any_area(array['partner_' || b.brand]))))$q$, r.tbl, r.tbl, r.tbl);
  end loop;
end $p$;

-- seed(기본값 — 화면에서 고친다. 이미 있으면 그대로)
insert into public.partner_hotels(name_ja, name_ko, block_twin, sort) values
  ('ワシントンホテル', '워싱턴 호텔', 4, 1),
  ('アマネクホテル',   '아마넥 호텔', 4, 2),
  ('ホテルタウ',       '호텔 타우',   0, 3),
  ('相鉄ホテル',       '소테츠 호텔', 0, 4),
  ('カンデオホテル',   '칸데오 호텔', 0, 5)
on conflict (name_ja) do nothing;
insert into public.partner_courses(name_ja, name_ko, sort) values
  ('グランドチャンピオンゴルフクラブ', '그랜드 챔피언', 1),
  ('熊本中央カントリークラブ',         '구마모토 츄오', 2),
  ('阿蘇グリーンヒルカントリークラブ', '그린힐',        3),
  ('KAOゴルフ倶楽部',                  'KAO CC',       4),
  ('阿蘇トライアル',                   '아소 트라이얼', 5),
  ('南阿蘇トライアル',                 '미나미아소 트라이얼', 6)
on conflict (name_ja) do nothing;
insert into public.partner_vehicles(name, capacity, sort) values
  ('ハイエース 1', 9, 1), ('ハイエース 2', 9, 2), ('ハイエース 3', 9, 3), ('マイクロバス', 25, 4)
on conflict (name) do nothing;
insert into public.partner_settings(key, value) values ('partner_defaults', '{}'::jsonb) on conflict (key) do nothing;
-- 요금표(2026-12 新料金 구조, 숫자는 화면 「基本設定 › 料金表」에서 입력 — 저장소엔 두지 않는다 §3-2):
--   hotel.twin/single/triple = {wk, hi}(1인·1박, hi=금·토·일·祝日·祝前日 밤) · golf = {wk, sat, sun}(1라운드) · guide = {day, last}(引率 1일·귀국일) · bags = {wk, hi}(2バック 참고)
insert into public.partner_settings(key, value) values ('rates', '{}'::jsonb) on conflict (key) do nothing;

-- ⑥ data_audit 짝(§3-3) — 적용본 data_audit() 의 `return res;` 앞에 끼워 넣는다(이미 있으면 건너뜀, 멱등)
do $do$
declare d text; blk text;
begin
  if to_regprocedure('public.data_audit()') is null then raise notice 'data_audit() 없음 — 건너뜀'; return; end if;
  d := pg_get_functiondef('public.data_audit()'::regprocedure);
  if d like '%''partner_block_over''%' then raise notice 'data_audit: partner_block_over already present'; return; end if;
  blk := $blk$
  -- ㉓ 구마모토 시내·트라이얼 호텔 블록 초과 밤 (160) — 화면 블록 띠의 빨간 칸과 같은 수(오늘 이후 120일)
  res := res || jsonb_build_object(
    'key','partner_block_over','sev','warn',
    'count',(select count(*) from (
        select h.id, dd::date
        from partner_hotels h
        cross join generate_series(v_today, v_today + 120, interval '1 day') dd
        where h.active and h.block_twin > 0
          and (h.block_from is null or dd::date >= h.block_from) and (h.block_to is null or dd::date <= h.block_to)
          and (select coalesce(sum(o.twin),0) from partner_ops o join partner_bookings b on b.event_seq=o.event_seq
                where o.hotel_id=h.id and b.status is distinct from '대기' and b.seg_from <= dd::date and b.seg_to > dd::date) > h.block_twin) t),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',0,'detail',detail)),'[]'::jsonb) from (
        select (h.name_ja||' '||to_char(dd::date,'MM/DD')||' ツイン '||
                (select coalesce(sum(o.twin),0) from partner_ops o join partner_bookings b on b.event_seq=o.event_seq
                  where o.hotel_id=h.id and b.status is distinct from '대기' and b.seg_from <= dd::date and b.seg_to > dd::date)::text||'/'||h.block_twin) as detail
        from partner_hotels h
        cross join generate_series(v_today, v_today + 120, interval '1 day') dd
        where h.active and h.block_twin > 0
          and (h.block_from is null or dd::date >= h.block_from) and (h.block_to is null or dd::date <= h.block_to)
          and (select coalesce(sum(o.twin),0) from partner_ops o join partner_bookings b on b.event_seq=o.event_seq
                where o.hotel_id=h.id and b.status is distinct from '대기' and b.seg_from <= dd::date and b.seg_to > dd::date) > h.block_twin
        order by dd limit 10) s)
  );
  -- ㉔ 싱글 이용인데 요금 미정 (160, Min 「싱글 이용할 경우 가격을 책정해야 해」) — 기본값(partner_settings.partner_defaults.single_rate)도 없을 때
  res := res || jsonb_build_object(
    'key','partner_single_norate','sev','warn',
    'count',(select count(*) from partner_ops o join partner_bookings b on b.event_seq=o.event_seq
              where o.single > 0 and o.single_rate is null and b.status is distinct from '대기' and b.seg_to >= v_today
                and coalesce((select nullif(value->>'single_rate','')::int from partner_settings where key='partner_defaults'), 0) = 0),
    'samples',(select coalesce(jsonb_agg(jsonb_build_object('event_seq',event_seq,'detail',detail)),'[]'::jsonb) from (
        select b.event_seq, (to_char(b.seg_from,'MM/DD')||' '||coalesce(b.rep_name,'')||' シングル '||o.single||'室') as detail
        from partner_ops o join partner_bookings b on b.event_seq=o.event_seq
        where o.single > 0 and o.single_rate is null and b.status is distinct from '대기' and b.seg_to >= v_today
          and coalesce((select nullif(value->>'single_rate','')::int from partner_settings where key='partner_defaults'), 0) = 0
        order by b.seg_from limit 10) s)
  );
$blk$;
  d := replace(d, E'  return res;\nend $function$', blk || E'  return res;\nend $function$');
  execute d;
end $do$;

-- 확인
-- select count(*) from information_schema.tables where table_schema='public' and table_name like 'partner\_%';            -- 10 (159 의 2 + 160 의 8)
-- select count(*) from pg_policies where tablename in ('partner_hotels','partner_courses','partner_vehicles','partner_staff','partner_settings','partner_ops','partner_golf','partner_dispatch');  -- 32
-- select has_table_privilege('anon','public.partner_ops','select');                                                       -- false
-- select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'execute');  -- 15 (불변)
-- select name_ja, block_twin from partner_hotels order by sort;  select name_ja from partner_courses order by sort;  select name, capacity from partner_vehicles order by sort;
