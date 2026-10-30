-- ============================================================================
-- 159_partner_products.sql — 자회사 상품 별도 원장(구마모토 시내호텔·트라이얼 리조트) + 권한 키 (2026-10-30)
--
--  Min 2026-10-30 「구마모토 시내 상품, 트라이얼 리조트 상품도 담당자를 따로 지정해서 별도 메뉴로 제작하고
--                  월별 체류 현황 같은 것을 볼 수 있게 — 자회사의 직원이 보는 거라 따로 메뉴를 만드는 것이 맞다」
--                 「별도 원장으로 진행해, 트라이얼은 「트라이얼」로 가정하고」
--  배경: 이 두 상품은 야마나미 권역 숙소(야마나미·쿠주·간지·시즈)가 아니라 step1 이 적재 단계에서 버리고 있었다(DB 에 없음).
--        야마나미 운영 표(bookings·guests·passengers)에 숙소 하나로 넣으면 手配書·송영·식수·B2B 청구·안내 모니터에 그 팀들이
--        섞여 들어가므로(2026-05 타 리조트 적재로 手配書 오염 전례) **별도 원장**에 적재하고 자회사 담당자만 본다.
--
--  ① partner_bookings — 팀(예약) 1행. 키=엠클릭 행사 일련번호(bookings.event_seq 와 같은 번호 체계).
--     ⚠ bookings 에 FK 를 두지 않는다 — 단독 상품은 bookings 에 없다. 콤보(「구마모토 시내호텔 3박 + 야마나미리조트 2박」)는
--       양쪽에 다 있고 combo=true, seg_from/seg_to 가 자회사 숙소에 묵는 구간(상품명 「N박」+순서로 산출 = SZCore.partnerSegment,
--       못 읽으면 예약 기간 전체 + seg_sure=false → 화면 「確認」).
--  ② partner_members — 개인 최소 정보(이름·영문명·성별·항공편·시각). 여권·생년·전화는 넣지 않는다(자회사 월간표에 불필요).
--  ③ RLS — 읽기: 마스터 또는 그 상품 키(partner_kumamoto / partner_trial — 부모 partner 보유자는 area_expand 로 자동) 또는 step1(적재·동기화)
--           쓰기: 마스터 또는 step1(데이터 등록 담당 — bookings 와 같은 규칙). anon 없음(모니터 노출 없음).
--  ④ area_tree 재시드(36행) — 부모 partner + 자식 partner_kumamoto·partner_trial(권한 관리 「자회사 상품」 줄, 상품별 담당자 지정).
--     seed 는 saizen-core.js AREA_TREE 와 같아야 한다(tests/saizen-core-areas.test.mjs 가 이 파일을 읽어 대조).
--  RPC 추가 없음(anon security definer 15 유지). 멱등(if not exists / drop policy if exists → create / on conflict).
--  적용: Supabase MCP(확인 프롬프트는 Min 승인) 또는 SQL Editor. 00_VERIFY 159.
-- ============================================================================

