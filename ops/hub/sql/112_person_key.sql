-- ============================================================================
--  112_person_key.sql — 명단의 신원키를 '자리번호'에서 '사람'으로 (근본 수정)
-- ----------------------------------------------------------------------------
--  문제(2026-08 진단, docs/future-work.md):
--   step1 이 guest_members 를 **(event_seq, seq_in_team)** 충돌키로 upsert 하는데,
--   seq_in_team 은 저장된 신원이 아니라 임포트할 때 명단 순서로 다시 매기는 번호다.
--   → ① 동명이인이 한 자리로 합쳐져 행이 사라지고 개인번호에 결번이 생긴다(#92294)
--     ② 명단 순서가 바뀌거나 인원이 줄면 **같은 자리에 다른 사람이 덮어써진다**
--        → 그 자리에 붙어 있던 rooms.member_id·골프 조·POS 개인청구가 **엉뚱한 사람에게 이동**(#30012382)
--
--  해결: 사람 자체를 키로 삼는다. person_key = 이름|생년6 (회원 판정 member_key 와 같은 규칙).
--        생년이 없는 사람(무기명 등)은 구분할 방법이 없으므로 이름|#자리번호 로 폴백한다.
--
--  ⚠ rooms.member_id 는 on delete cascade 다 → **기존 행 id 를 보존한 채** 키만 채운다(삭제 없음).
--  ⚠ 한 팀에 같은 사람이 두 번 들어간 기존 중복(엠클릭 No 재부여분)은
--     **먼저 들어온 행이 정키를 갖고**, 뒤 행은 `…#dup{자리}` 로 밀어 둔다.
--     다음 재임포트 때 정키 행이 갱신되고(방배정 유지) 중복 행은 정리 대상이 된다.
--  멱등. Supabase SQL Editor 수동 실행(또는 MCP apply_migration).
-- ============================================================================

alter table guest_members add column if not exists person_key text;

with base as (
  select g.id, g.event_seq, g.seq_in_team,
         coalesce(nullif(trim(coalesce(p.name_kr, g.name_kr)), ''), '무기명') as nm,
         coalesce(nullif(trim(p.birth_yymmdd), ''), '')                      as bt
  from guest_members g
  left join passengers p on p.id = g.passenger_id
), keyed as (
  select id, seq_in_team,
         case when bt <> '' then nm || '|' || bt else nm || '|#' || seq_in_team end as k,
         row_number() over (
           partition by event_seq, case when bt <> '' then nm || '|' || bt else nm || '|#' || seq_in_team end
           order by seq_in_team
         ) as rn
  from base
)
update guest_members g
   set person_key = case when k.rn = 1 then k.k else k.k || '#dup' || k.seq_in_team end
  from keyed k
 where k.id = g.id
   and (g.person_key is distinct from (case when k.rn = 1 then k.k else k.k || '#dup' || k.seq_in_team end));

-- 같은 팀에 같은 사람은 한 번만 — 이제부터 자리번호가 아니라 이 키로 갱신된다.
create unique index if not exists ux_guest_members_person on guest_members(event_seq, person_key);

-- 확인:
--   select count(*) filter (where person_key is null) as 키없음,
--          count(*) filter (where person_key like '%#dup%') as 중복밀림 from guest_members;
