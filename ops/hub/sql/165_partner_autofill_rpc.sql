-- 165: 수배 자동 채움을 등록 시점에 — 데이터 등록 계정에 구마모토·트라이얼 권한이 없어도 새 팀의 수배 행을 만든다
--      (Min 2026-11-11 「등록할 때 자동으로 만들어지게 SQL 변경해줘」)
--  ✅ 2026-11-11 MCP apply_migration 적용 완료 — 함수 2개 security definer · anon 실행 불가 · anon secdef 15 유지.
--     롤백 시험(계정 흉내): 등록 권한만 있는 계정 = 새 팀 삽입·두 번째 호출은 전부 건너뜀·골프 줄 중복 없음·표 직접 읽기/쓰기는 여전히 막힘 /
--     구마모토·트라이얼 담당 = 가능 / 권한 없는 계정·미로그인 = 거부 / 잘못된 값(없는 호텔·코스, 기간 밖 날짜, 없는 예약)은 비우거나 건너뜀.
--     실제 등록분 21건 입력: 새 팀 20 · 이미 있는 1 건너뜀 · 객실 인원 = 예약 인원 20/20.
--  배경: step1 의 partnerAutoFill 은 partner_ops·partner_golf 에 직접 넣는데 그 표의 쓰기 정책은 partner_<brand> 권한자만이다(160).
--        실제로 등록하는 계정은 데이터 등록(step1) 권한만 있어 삽입이 RLS 에 막혔고, 호텔·골프장 등록표(별칭)도 읽지 못해
--        비고를 해석할 수 없었다 → 수배 목록에서 [비고대로 일괄 채우기]를 따로 눌러야 했다.
--  방법: 표의 정책은 그대로 둔다 — 호텔 등록표에는 가산 금액·블록이, partner_settings 에는 옛 요금이 있어 읽기를 넓히지 않는다.
--        대신 좁은 서버 함수 2개를 연다. 둘 다 로그인 전용(anon 불가) · 마스터 또는 데이터 등록(step1) 또는 구마모토·트라이얼 권한자.
--   ① partner_autofill_refs()  = 비고 해석에 필요한 것만: 호텔·골프장의 id·이름·별칭·사용 여부 + 상품별 기본 호텔/담당(partner_defaults).
--                                 금액·블록·요금표는 주지 않는다.
--   ② partner_autofill(p_rows) = **수배 행이 없는 팀에만** partner_ops 1행(+비고의 골프장 줄 partner_golf, auto=true)을 넣는다.
--                                 이미 행이 있는 팀은 건드리지 않는다(on conflict do nothing — 담당자 수정 보호).
--                                 값 검사: 호텔·코스 id 는 등록표에 있어야(없으면 비움/건너뜀) · 객실 수 0~99 · 골프 날짜는 그 예약 기간 안 ·
--                                 팀당 골프 20줄 · 한 번에 500팀까지. 돌려주는 값 {teams, skipped, golf, hotels, bad}.
--  해석(비고 → 호텔·객실·골프장)은 종전처럼 화면의 SZCore.partnerRemarkPlan 하나가 한다 — 이 함수는 결과를 받아 넣기만 한다.
--  멱등(create or replace). 표 구조·RLS 정책 변경 없음. anon 실행 가능 security definer 는 15 그대로(00_VERIFY 139).

create or replace function public.partner_autofill_refs()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (public.is_admin() or public.has_any_area(array['step1','partner','partner_kumamoto','partner_trial'])) then
    raise exception 'permission denied: partner_autofill_refs' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'hotels',  coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'name_ko', h.name_ko, 'name_ja', h.name_ja, 'aliases', h.aliases, 'active', h.active) order by h.sort, h.id)
                           from public.partner_hotels h), '[]'::jsonb),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name_ko', c.name_ko, 'name_ja', c.name_ja, 'aliases', c.aliases, 'active', c.active) order by c.sort, c.id)
                           from public.partner_courses c), '[]'::jsonb),
    'defaults', coalesce((select jsonb_build_object('hotel', coalesce(s.value->'hotel', '{}'::jsonb), 'staff', coalesce(s.value->'staff', '{}'::jsonb))
                            from public.partner_settings s where s.key = 'partner_defaults'), '{}'::jsonb)
  );
end $$;

