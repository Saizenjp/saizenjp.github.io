-- 166: 수배 목록 — 견적 수정값(팀별) + 골프장 블록(조 수·시작·종료)
--      (Min 2026-11-11 「견적 요금표에서 자동 ok 좋아. 그런데 견적 수정 기능도 있어야함」
--                      「기본 설정 호텔 블록처럼 골프장도 동일하게 만들어. 시작 종료」)
--  ✅ 2026-11-11 MCP apply_migration 적용 완료(Min 「적용해」) — 컬럼 4개·check 제약 2개 확인,
--     partner_ops·partner_courses 정책 수 8 그대로 · anon select 불가 그대로 · anon 실행 가능 security definer 15 유지.
--     적용 직후 값은 전부 기본(quote_fix null · block_groups 0) — 화면에서 입력하는 대로 들어간다.
--     미적용 DB 에서도 화면은 동작한다(견적 수정 칸·골프장 블록 칸만 잠김).
--  ① partner_ops.quote_fix jsonb — 견적 수정값. 키는 twin·single·triple(1인 요금)·total(팀 합계) 중 적은 것만.
--       화면 규칙: 1인 요금을 적으면 팀 합계는 그 값으로 다시 계산(객실 수 × 인원 + 송영), total 을 적으면 그 값이 팀 합계.
--       비우면(null) 요금표 자동 계산으로 돌아간다. 금액은 DB 에만 — 저장소에는 두지 않는다(§3-2).
--  ② partner_courses.block_groups / block_from / block_to — 골프장마다 하루에 잡아 둔 조 수와 그 기간(없으면 상시).
--       호텔의 block_twin / block_from / block_to 와 같은 꼴. 0 = 블록 없음(그때그때 예약).
--       화면 「이달 한눈에」 골프장 띠가 그날 조 수(팀 인원 ÷ 4 올림)를 「사용/확보」로 보여 주고 넘으면 빨강.
--  표 추가·RLS 정책·RPC 변경 없음(컬럼만) — anon 실행 가능 security definer 는 15 그대로(00_VERIFY 139).
--  멱등(add column if not exists · 제약은 없을 때만).

alter table public.partner_ops
  add column if not exists quote_fix jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.partner_ops'::regclass and conname = 'partner_ops_quote_fix_chk') then
    alter table public.partner_ops
      add constraint partner_ops_quote_fix_chk check (quote_fix is null or jsonb_typeof(quote_fix) = 'object');
  end if;
end $$;

alter table public.partner_courses
  add column if not exists block_groups integer not null default 0,
  add column if not exists block_from   date,
  add column if not exists block_to     date;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.partner_courses'::regclass and conname = 'partner_courses_block_chk') then
    alter table public.partner_courses
      add constraint partner_courses_block_chk check (block_groups >= 0 and (block_from is null or block_to is null or block_from <= block_to));
  end if;
end $$;

comment on column public.partner_ops.quote_fix        is '견적 수정값 {twin,single,triple,total} — 적은 키만. null = 요금표 자동';
comment on column public.partner_courses.block_groups is '하루에 잡아 둔 조 수(0 = 블록 없음)';

notify pgrst, 'reload schema';
