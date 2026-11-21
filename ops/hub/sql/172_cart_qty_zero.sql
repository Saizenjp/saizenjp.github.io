-- ============================================================================
-- 172_cart_qty_zero.sql — 전기카트 전량 취소: 남은 대수 0 을 저장할 수 있게
--                         (cart_bookings.qty  CHECK (qty > 0)  →  CHECK (qty >= 0))
--  상태: 적용 완료(2026-11-21, MCP · Min 승인)
-- ----------------------------------------------------------------------------
--  무엇을
--   · cart_bookings.qty 의 검사 제약을 qty > 0 에서 qty >= 0 으로 바꾼다. 제약 이름은 그대로(cart_bookings_qty_check).
--   · 바꾸기 전에 청구 트리거 cart_sync_charge() 의 운영 본문을 읽어 「그 행의 기존 청구를 지운 뒤, 대수가 0 이하면
--     새 청구를 만들지 않고 끝낸다」 분기가 있는지 확인한다. 보이지 않으면 예외로 멈춘다(제약도 바뀌지 않는다).
--     트리거 함수는 다시 만들지 않는다(본문·속성·권한 불변) — 그래서 이 파일에는 권한 줄이 없다.
--     anon 이 실행할 수 있는 security definer 함수 수(15)도 그대로다.
--  왜
--   · 카트 관리표의 현장 취소는 「남은 신청 대수(qty)」에서 「취소 대수(cancelled)」로 옮겨 담는다(95).
--     신청한 대수를 전부 취소하면 qty 0 · cancelled N 인 행이 되는데, qty > 0 제약에 걸려 저장이 통째로 실패했다
--     (같은 저장에 묶인 「전 기간」 취소분도 함께 실패).
--   · 비고로 신청한 팀의 대수를 0 으로 고치면 화면이 행을 지웠고, 다음에 열 때 「미저장」으로 보여 규칙이 대수를
--     다시 채우고 자동 확정이 요금까지 되살렸다 → 「0대 확정」을 qty 0 행으로 남긴다(화면 cart.html 수정과 한 묶음).
--   · qty 0 행의 뜻: 청구 없음(트리거가 그 행의 청구를 지우고 만들지 않는다) · 전기 신청 팀으로 세지 않는다
--     (코스 배정표 EVQ = qty 합, _signage_course_live(171) 의 ev_qty = qty 합 → 0).
--  하지 않는 일
--   · 데이터 변경 없음(운영에 qty 0 행·취소 기록 행 0건). cancelled 열·다른 제약·트리거·RLS 불변.
--   · 마감(settled) 계산서·무효(voided) 청구 줄 보호는 이 파일이 아니다 — 175(lines)가 cart_sync_charge 를 고친다.
--     172 는 함수를 건드리지 않으므로 175 와 겹치지 않는다. 순서는 172 → 175.
--     (175 를 먼저 적용했다면 아래 본문 확인이 175 의 새 본문을 본다 — 분기 글자가 달라져 멈추면 175 본문에서
--      대수 0 처리를 눈으로 확인한 뒤 아래 확인 식을 맞춘다.)
--  멱등: 이미 qty >= 0 이면 본문 확인도 건너뛰고 아무것도 바꾸지 않는다(175 적용 뒤 다시 실행해도 멈추지 않는다).
--  되돌리는 법(0대 행이 남아 있으면 옛 제약을 걸 수 없다 — 먼저 정리한다. 화면도 172 이전 판으로 되돌린다)
--    select play_date, event_seq, cart_code, cancelled, note from cart_bookings where qty = 0;   -- 지우기 전에 확인·보관
--    delete from cart_bookings where qty = 0;
--    alter table public.cart_bookings drop constraint if exists cart_bookings_qty_check;
--    alter table public.cart_bookings add  constraint cart_bookings_qty_check check (qty > 0);
--  적용: Supabase SQL Editor 또는 MCP. 93·95·100·116·122·158 이후. 화면(cart.html)보다 먼저 적용한다
--        (화면이 먼저 나가면 0대 저장은 「저장 실패 — 172 적용 필요」 안내만 뜨고 값은 바뀌지 않는다).
-- ============================================================================

do $do$
declare
  v_tbl   regclass := to_regclass('public.cart_bookings');
  v_new_n int;
  v_old_n int;
  v_src   text;
  v_guard text;
  v_head  text;
  v_names text[];
  v_name  text;