create or replace function public.partner_autofill(p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r jsonb; g jsonb; b record;
  v_seq bigint; v_hotel int; v_course int; v_date date; v_staff text; v_sig text;
  v_tw int; v_sg int; v_tr int; v_n int; v_sort int;
  n_teams int := 0; n_skip int := 0; n_golf int := 0; n_hotels int := 0; n_bad int := 0;
  v_admin boolean := public.is_admin();
  v_step1 boolean := public.has_any_area(array['step1']);
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'partner_autofill: p_rows must be a json array';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'partner_autofill: too many rows (max 500)';
  end if;
  if not (v_admin or v_step1 or public.has_any_area(array['partner','partner_kumamoto','partner_trial'])) then
    raise exception 'permission denied: partner_autofill' using errcode = '42501';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_seq := case when (r->>'event_seq') ~ '^\d{1,15}$' then (r->>'event_seq')::bigint end;
    select pb.event_seq, pb.brand, pb.dep_date, pb.arr_date into b from public.partner_bookings pb where pb.event_seq = v_seq;
    if not found then n_bad := n_bad + 1; continue; end if;
    -- 마스터·데이터 등록이 아니면 그 상품(partner_<brand>) 담당만
    if not (v_admin or v_step1 or public.has_any_area(array['partner_' || b.brand])) then
      raise exception 'permission denied: partner_autofill' using errcode = '42501';
    end if;

    v_hotel := case when (r->>'hotel_id') ~ '^\d{1,9}$' then (r->>'hotel_id')::int end;
    if v_hotel is not null and not exists (select 1 from public.partner_hotels h where h.id = v_hotel) then v_hotel := null; end if;
    v_tw := least(case when (r->>'twin')   ~ '^\d{1,3}$' then (r->>'twin')::int   else 0 end, 99);
    v_sg := least(case when (r->>'single') ~ '^\d{1,3}$' then (r->>'single')::int else 0 end, 99);
    v_tr := least(case when (r->>'triple') ~ '^\d{1,3}$' then (r->>'triple')::int else 0 end, 99);
    v_staff := nullif(left(btrim(coalesce(r->>'staff', '')), 60), '');
    v_sig   := nullif(left(coalesce(r->>'auto_sig', ''), 40), '');

    insert into public.partner_ops (event_seq, hotel_id, twin, single, triple, staff, auto_sig)
    values (v_seq, v_hotel, v_tw, v_sg, v_tr, v_staff, v_sig)
    on conflict (event_seq) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then n_skip := n_skip + 1; continue; end if;          -- 이미 수배 행이 있는 팀 — 건드리지 않는다
    n_teams := n_teams + 1;
    if v_hotel is not null and (r->>'hr') = 'true' then n_hotels := n_hotels + 1; end if;   -- 비고에서 읽은 호텔(기본 호텔은 세지 않는다)

    -- 비고의 골프장 줄 — 그 팀에 골프 줄이 하나도 없을 때만
    if jsonb_typeof(r->'golf') = 'array' and not exists (select 1 from public.partner_golf pg where pg.event_seq = v_seq) then
      v_sort := 0;
      for g in select value from jsonb_array_elements(r->'golf') loop
        exit when v_sort >= 20;
        v_course := case when (g->>'course_id') ~ '^\d{1,9}$' then (g->>'course_id')::int end;
        begin
          v_date := case when (g->>'play_date') ~ '^\d{4}-\d{2}-\d{2}$' then (g->>'play_date')::date end;
        exception when others then v_date := null;
        end;
        continue when v_course is null or v_date is null;
        continue when v_date < b.dep_date or v_date > b.arr_date;
        continue when not exists (select 1 from public.partner_courses c where c.id = v_course);
        insert into public.partner_golf (event_seq, play_date, course_id, sort, auto) values (v_seq, v_date, v_course, v_sort, true);
        v_sort := v_sort + 1; n_golf := n_golf + 1;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('teams', n_teams, 'skipped', n_skip, 'golf', n_golf, 'hotels', n_hotels, 'bad', n_bad);
end $$;

-- 함수 실행 권한은 기본으로 PUBLIC 에 붙는다(118·139 의 함정) — 명시 회수 뒤 로그인 사용자에게만
revoke all on function public.partner_autofill_refs()  from public, anon;
revoke all on function public.partner_autofill(jsonb)  from public, anon;
grant execute on function public.partner_autofill_refs() to authenticated;
grant execute on function public.partner_autofill(jsonb) to authenticated;

comment on function public.partner_autofill_refs()  is '수배 자동 채움 참조(SQL 165) — 호텔·골프장 이름/별칭 + 상품별 기본값. 금액·블록 없음. 로그인 전용.';
comment on function public.partner_autofill(jsonb)  is '수배 자동 채움(SQL 165) — 수배 행이 없는 팀에만 partner_ops(+partner_golf auto) 삽입. 로그인 전용(마스터·step1·partner).';

notify pgrst, 'reload schema';
