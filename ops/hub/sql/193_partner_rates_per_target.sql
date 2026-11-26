-- ============================================================================
--  193_partner_rates_per_target.sql — 수배 요금표: 호텔 공통 줄 없애기 · 요일 4구분(월~목·금·토·일)
--  상태: 적용 완료(2026-11-26, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  Min 2026-11-25 「전 호텔 공통값 이것도 없애고 각 개별적으로 등록」「평일 휴일로 나누지말고 월~목, 금, 토, 일」.
--  데이터를 옮기고, 그 데이터를 읽는 검수 함수(data_audit) 한 조건만 고친다(표 정의 변경 없음). 금액은 저장소에 적지 않는다(§3-2) — DB 안에서 옮긴다.
--
--  ① 호텔 공통 줄(kind='hotel', ref_id 없음)을 호텔마다 한 줄씩 복사(기간·이름 그대로).
--     칸 옮기기: 객실 종류(twin·single·triple)마다 wk → mt, hi → fri·sat·sun.
--     메모(note)는 옛 공통 설정 설명이라 옮기지 않는다(이전 값은 ④ 기록에).
--     호텔 가산(partner_hotels.surcharge — 공통 요금 위에 1인 1박 더하던 값)을 그 호텔 줄의 값에 더해 넣고 가산은 0 으로.
--     (견적: 옛 = 공통 값 + 가산 / 새 = 그 호텔 값 — 밤마다 같은 금액. SZCore.partnerDayType 'mt' 인 밤 = 옛 'wk' 인 밤.)
--  ② 골프는 공통 줄을 남긴다 — 골프장을 아직 정하지 않은 팀(라운드 코스 미지정)의 견적이 이 줄로 계산된다
--     (없애면 그 팀들이 전부 「요금 빠짐」 — 2026-11-25 대조: 12월 팀 대부분). 칸만 옮긴다: wk → mt·fri, sat·sun 그대로.
--     골프장별 요금은 화면에서 그 골프장 줄에 적으면 공통보다 앞선다(종전 규칙).
--  ③ 복사한 호텔 공통 줄 삭제 · 상품별 기본값(partner_settings 'partner_defaults' — 화면에서 없앤다) 삭제.
--  ④ change_log 에 지운 줄·가산·기본값의 이전 값을 남긴다(되돌리기용).
--  ⑤ data_audit 「싱글 요금 미정」(partner_single_norate, SQL 161)이 싱글 요금을 single.wk·hi 로만 찾던 것 → single 의 아무 칸(mt·fri·sat·sun·옛 wk·hi)
--     (바꾸지 않으면 ① 뒤 싱글 요금이 있는 호텔도 「미정」으로 센다). 본문에 2번 나와야 한다.
--  인솔(kind='guide')은 상품별 줄이라 그대로 — 새 칸(arr 입국일·noround 라운딩 없는 날·dep 귀국일)은 비어 있으면 종전 금액.
--
--  멱등: 호텔 공통 줄이 없으면 ①③ 은 할 일이 없고, ② 는 옛 칸(wk)이 남은 줄만 바꾼다. 호텔 지정 줄이 이미 있으면 멈춘다(복사한 공통 줄과 우선순위가 섞인다 — 먼저 확인).
--  되돌리기: change_log(entity 'partner_rates', action 'per_target_193')의 changes 로 호텔 공통 줄·골프 공통 줄의 옛 prices·가산을 되돌리고, 호텔 지정 줄을 지운다.
-- ============================================================================

do $m$
declare
  v_hotel_specific int; v_prev jsonb; v_ins_h int := 0; v_golf int := 0; v_del int := 0;
begin
  if to_regclass('public.partner_rates') is null or to_regclass('public.partner_hotels') is null or to_regclass('public.partner_courses') is null then
    raise exception '193: partner_rates·partner_hotels·partner_courses 가 없다';
  end if;
  select count(*) into v_hotel_specific from partner_rates where kind = 'hotel' and ref_id is not null;
  if not exists (select 1 from partner_rates where kind = 'hotel' and ref_id is null)
     and not exists (select 1 from partner_rates where kind = 'golf' and prices ? 'wk') then
    raise notice '193: 바꿀 줄이 없다 — 할 일 없음';
    return;
  end if;
  if v_hotel_specific > 0 and exists (select 1 from partner_rates where kind = 'hotel' and ref_id is null) then
    raise exception '193: 호텔 지정 % 줄이 이미 있다 — 공통 줄 복사와 우선순위가 섞이므로 먼저 확인', v_hotel_specific;
  end if;

  -- 되돌리기용 이전 값
  v_prev := jsonb_build_object(
    'rates',     (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]') from partner_rates r where (r.kind = 'hotel' and r.ref_id is null) or (r.kind = 'golf' and r.prices ? 'wk')),
    'surcharge', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'surcharge', h.surcharge) order by h.id), '[]') from partner_hotels h where coalesce(h.surcharge, 0) <> 0),
    'defaults',  (select value from partner_settings where key = 'partner_defaults'));

  -- ① 호텔: 공통 줄 × 호텔
  insert into partner_rates(kind, ref_id, label, from_date, to_date, prices, note, sort)
  select 'hotel', h.id, r.label, r.from_date, r.to_date,
         (select coalesce(jsonb_object_agg(t.key,
                   case when jsonb_typeof(t.value) = 'object' then
                     jsonb_strip_nulls(jsonb_build_object(
                       'mt',  coalesce(t.value->'mt',  case when t.value ? 'wk' then to_jsonb((t.value->>'wk')::numeric + coalesce(h.surcharge, 0)) end),
                       'fri', coalesce(t.value->'fri', case when t.value ? 'hi' then to_jsonb((t.value->>'hi')::numeric + coalesce(h.surcharge, 0)) end),
                       'sat', coalesce(t.value->'sat', case when t.value ? 'hi' then to_jsonb((t.value->>'hi')::numeric + coalesce(h.surcharge, 0)) end),
                       'sun', coalesce(t.value->'sun', case when t.value ? 'hi' then to_jsonb((t.value->>'hi')::numeric + coalesce(h.surcharge, 0)) end)))
                   else t.value end), '{}'::jsonb)
            from jsonb_each(r.prices) t),
         null, r.sort
  from partner_rates r cross join partner_hotels h
  where r.kind = 'hotel' and r.ref_id is null
  order by h.id, r.id;   -- 새 id 를 옛 공통 줄 순서대로 — 같은 폭의 기간이 겹치면 id 큰 줄이 이기므로 순서를 지킨다
  get diagnostics v_ins_h = row_count;

  -- ② 골프: 줄은 그대로, 칸만(공통·골프장 지정 모두 — 옛 칸 wk 가 있는 줄)
  update partner_rates
     set prices = jsonb_strip_nulls((prices - 'wk') || jsonb_build_object(
                    'mt',  coalesce(prices->'mt',  prices->'wk'),
                    'fri', coalesce(prices->'fri', prices->'wk'))),
         updated_at = now()
   where kind = 'golf' and prices ? 'wk';
  get diagnostics v_golf = row_count;

  -- ③ 공통 줄 · 가산 · 상품별 기본값
  delete from partner_rates where kind = 'hotel' and ref_id is null;
  get diagnostics v_del = row_count;
  update partner_hotels set surcharge = 0 where coalesce(surcharge, 0) <> 0;
  delete from partner_settings where key = 'partner_defaults';

  -- ④ 기록
  insert into change_log(entity, entity_id, action, label, changes, changed_by)
  values ('partner_rates', 'common', 'per_target_193',
          format('호텔 공통 줄 %s개 → 호텔 %s줄 · 골프 줄 %s개 칸 옮김(wk → mt·fri), 호텔 가산 → 0, 상품별 기본값 삭제', v_del, v_ins_h, v_golf),
          v_prev, 'SQL 193');
  raise notice '193: 호텔 공통 % 줄 삭제 · 호텔 % 줄 · 골프 % 줄 칸 옮김', v_del, v_ins_h, v_golf;