begin
  if v_tbl is null then
    raise exception '172: public.cart_bookings 표가 없다 — 93_cart.sql 을 먼저 적용한다';
  end if;

  -- 지금 걸려 있는 대수 제약(새 꼴·옛 꼴 개수)
  select count(*) filter (where pg_get_constraintdef(c.oid) ~ '\(qty >= 0\)'),
         count(*) filter (where pg_get_constraintdef(c.oid) ~ '\(qty > 0\)')
    into v_new_n, v_old_n
    from pg_constraint c
   where c.conrelid = v_tbl and c.contype = 'c';

  if v_new_n > 0 and v_old_n = 0 then
    raise notice '172: 이미 적용됨(cart_bookings.qty >= 0) — 바꾸지 않는다';
    return;
  end if;

  -- ① 청구 트리거 본문 확인 — 대수 0 인 행이 청구를 남기거나 새로 만들면 안 된다
  select p.prosrc into v_src
    from pg_proc p
   where p.oid = to_regprocedure('public.cart_sync_charge()');
  if v_src is null then
    raise exception '172: cart_sync_charge() 가 없다 — 100·116 을 먼저 적용한다(제약은 바꾸지 않았다)';
  end if;
  v_src := lower(v_src);

  --  (가) 「대수가 없거나 0 이하면 return NEW」 분기
  v_guard := substring(v_src from 'new\.qty[^;]{0,40}(?:<=\s*0|<\s*1)[^;]{0,20}then\s+return\s+new');
  if v_guard is null then
    raise exception '172: cart_sync_charge 본문에 「대수 0 이하면 청구를 만들지 않는다」 분기(if NEW.qty … <= 0 then return NEW)가 보이지 않는다 — 운영 본문을 확인한 뒤 다시 실행한다(제약은 바꾸지 않았다)';
  end if;
  --  (나) 그 분기보다 앞에서 그 행의 기존 청구를 지우고, 청구를 만드는 문장은 그 뒤에만 있다
  v_head := left(v_src, position(v_guard in v_src) - 1);
  if v_head !~ 'delete\s+from\s+(?:public\.)?charges\s+where\s+link_ref\s*=\s*(?:v_key|''cart:''\s*\|\|\s*new\.id)' then
    raise exception '172: cart_sync_charge 가 대수 확인 앞에서 그 행의 기존 청구를 지우지 않는다 — 대수를 0 으로 줄여도 청구가 남는다. 운영 본문을 확인한 뒤 다시 실행한다(제약은 바꾸지 않았다)';
  end if;
  if v_head ~ 'insert\s+into\s+(?:public\.)?charges' then
    raise exception '172: cart_sync_charge 가 대수 확인보다 먼저 청구를 만든다 — 운영 본문을 확인한 뒤 다시 실행한다(제약은 바꾸지 않았다)';
  end if;

  -- ② 제약 교체 — 옛 꼴(qty > 0)은 이름이 무엇이든 지우고, 새 꼴이 없으면 같은 이름으로 건다
  select array_agg(c.conname::text) into v_names
    from pg_constraint c
   where c.conrelid = v_tbl and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ~ '\(qty > 0\)';
  foreach v_name in array coalesce(v_names, array[]::text[]) loop
    execute format('alter table public.cart_bookings drop constraint %I', v_name);
  end loop;
  if v_new_n = 0 then
    execute 'alter table public.cart_bookings add constraint cart_bookings_qty_check check (qty >= 0)';
  end if;

  raise notice '172: cart_bookings.qty 제약을 qty >= 0 으로 바꿨다';
end $do$;

comment on column public.cart_bookings.qty is
  '남은 신청 대수(취소분은 cancelled 로 옮겨 담는다, 95). 0 = 전량 취소 또는 0대 확정(172) — 청구 없음 · 전기 신청 팀으로 세지 않는다.';

-- 확인용
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.cart_bookings'::regclass and contype = 'c';        -- cart_bookings_qty_check = CHECK ((qty >= 0))
--   select cb.play_date, cb.event_seq, cb.qty, cb.cancelled, c.id as charge_id
--     from cart_bookings cb left join charges c on c.link_ref = 'cart:'||cb.id
--    where cb.qty = 0;                                                            -- charge_id 는 모두 null 이어야 한다
