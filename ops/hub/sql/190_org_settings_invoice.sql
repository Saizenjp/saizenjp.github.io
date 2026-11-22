-- ============================================================================
--  190_org_settings_invoice.sql — 적격청구서(インボイス) 발행자 표기 설정
--  상태: 적용 전(2026-11-21 작성 · Min 승인 뒤 MCP 로 적용)
-- ----------------------------------------------------------------------------
--  docs/06 P2. 영수증(領収書)·御請求書의 발행자 칸을 설정값으로 — 관리 화면(admin.html)에서 고친다.
--  Min 결정(2026-11-21 「사이젠으로 표기해야하고 야마나미리조트 주소와 전화번호로」):
--    발행자 = 株式会社SaiZen · 시설 = あそ やまなみリゾート · 주소·전화 = 야마나미 리조트
--    (〒869-2702 熊本県阿蘇郡産山村大字大利630 · TEL 0967-25-2331 — 공개된 시설 정보).
--  시설명은 히라가나 표기(Min 2026-11-22 「가타카나가 아닌 히라가나 표기로」 — 「あそ やまなみリゾート」).
--  등록번호(T+13자리)는 아직 받지 않았다 → 빈 값으로 두고, 들어가면 영수증·御請求書에 「登録番号」 줄이 나온다.
--  표: org_settings(key 기본키, value, updated_at, updated_by) — 읽기 = 로그인(활성) 직원 · 쓰기 = 활성 관리자.
--  화면은 이 표가 없거나 비어 있어도 같은 기본값(saizen-ops.js SO_ISSUER_DEFAULT)으로 찍는다.
--  멱등(있으면 값은 건드리지 않는다 — on conflict do nothing).
-- ============================================================================

create table if not exists public.org_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now(),
  updated_by text
);
comment on table public.org_settings is '190 — 발행자 표기 등 회사 설정(키·값). 관리 화면에서 고친다.';

alter table public.org_settings enable row level security;
drop policy if exists org_settings_sel on public.org_settings;
create policy org_settings_sel on public.org_settings for select to authenticated using (true);
drop policy if exists org_settings_ins on public.org_settings;
create policy org_settings_ins on public.org_settings for insert to authenticated with check (has_any_area('{}'::text[]));
drop policy if exists org_settings_upd on public.org_settings;
create policy org_settings_upd on public.org_settings for update to authenticated using (has_any_area('{}'::text[])) with check (has_any_area('{}'::text[]));
drop policy if exists org_settings_del on public.org_settings;
create policy org_settings_del on public.org_settings for delete to authenticated using (has_any_area('{}'::text[]));
-- 189 의 활성 계정 정책(있으면 같이)
do $a$ begin
  if to_regprocedure('public.is_active_staff()') is not null then
    execute 'drop policy if exists active_staff_only on public.org_settings';
    execute 'create policy active_staff_only on public.org_settings as restrictive for all to authenticated using ((select public.is_active_staff())) with check ((select public.is_active_staff()))';
  end if;
end $a$;
revoke all on public.org_settings from anon;
grant select, insert, update, delete on public.org_settings to authenticated;

alter table public.org_settings drop constraint if exists org_settings_reg_no_chk;
alter table public.org_settings add constraint org_settings_reg_no_chk
  check (key <> 'invoice_reg_no' or coalesce(value, '') = '' or value ~ '^T[0-9]{13}$');

insert into public.org_settings(key, value, updated_by) values
  ('issuer_name_ja',     '株式会社SaiZen',                          '190'),
  ('issuer_facility_ja', 'あそ やまなみリゾート',                     '190'),
  ('issuer_address_ja',  '〒869-2702 熊本県阿蘇郡産山村大字大利630',     '190'),
  ('issuer_tel',         '0967-25-2331',                           '190'),
  ('invoice_reg_no',     '',                                       '190')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
