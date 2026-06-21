-- ============================================================================
--  SaiZen Hub — 22 그룹코드 매칭 RPC (xlsx 없이 member_codes에서 매칭)
-- ----------------------------------------------------------------------------
--  step1이 그룹코드 xlsx를 매번 안 올려도, 제공한 member_key(이름+생년6) 목록에
--  대한 그룹코드만 돌려준다. member_codes 전체(PII)는 노출하지 않음.
--  security definer → 일반 담당자(step1)도 원본 PII 접근 없이 매칭만 받음.
--  실행: Supabase SQL Editor. (member_codes 존재 전제) 18·19 이후. 멱등.
-- ============================================================================

create or replace function match_group_codes(p_keys text[])
returns table(member_key text, code text, member_class text)
language sql security definer set search_path = public stable as $$
  select distinct on (mc.member_key) mc.member_key, mc.code, mc.member_class
  from member_codes mc
  where mc.member_key = any(p_keys)
  order by mc.member_key, mc.updated_at desc;
$$;
grant execute on function match_group_codes(text[]) to authenticated;

-- 확인:  select * from match_group_codes(array['황보관현590611']);
-- ============================================================================
--  끝.
-- ============================================================================
