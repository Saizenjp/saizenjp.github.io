-- 120_walkins.sql — 워크인(예약 없는 현장 손님) 전표
--
-- 배경: folios.event_seq 가 NOT NULL 이고 POS 팀 목록은 bookings 에서 오기 때문에,
--       예약이 없는 손님(레스토랑에 밥만 먹으러 온 일본 손님 등)은 주문도 결제도 만들 수 없었다.
--
-- ⚠ bookings 에 넣지 않는다 — step1 월 동기화가 「그 파일에 없는 팀」으로 보고 지워 버린다
--   (예전에 「현지예약 추가」 기능을 없앤 이유가 바로 이것).
--   그래서 별도 테이블 walkins 를 두고, event_seq 는 9,900,001 부터의 전용 대역을 쓴다.
--   (엠클릭 30xxxxxx·9xxxx, 과거 현지 워크인 91000xx 와 겹치지 않는다.)
--
-- 멱등. Supabase SQL Editor 또는 MCP 로 실행.

create table if not exists walkins (
  event_seq   integer primary key,          -- 9,900,001+ (folios·charges·kitchen_tickets 가 이 값으로 이어진다)
  walk_date   date        not null,
  name        text,                         -- 손님 이름(선택 — 안 물어봐도 된다)
  pax         integer     not null default 1,
  venue       text,                         -- restaurant / proshop / front …(POS 매장)
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_walkins_date on walkins(walk_date);

alter table walkins enable row level security;

-- 읽기 = 로그인 전체(정산·주방이 이름을 봐야 한다) · 쓰기 = pos/settle 영역
drop policy if exists walkins_read on walkins;
create policy walkins_read on walkins for select to authenticated using (true);

drop policy if exists walkins_write on walkins;
create policy walkins_write on walkins for insert to authenticated
  with check (has_any_area(array['pos','settle']));

drop policy if exists walkins_update on walkins;
create policy walkins_update on walkins for update to authenticated
  using (has_any_area(array['pos','settle'])) with check (has_any_area(array['pos','settle']));

-- ── 워크인 개설 = 번호 채번 + walkins + folio 를 한 번에 ────────────────────
--  동시에 두 대에서 눌러도 번호가 겹치지 않도록 테이블을 잠그고 채번한다.
create or replace function walkin_open(
  p_date date, p_name text, p_pax integer, p_venue text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_seq integer; v_folio uuid; v_ym text;
begin
  if not (is_admin() or has_any_area(array['pos','settle'])) then
    raise exception 'no permission';
  end if;
  p_date := coalesce(p_date, (now() at time zone 'Asia/Tokyo')::date);
  v_ym   := to_char(p_date, 'YYYY-MM');

  lock table walkins in exclusive mode;
  select coalesce(max(event_seq), 9900000) + 1 into v_seq from walkins;

  insert into walkins(event_seq, walk_date, name, pax, venue, created_by)
  values (v_seq, p_date, nullif(btrim(coalesce(p_name,'')),''), greatest(coalesce(p_pax,1),1),
          nullif(btrim(coalesce(p_venue,'')),''), auth.email());

  insert into folios(event_seq, subject, status, session_ym, created_by)
  values (v_seq, 'team', 'open', v_ym, auth.email())
  returning id into v_folio;

  return jsonb_build_object('event_seq', v_seq, 'folio_id', v_folio, 'session_ym', v_ym);
end $$;

-- ⚠ 함수 EXECUTE 는 기본으로 PUBLIC 에 부여된다(anon 이 PUBLIC 을 상속).
--   revoke ... from anon 만으로는 안 막힌다 — public 에서 회수하고 authenticated 에만 준다(SQL 119 와 같은 규칙).
revoke execute on function walkin_open(date, text, integer, text) from public, anon;
grant  execute on function walkin_open(date, text, integer, text) to authenticated;
