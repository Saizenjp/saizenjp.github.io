-- ============================================================================
--  SaiZen Hub — 02 객실 마스터 (room_inventory)  · STEP 2 room 모듈용
-- ----------------------------------------------------------------------------
--  · 실제 동/호실을 고정 등록. 화면에서 야마나미 호텔동 호실 수는 운영자가 입력.
--  · rooms(배정 기록)와 분리: room_inventory = "어떤 방이 있나"(마스터),
--                              rooms          = "그 방에 어느 팀이 들었나"(거래).
--  · 01_schema.sql 실행 후 이어서 실행. 멱등 재실행 가능.
--  · 시설/타입 표기는 v13.4·현장 분류 기준.
-- ============================================================================

create table if not exists room_inventory (
  id            uuid          primary key default gen_random_uuid(),
  facility      text          not null,                 -- 야마나미리조트/쿠주힐즈/간지호텔/시즈노야도 료칸
  zone          text,                                   -- 화면 그룹: 호텔동/관내별장/돔하우스/본관/별채 등
  room_no       text          not null,                 -- "디럭스 1" "소보 2호" "돔하우스 1호" "쿠주 1동" ...
  room_type     text          not null,                 -- 디럭스트윈/스탠다드트윈/컴팩트트윈/싱글/트윈/트리플/4인실/8인실/2인1동
  capacity      int           not null default 2,       -- 정원(권장 인원)
  max_capacity  int,                                    -- 최대 수용(초과 시 경고만). null=capacity와 동일
  active        boolean       not null default true,    -- 사용 가능 여부
  note          text,                                   -- "대표님 사용 중" "사용 안 함" "개인온천" 등
  sort_order    int           default 0,                -- 화면 정렬 순서
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),
  unique (facility, room_no)
);
create index if not exists idx_room_inv_facility on room_inventory(facility, active);

drop trigger if exists trg_room_inv_updated on room_inventory;
create trigger trg_room_inv_updated before update on room_inventory
  for each row execute function set_updated_at();

alter table room_inventory enable row level security;
drop policy if exists p_all_room_inventory on room_inventory;
create policy p_all_room_inventory on room_inventory
  for all to anon, authenticated using (true) with check (true);

-- rooms(배정)에 어떤 마스터 객실을 썼는지 연결(선택). null이면 임시/수기 객실.
alter table rooms add column if not exists inventory_id uuid references room_inventory(id) on delete set null;

