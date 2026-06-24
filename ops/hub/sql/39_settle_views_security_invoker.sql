-- ============================================================================
--  39_settle_views_security_invoker.sql — 정산 뷰 RLS 우회 차단
-- ----------------------------------------------------------------------------
--  문제: v_folio_balance 등 정산 뷰가 security_invoker 없이 생성되어, 뷰는
--   소유자 권한으로 실행되며 기반 테이블(folios·charges·payments)의 영역 RLS(19)를
--   우회한다. → 정산 권한 없는 staff(step1·notes·kitchen·menu)나 미로그인 anon이
--   뷰 경로로 전 팀 매출·잔액을 읽을 수 있다.
--
--  ① 정산 뷰 5종을 security_invoker=on 으로 전환(호출자 권한·RLS로 평가) + anon SELECT 회수.
--  ② 부작용 보완: 프론트 데스크(front)는 체크아웃 잔액 확인이 업무 → folios/charges/payments
--     "읽기"만 front 영역에 추가 허용(쓰기는 settle/pos 그대로). 비-정산·비-프론트 영역과
--     anon 은 여전히 차단.
--
--  멱등. Postgres 15+ (Supabase). ⚠ 반드시 19 이후 실행. (19를 다시 돌리면 ②가 초기화되므로
--  그 경우 39를 재실행할 것.)
-- ============================================================================

-- ① 뷰 security_invoker + anon 회수 ------------------------------------------
do $$
declare v text;
begin
  foreach v in array array['v_folio_balance','v_settlement_by_category',
                            'v_folio_summary','v_folio_by_category','v_folio_lines'] loop
    if to_regclass('public.'||v) is not null then
      execute format('alter view public.%I set (security_invoker = on)', v);
      execute format('revoke select on public.%I from anon', v);   -- 없으면 무해(no-op)
    end if;
  end loop;
end $$;

-- ② folios/charges/payments 읽기에 front 추가(읽기 전용 — 쓰기는 19의 settle/pos 유지) ---
do $$
declare t text;
begin
  foreach t in array array['folios','charges','payments'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('create policy %I on public.%I for select to authenticated using (has_any_area(%L))',
                   t||'_sel', t, array['settle','pos','front']);
  end loop;
end $$;

-- 확인:
--   select relname, reloptions from pg_class where relname like 'v_folio%' or relname='v_settlement_by_category';
--   select tablename, policyname from pg_policies where tablename in ('folios','charges','payments') and policyname like '%_sel';
