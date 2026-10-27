-- ============================================================================
-- 155_guest_outings.sql — 신청제 행사 QR 신청(손님 자가 신청) (2026-10-27)
--  Min 2026-10-27 「프론트 신청제 행사 — 이것도 QR코드로도 신청할 수 있게」
--                 「연동성을 생각하면서 — 신청도 QR코드를 대면 굳이 사람들 다 검색하지 않아도」
--  ① guest_outings(p_token) anon — 손님 QR(order_tokens) → 그 팀 체류 기간(오늘~귀국일)에 걸린 행사(취소 제외)와
--     팀원 명단, 팀원별 신청 여부(mine). guest_bill(92)·guest_today(125) 와 같은 만료 규칙(체크아웃·귀국+7일).
--     다른 팀 정보는 없다(신청 인원 합계 signed 만). 이름은 자기 팀원만.
--  ② guest_outing_set(p_token, p_outing, p_member, p_on) anon — 팀원 1명 신청/취소.
--     검사: 토큰 유효 · 팀원이 그 팀 · 행사 open(마감·취소면 거부 — 변경은 프론트) · 행사 날짜가 오늘 이후·체류 중 · 정원.
--     signed_by='QR'(손님 자가 신청 표시 — 프론트 명단에 QR 배지). 트리거(152)가 코스 불참·signed 집계를 그대로 처리.
--  프론트 피커의 QR 스캔은 RPC 없이 order_tokens(로그인 읽기)로 팀을 찾는다(outings.html).
--  anon 실행 가능 security definer 13 → 15 (00_VERIFY 139 갱신). 새 RPC 는 revoke public 동반(118/119 함정). 멱등.
-- ============================================================================

create or replace function public.guest_outings(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with t as (          -- 토큰 → 팀
    select ot.event_seq, b.arr_date, b.dep_date, coalesce(g.check_status,'') as cs
    from order_tokens ot
    join bookings b on b.event_seq = ot.event_seq
    left join guests g on g.event_seq = ot.event_seq
    where ot.token = p_token
  ),
  v as (               -- 유효 토큰만(guest_bill 과 같은 만료 규칙)
    select * from t where cs <> '체크아웃' and (arr_date is null or current_date <= (arr_date + 7))
  ),
  d as ( select (now() at time zone 'Asia/Tokyo')::date as d0 ),
  mem as (             -- 자기 팀원(명단 순)
    select coalesce(jsonb_agg(jsonb_build_object('id', gm.id, 'name', coalesce(nullif(gm.name_kr,''), gm.name_en, ''), 'name_en', coalesce(gm.name_en,''))
                              order by gm.seq_in_team nulls last, gm.id), '[]'::jsonb) as members
    from guest_members gm where gm.event_seq in (select event_seq from v)
  ),
  os as (              -- 체류 기간(오늘~귀국일)의 행사, 취소 제외 · mine = 우리 팀에서 신청한 사람
    select o.*,
           (select coalesce(jsonb_agg(s.member_id), '[]'::jsonb) from outing_signups s
             where s.outing_id = o.id and s.event_seq in (select event_seq from v)) as mine
    from outings o, v, d
    where o.status <> 'cancelled'
      and o.outing_date >= greatest(d.d0, coalesce(v.dep_date, d.d0))
      and o.outing_date <= coalesce(v.arr_date, d.d0 + 14)
  )
  select case
    when not exists (select 1 from t) then jsonb_build_object('ok', false)
    when not exists (select 1 from v) then jsonb_build_object('ok', false, 'expired', true)
    else jsonb_build_object(
      'ok', true,
      'today', (select d0 from d),
      'members', (select members from mem),
      'outings', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', os.id, 'date', os.outing_date, 'kind', os.kind, 'title_ko', os.title_ko, 'title_ja', os.title_ja,
                    'meet_time', to_char(os.meet_time, 'HH24:MI'), 'meet_place', os.meet_place, 'return_time', to_char(os.return_time, 'HH24:MI'),
                    'capacity', os.capacity, 'fee', os.fee, 'note_ko', os.note_ko, 'note_ja', os.note_ja,
                    'status', os.status, 'signed', os.signed, 'mine', os.mine)
                  order by os.outing_date, os.meet_time nulls last, os.id), '[]'::jsonb) from os))
  end;
$$;
revoke execute on function public.guest_outings(text) from public;
grant  execute on function public.guest_outings(text) to anon, authenticated;

create or replace function public.guest_outing_set(p_token text, p_outing bigint, p_member uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint; v_arr date; v_dep date; v_cs text;
  o record; n int;
  v_d0 date := (now() at time zone 'Asia/Tokyo')::date;
begin
  select ot.event_seq, b.arr_date, b.dep_date, coalesce(g.check_status,'')
    into v_seq, v_arr, v_dep, v_cs
    from order_tokens ot
    join bookings b on b.event_seq = ot.event_seq
    left join guests g on g.event_seq = ot.event_seq
   where ot.token = p_token;
  if v_seq is null then return jsonb_build_object('ok', false, 'reason', 'token'); end if;
  if v_cs = '체크아웃' or (v_arr is not null and current_date > v_arr + 7) then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if not exists (select 1 from guest_members gm where gm.id = p_member and gm.event_seq = v_seq) then return jsonb_build_object('ok', false, 'reason', 'member'); end if;
  select * into o from outings where id = p_outing;
  if o.id is null or o.status = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'outing'); end if;
  if o.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;   -- 마감 뒤 변경은 프론트에서
  if o.outing_date < v_d0 or o.outing_date < coalesce(v_dep, v_d0) or o.outing_date > coalesce(v_arr, v_d0 + 14) then
    return jsonb_build_object('ok', false, 'reason', 'date');
  end if;
  if p_on then
    if not exists (select 1 from outing_signups where outing_id = p_outing and member_id = p_member) then
      if o.capacity is not null and o.signed >= o.capacity then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
      insert into outing_signups(outing_id, member_id, event_seq, signed_by) values (p_outing, p_member, v_seq, 'QR')
      on conflict (outing_id, member_id) do nothing;
    end if;
  else
    delete from outing_signups where outing_id = p_outing and member_id = p_member and event_seq = v_seq;
  end if;
  select signed into n from outings where id = p_outing;   -- 트리거가 갱신한 값
  return jsonb_build_object('ok', true, 'signed', coalesce(n, 0), 'on', p_on);
end $$;
revoke execute on function public.guest_outing_set(text, bigint, uuid, boolean) from public;
grant  execute on function public.guest_outing_set(text, bigint, uuid, boolean) to anon, authenticated;

-- 확인
-- select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef and has_function_privilege('anon', p.oid, 'execute');   -- 15