-- ① 팀 원장
create table if not exists public.partner_bookings (
  event_seq    bigint primary key,                                   -- 엠클릭 행사 일련번호(bookings 와 같은 키, FK 없음)
  brand        text not null check (brand in ('kumamoto','trial')),  -- 자회사 상품 구분(SZCore.PARTNER_BRANDS)
  event_no     text,
  status       text,                                                 -- 엠클릭 구분(견적·대기·확정·정산) — 화면은 대기 제외
  rep_name     text,
  member_type  text,
  pax          integer not null default 0,
  dep_date     date,                                                 -- 예약 전체: 입국일
  arr_date     date,                                                 -- 예약 전체: 귀국일
  seg_from     date,                                                 -- 자회사 숙소 체크인(그 밤부터 묵음)
  seg_to       date,                                                 -- 자회사 숙소 체크아웃(그 밤은 안 묵음)
  seg_nights   integer,
  seg_sure     boolean not null default true,                        -- 상품명에서 구간을 읽었는가(false=전체 기간 + 「確認」)
  combo        boolean not null default false,                       -- 야마나미 권역 숙소와 결합(bookings 에도 있음)
  product_name text,
  nights_label text,
  origin       text,
  airline      text,
  remark       text,
  remark_local text,
  reserved_at  date,
  session_ym   text,                                                 -- 출발월(YYYY-MM) — step1 월 동기화 단위
  synced_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists partner_bookings_brand_seg_idx on public.partner_bookings(brand, seg_from, seg_to);
create index if not exists partner_bookings_ym_idx       on public.partner_bookings(session_ym);

-- ② 개인(최소 정보)
create table if not exists public.partner_members (
  id           bigint primary key,                                   -- 엠클릭 pkgPsgrSeq(passengers.id 와 같은 번호 체계)
  event_seq    bigint not null references public.partner_bookings(event_seq) on delete cascade,
  seq_in_team  integer,
  is_rep       boolean not null default false,
  name_kr      text,
  name_en      text,
  gender       text,
  dep_flight   text,
  ret_flight   text,
  origin       text,
  airline      text,
  dep_time     text,
  loc_arr_time text,
  ret_dep_time text,
  kor_arr_time text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists partner_members_seq_idx on public.partner_members(event_seq);

-- updated_at 자동 갱신(공용 set_updated_at — 컬럼이 있는 표에만 붙인다: 117 교훈)
drop trigger if exists partner_bookings_updated on public.partner_bookings;
create trigger partner_bookings_updated before update on public.partner_bookings for each row execute function public.set_updated_at();
drop trigger if exists partner_members_updated on public.partner_members;
create trigger partner_members_updated before update on public.partner_members for each row execute function public.set_updated_at();

-- ③ RLS
alter table public.partner_bookings enable row level security;
alter table public.partner_members  enable row level security;
revoke all on public.partner_bookings from anon;
revoke all on public.partner_members  from anon;
grant select, insert, update, delete on public.partner_bookings to authenticated;
grant select, insert, update, delete on public.partner_members  to authenticated;

drop policy if exists partner_bookings_sel on public.partner_bookings;
create policy partner_bookings_sel on public.partner_bookings for select to authenticated
  using (is_admin() or has_any_read_area(array['partner_' || brand]) or has_any_area(array['step1']));
drop policy if exists partner_bookings_ins on public.partner_bookings;
create policy partner_bookings_ins on public.partner_bookings for insert to authenticated
  with check (is_admin() or has_any_area(array['step1']));
drop policy if exists partner_bookings_upd on public.partner_bookings;
create policy partner_bookings_upd on public.partner_bookings for update to authenticated
  using (is_admin() or has_any_area(array['step1'])) with check (is_admin() or has_any_area(array['step1']));
drop policy if exists partner_bookings_del on public.partner_bookings;
create policy partner_bookings_del on public.partner_bookings for delete to authenticated
  using (is_admin() or has_any_area(array['step1']));

drop policy if exists partner_members_sel on public.partner_members;
create policy partner_members_sel on public.partner_members for select to authenticated
  using (exists (select 1 from public.partner_bookings b
                  where b.event_seq = partner_members.event_seq
                    and (is_admin() or has_any_read_area(array['partner_' || b.brand]) or has_any_area(array['step1']))));
drop policy if exists partner_members_ins on public.partner_members;
create policy partner_members_ins on public.partner_members for insert to authenticated
  with check (is_admin() or has_any_area(array['step1']));
drop policy if exists partner_members_upd on public.partner_members;
create policy partner_members_upd on public.partner_members for update to authenticated
  using (is_admin() or has_any_area(array['step1'])) with check (is_admin() or has_any_area(array['step1']));
drop policy if exists partner_members_del on public.partner_members;
create policy partner_members_del on public.partner_members for delete to authenticated
  using (is_admin() or has_any_area(array['step1']));

-- ④ area_tree 재시드(36행) — partner 부모 + 자식 2
insert into public.area_tree(child, parent) values
  ('nametag','print'),('keyslip','print'),('aircover','print'),('dispatch','print'),('dinner','print'),('qrcards','print'),('transfer','print'),('notice','print'),
  ('frontdesk','front'),('inv_front','front'),
  ('room_assign','room'),('occupancy','room'),('staychart','room'),('roomstats','room'),('inv_room','room'),
  ('housekeeping','hk'),('inv_hk','hk'),
  ('course','golf'),('cart','golf'),('inv_golf','golf'),
  ('kds','kitchen'),('kds_front','kitchen'),('inv_fnb','kitchen'),
  ('pos_front','pos'),('pos_golf','pos'),('pos_restaurant','pos'),('pos_customer','pos'),
  ('settle_onsite','settle'),('settle_merit','settle'),('settle_report','settle'),
  ('stats_mgmt','stats'),('staycal','stats'),
  ('shizu_sheet','shizu'),('inv_shizu','shizu'),
  ('partner_kumamoto','partner'),('partner_trial','partner')
on conflict (child) do update set parent = excluded.parent;
delete from public.area_tree where child not in ('nametag','keyslip','aircover','dispatch','dinner','qrcards','transfer','notice','frontdesk','inv_front','room_assign','occupancy','staychart','roomstats','inv_room','housekeeping','inv_hk','course','cart','inv_golf','kds','kds_front','inv_fnb','pos_front','pos_golf','pos_restaurant','pos_customer','settle_onsite','settle_merit','settle_report','stats_mgmt','staycal','shizu_sheet','inv_shizu','partner_kumamoto','partner_trial');

-- 확인
-- select count(*) from area_tree;                                                        -- 36
-- select child,parent from area_tree where parent='partner';                             -- partner_kumamoto · partner_trial
-- select count(*) from pg_policies where tablename in ('partner_bookings','partner_members');  -- 8
-- select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'execute');  -- 15 (불변)