end $m$;

-- ── ⑤ data_audit 싱글 요금 판정 ─────────────────────────────────────────────────
do $au$
declare d text; n int;
  old_t text := $q$(coalesce(nullif(r.prices->'single'->>'wk','')::int,0) > 0 or coalesce(nullif(r.prices->'single'->>'hi','')::int,0) > 0)$q$;
  new_t text := $q$exists (select 1 from jsonb_each_text(case when jsonb_typeof(r.prices->'single') = 'object' then r.prices->'single' else '{}'::jsonb end) sv where coalesce(nullif(sv.value,'')::numeric,0) > 0)$q$;
begin
  if to_regprocedure('public.data_audit()') is null then raise notice '193 ⑤: data_audit 없음 — 건너뜀'; return; end if;
  d := pg_get_functiondef('public.data_audit()'::regprocedure);
  if position(new_t in d) > 0 and position(old_t in d) = 0 then raise notice '193 ⑤: 이미 바뀜'; return; end if;
  n := (length(d) - length(replace(d, old_t, ''))) / length(old_t);
  if n <> 2 then raise exception '193 ⑤: data_audit 의 싱글 요금 판정이 %번 — 2번이어야 한다(본문 확인)', n; end if;
  execute replace(d, old_t, new_t);
  raise notice '193 ⑤: data_audit 싱글 요금 판정 → 요일 4구분 칸도';
end $au$;

-- ── 적용 뒤 확인 ───────────────────────────────────────────────────────────────
do $post$
begin
  if exists (select 1 from partner_rates where kind = 'hotel' and ref_id is null) then
    raise exception '193: 호텔 공통 줄이 남았다';
  end if;
  if exists (select 1 from partner_rates where kind = 'golf' and prices ? 'wk') then
    raise exception '193: 옛 칸(wk)이 남은 골프 줄이 있다';
  end if;
  if exists (select 1 from partner_hotels where coalesce(surcharge, 0) <> 0) then
    raise exception '193: 호텔 가산이 남았다';
  end if;
  if exists (select 1 from partner_rates r, jsonb_each(r.prices) t
              where r.kind = 'hotel' and jsonb_typeof(t.value) = 'object' and (t.value ? 'wk' and not t.value ? 'mt')) then
    raise exception '193: 옛 칸(wk)만 있는 호텔 줄이 있다';
  end if;
  if to_regprocedure('public.data_audit()') is not null
     and (select prosrc from pg_proc where oid = 'public.data_audit()'::regprocedure) like '%''single''->>''wk''%' then
    raise exception '193: data_audit 싱글 요금 판정이 아직 옛 칸(wk)이다';
  end if;
end $post$;
