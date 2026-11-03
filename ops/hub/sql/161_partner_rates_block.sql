-- ============================================================================
-- 161_partner_rates_block.sql — 수배 목록: ① 팀별 「호텔 블록 사용/사용 안 함」 ② 기간별 요금표(호텔별·골프장별·송영·引率) (2026-11-03)
--
--  Min 2026-11-02: 「수배서에 호텔 블럭은 사용, 사용안함 체크란이 없네」
--                  「요금표는 호텔, 골프장, 송영 모두 각각 잡아야하고 기간마다 다를 수 있어서 기간마다 설정 ·
--                   2~3월 평일 요금, 주말 요금 뭐 이런 식이던지, 그 안에 또 요금이 다를 수 있고」
--  ① partner_ops.use_block — 기본 true(블록 호텔이면 블록에서 씀). false=별도 예약·블록 외 → 블록 띠·블록 초과 판정·검수 ㉓ 에서 제외.
--  ② partner_rates — 1행 = (종류 kind: hotel/golf/transfer/guide) × (대상 ref_id: 호텔·코스·차량 id, null=공통) × (기간 from/to, null=상시) → prices jsonb
--       hotel:{twin:{wk,hi},single:{wk,hi},triple:{wk,hi}} / golf:{wk,sat,sun} / transfer:{day}(1대·1일) / guide:{day,last}
--     해석(SZCore.partnerPrice): 대상 지정 > 공통 · 좁은 기간 > 넓은 기간(상시가 가장 넓음) · 같으면 최근 행 — 칸(키) 단위 폴백.
--     숫자(요금)는 화면 「기본 설정 › 요금표」에서 DB 에만 넣는다(저장소 §3-2). 옛 partner_settings.rates(공통 한 벌)는 행이 없을 때 폴백.
--  ③ data_audit 짝 갱신(§3-3): ㉓ partner_block_over 가 use_block 을 보고 · ㉔ partner_single_norate 가 partner_rates 의 싱글 요금(호텔별·공통, 체류 기간 겹침)도 본다.
--  RLS: partner_rates = 등록표와 같음(읽기 partner 키 보기 이상 · 쓰기 partner 키 수정 또는 마스터 · anon 없음). RPC 추가 없음(anon secdef 15 유지).
--  멱등. 적용: Supabase MCP(Min 「sql 161 적용해」) 또는 SQL Editor. 00_VERIFY 161.
-- ============================================================================

-- ① 블록 사용 여부(팀별)
alter table public.partner_ops add column if not exists use_block boolean not null default true;

-- ② 기간별 요금표
create table if not exists public.partner_rates (
  id          serial primary key,
  kind        text not null check (kind in ('hotel','golf','transfer','guide')),
  ref_id      integer,                                     -- hotel: partner_hotels.id / golf: partner_courses.id / transfer: partner_vehicles.id / null=공통
  label       text,                                        -- 기간 이름(예 「2〜3月」) — 같은 label·from·to 가 한 「기간」
  from_date   date,
  to_date     date,
  prices      jsonb not null default '{}'::jsonb,
  note        text,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint partner_rates_period_chk check (from_date is null or to_date is null or from_date <= to_date)
);
create index if not exists partner_rates_kind_idx on public.partner_rates(kind, ref_id);

drop trigger if exists partner_rates_updated on public.partner_rates;
create trigger partner_rates_updated before update on public.partner_rates for each row execute function public.set_updated_at();

alter table public.partner_rates enable row level security;
revoke all on public.partner_rates from anon;
grant select, insert, update, delete on public.partner_rates to authenticated;
grant usage, select on sequence public.partner_rates_id_seq to authenticated;
revoke all on sequence public.partner_rates_id_seq from anon;
drop policy if exists partner_rates_sel on public.partner_rates;
create policy partner_rates_sel on public.partner_rates for select to authenticated using (is_admin() or has_any_read_area(array['partner']));
drop policy if exists partner_rates_ins on public.partner_rates;
create policy partner_rates_ins on public.partner_rates for insert to authenticated with check (is_admin() or has_any_area(array['partner']));
drop policy if exists partner_rates_upd on public.partner_rates;
create policy partner_rates_upd on public.partner_rates for update to authenticated using (is_admin() or has_any_area(array['partner'])) with check (is_admin() or has_any_area(array['partner']));
drop policy if exists partner_rates_del on public.partner_rates;
create policy partner_rates_del on public.partner_rates for delete to authenticated using (is_admin() or has_any_area(array['partner']));

-- ③ data_audit 짝 갱신 — 적용본 텍스트 치환(160 이 넣은 블록 안), 이미 반영돼 있으면 건너뜀(멱등)
do $do$
declare d text;
begin
  if to_regprocedure('public.data_audit()') is null then raise notice 'data_audit() 없음 — 건너뜀'; return; end if;
  d := pg_get_functiondef('public.data_audit()'::regprocedure);
  if d not like '%''partner_block_over''%' then raise notice 'data_audit: 160 블록 없음 — 160 먼저'; return; end if;
  if d like '%coalesce(o.use_block,true)%' and d like '%partner_rates r%' then raise notice 'data_audit: 161 already applied'; return; end if;
  -- ㉓ 블록 초과: use_block=false 팀은 세지 않는다(3곳 동일 문장)
  d := replace(d,
    'where o.hotel_id=h.id and b.status is distinct from ''대기'' and b.seg_from <= dd::date and b.seg_to > dd::date',
    'where o.hotel_id=h.id and coalesce(o.use_block,true) and b.status is distinct from ''대기'' and b.seg_from <= dd::date and b.seg_to > dd::date');
  -- ㉔ 싱글 요금 미정: 기본값(partner_defaults.single_rate)도 없고, 체류 기간에 걸치는 호텔별/공통 싱글 요금 행도 없을 때만(2곳 동일 문장)
  d := replace(d,
    'and coalesce((select nullif(value->>''single_rate'','''')::int from partner_settings where key=''partner_defaults''), 0) = 0',
    'and coalesce((select nullif(value->>''single_rate'','''')::int from partner_settings where key=''partner_defaults''), 0) = 0'
    || ' and not exists (select 1 from partner_rates r where r.kind=''hotel'' and (r.ref_id is null or r.ref_id=o.hotel_id)'
    || ' and (r.from_date is null or r.from_date < b.seg_to) and (r.to_date is null or r.to_date >= b.seg_from)'
    || ' and (coalesce(nullif(r.prices->''single''->>''wk'','''')::int,0) > 0 or coalesce(nullif(r.prices->''single''->>''hi'','''')::int,0) > 0))');
  execute d;
end $do$;

-- 확인
-- select column_name from information_schema.columns where table_schema='public' and table_name='partner_ops' and column_name='use_block';   -- use_block
-- select count(*) from pg_policies where tablename='partner_rates';                                                                      -- 4
-- select has_table_privilege('anon','public.partner_rates','select');                                                                   -- false
-- select prosrc like '%coalesce(o.use_block,true)%' and prosrc like '%partner_rates r%' from pg_proc where proname='data_audit';        -- true
-- select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'execute');  -- 15 (불변)
