-- 167: 수배 목록 — 명단에서 객실 배정·골프 조 편성(구마모토 시내·트라이얼)
--      (Min 2026-11-11 「명단에서 객실 배정이나 골프 조 편성도 가능하게 수정」)
--  ⚠ 적용 전 — Min 승인(「sql 167 적용해」) 뒤 MCP apply_migration.
--     미적용 DB 에서도 화면은 동작한다: 명단에 「명단 순 자동 배정」이 보이고 인쇄·호텔 제출 명단에도 나온다. 사람이 고른 지정을 저장하는 것만 잠긴다.
--  partner_ops.assign jsonb — 팀별 1행에 그 팀 명단의 「지정」만 담는다.
--       { "room": { "<partner_members.id>": "T1" | "R1" | "S1" … },      -- 객실: T=트윈 · R=트리플 · S=싱글 + 번호(객실 수 칸의 순서)
--         "grp":  { "<partner_members.id>": 1 | 2 … } }                   -- 골프 조 번호(묶음 팀이면 묶음 전체에서 같은 번호 = 같은 조)
--       지정하지 않은 사람은 화면이 명단 순으로 빈 자리에 넣는다(SZCore.partnerRooming · partnerGolfGroups) — 그 결과는 저장하지 않는다.
--       명단에서 빠진 사람의 id 는 다음 저장 때 지워진다. null = 전원 자동.
--  표 추가·RLS 정책·RPC 변경 없음(컬럼만) — 쓰기 권한은 partner_ops 정책 그대로(partner_<brand> 영역), anon 실행 가능 security definer 는 15 그대로(00_VERIFY 139).
--  멱등(add column if not exists · 제약은 없을 때만).

alter table public.partner_ops
  add column if not exists assign jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.partner_ops'::regclass and conname = 'partner_ops_assign_chk') then
    alter table public.partner_ops
      add constraint partner_ops_assign_chk check (assign is null or jsonb_typeof(assign) = 'object');
  end if;
end $$;

comment on column public.partner_ops.assign is '명단 지정 {room:{명단 id:방 키}, grp:{명단 id:조 번호}} — 지정한 사람만. null = 전원 자동(명단 순)';

notify pgrst, 'reload schema';