-- ── 확정 인벤토리 사전 등록 (야마나미 호텔동은 운영자가 화면에서 입력) ──
--   on conflict 로 멱등. 호실 수가 바뀌면 화면에서 추가/수정.
insert into room_inventory (facility, zone, room_no, room_type, capacity, max_capacity, active, note, sort_order) values
  -- 관내별장 (야마나미 소속) — 소보별장
  ('야마나미리조트','관내별장','소보 트리플 1호','트리플',3,3,false,'대표님 사용 중',10),
  ('야마나미리조트','관내별장','소보 트윈 2호','트윈',2,2,true,null,11),
  ('야마나미리조트','관내별장','소보 트윈 3호','트윈',2,2,true,null,12),
  ('야마나미리조트','관내별장','소보 트윈 4호','트윈',2,2,false,'사용 안 함',13),
  ('야마나미리조트','관내별장','소보 5호','4인실',4,4,true,'4인 1동',14),
  -- 관내별장 — 아소별장
  ('야마나미리조트','관내별장','아소별장','8인실',8,8,true,'8인 1동',15),
  -- 돔하우스 (야마나미 소속) — 4동, 모두 트윈
  ('야마나미리조트','돔하우스','돔하우스 1호','트윈',2,2,true,null,20),
  ('야마나미리조트','돔하우스','돔하우스 2호','트윈',2,2,true,null,21),
  ('야마나미리조트','돔하우스','돔하우스 3호','트윈',2,2,true,null,22),
  ('야마나미리조트','돔하우스','돔하우스 4호','트윈',2,2,true,null,23),
  -- 쿠주힐즈 — 2인 1동, 10동
  ('쿠주힐즈','쿠주힐즈','쿠주 1동','2인1동',2,2,true,null,30),
  ('쿠주힐즈','쿠주힐즈','쿠주 2동','2인1동',2,2,true,null,31),
  ('쿠주힐즈','쿠주힐즈','쿠주 3동','2인1동',2,2,true,null,32),
  ('쿠주힐즈','쿠주힐즈','쿠주 4동','2인1동',2,2,true,null,33),
  ('쿠주힐즈','쿠주힐즈','쿠주 5동','2인1동',2,2,true,null,34),
  ('쿠주힐즈','쿠주힐즈','쿠주 6동','2인1동',2,2,true,null,35),
  ('쿠주힐즈','쿠주힐즈','쿠주 7동','2인1동',2,2,true,null,36),
  ('쿠주힐즈','쿠주힐즈','쿠주 8동','2인1동',2,2,true,null,37),
  ('쿠주힐즈','쿠주힐즈','쿠주 9동','2인1동',2,2,true,null,38),
  ('쿠주힐즈','쿠주힐즈','쿠주 10동','2인1동',2,2,true,null,39),
  -- 간지호텔 — 트윈 15실 (1인 사용 시 4,400엔/박, 정원2·최대3)
  ('간지호텔','간지호텔','간지 1호','트윈',2,3,true,null,40),
  ('간지호텔','간지호텔','간지 2호','트윈',2,3,true,null,41),
  ('간지호텔','간지호텔','간지 3호','트윈',2,3,true,null,42),
  ('간지호텔','간지호텔','간지 4호','트윈',2,3,true,null,43),
  ('간지호텔','간지호텔','간지 5호','트윈',2,3,true,null,44),
  ('간지호텔','간지호텔','간지 6호','트윈',2,3,true,null,45),
  ('간지호텔','간지호텔','간지 7호','트윈',2,3,true,null,46),
  ('간지호텔','간지호텔','간지 8호','트윈',2,3,true,null,47),
  ('간지호텔','간지호텔','간지 9호','트윈',2,3,true,null,48),
  ('간지호텔','간지호텔','간지 10호','트윈',2,3,true,null,49),
  ('간지호텔','간지호텔','간지 11호','트윈',2,3,true,null,50),
  ('간지호텔','간지호텔','간지 12호','트윈',2,3,true,null,51),
  ('간지호텔','간지호텔','간지 13호','트윈',2,3,true,null,52),
  ('간지호텔','간지호텔','간지 14호','트윈',2,3,true,null,53),
  ('간지호텔','간지호텔','간지 15호','트윈',2,3,true,null,54),
  -- 시즈노야도 료칸 — 실제 객실명(本館 4: 志津·合歓·北條·山法師 / 別棟 3: 吉祥·瑞雲·馬酔木). 정원2·최대3, 1인 4,400엔/박
  --   ※ zone 값(본관/별채)은 room.html 라우팅 키 → 유지. 화면에는 本館/別棟로 표기. (15_shizunoyado_rooms.sql 과 동일)
  ('시즈노야도 료칸','본관','志津',  '트윈',2,3,true,null,60),
  ('시즈노야도 료칸','본관','合歓',  '트윈',2,3,true,null,61),
  ('시즈노야도 료칸','본관','北條',  '트윈',2,3,true,null,62),
  ('시즈노야도 료칸','본관','山法師','트윈',2,3,true,null,63),
  ('시즈노야도 료칸','별채','吉祥',  '트윈',2,3,true,'別棟 — 개인온천 사전신청제(사전신청비 +2,000엔/박)',64),
  ('시즈노야도 료칸','별채','瑞雲',  '트윈',2,3,true,'別棟 — 개인온천 사전신청제(사전신청비 +2,000엔/박)',65),
  ('시즈노야도 료칸','별채','馬酔木','트윈',2,3,true,'別棟 — 개인온천 사전신청제(사전신청비 +2,000엔/박)',66)
on conflict (facility, room_no) do nothing;

-- ── 1인실 추가요금 규칙(참고용 상수 테이블) ──
create table if not exists fee_rules (
  code        text primary key,
  facility    text,
  amount      numeric(14,0) not null,
  unit        text,                 -- per_night 등
  description text,
  active      boolean default true
);
insert into fee_rules (code, facility, amount, unit, description) values
  ('single_use_ganji','간지호텔',4400,'per_night','1인 사용 추가요금(1박당)'),
  ('single_use_shizu','시즈노야도 료칸',4400,'per_night','1인 사용 추가요금(1박당)')
on conflict (code) do nothing;

alter table fee_rules enable row level security;
drop policy if exists p_all_fee_rules on fee_rules;
create policy p_all_fee_rules on fee_rules for all to anon, authenticated using (true) with check (true);
