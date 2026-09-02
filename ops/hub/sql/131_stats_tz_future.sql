-- ============================================================================
-- 131_stats_tz_future.sql — 통계 교정 2건 (검수 2026-09)
--
--  ① today_summary 가 날짜를 UTC 로 잘랐다.
--     DB 시간대는 UTC 인데 `charged_at::date = today(JST)` 로 비교했다 →
--     **JST 00:00~09:00 에 들어온 주문·매출이 어제로 세어진다.**
--     레스토랑·바는 밤에 마감하므로 실제로 걸리는 시간대다.
--     (실증: '2026-09-02 02:30+09' → ::date = 2026-09-01, JST 캐스팅 = 2026-09-02)
--     → (charged_at at time zone 'Asia/Tokyo')::date 로 비교.
--     덤으로 「오늘 체크인」에서 대기 예약 제외(일별 체류·가동률과 같은 규칙).
--
--  ② exec_stats 「현장 매출」에 아직 발생하지 않은 분이 섞였다.
--     전기카트 요금은 예약 시점에 만들어지고 **play_date** 로 기록된다.
--     실측 2026-09-02: 전체 ¥432,000 중 ¥200,000 이 미래 날짜
--     (9월 78,000 · 10월 102,000 · 11월 20,000).
--     「현장 매출」이라고만 적히면 이미 번 돈으로 읽힌다.
--     → totals.onsite_future / months[].future 를 더해 「이 중 예정」으로 표시.
--
--  ③ 대기 예약이 매출·청구에 얹혀 있었다.
--     대기는 메리트투어가 만실이어도 받아 두는 예약이고 **출국 전까지 정리되는** 예약이다.
--     現地精算表(settle_merit)에 들어가면 **안 온 손님을 청구**하게 된다 —
--     실측 2026-10: 대기 40팀 157명 = 숙박 ¥11,488,000 + 송영 ¥942,000.
--     → settle_merit 은 청구에서 빼고 「대기 N팀 제외」를 화면에 적는다(조용히 빼지 않는다).
--     → exec_stats 의 bk CTE 에서도 뺀다(B2B 매출·입도 팀·인원·회원 비율이 전부 여기서 나온다).
--     → 프론트 데스크 목록에서도 뺀다(현장에 오지 않는다).
--     ※ 방배정 화면은 그대로 둔다 — 확정 전 대기 팀을 챙기는 자리라 「대기예약」으로 보여야 한다.
--
--  ⚠ RPC 권한 함정(§119): revoke from public + grant to authenticated 를 같이 한다.
--  멱등(create or replace). MCP 적용 완료.
--  함수 전문은 Supabase 에 적용된 것이 정본 — 위 변경점이 이 파일의 요지다.
-- ============================================================================
revoke execute on function public.today_summary() from public;
grant  execute on function public.today_summary() to authenticated;
revoke execute on function public.exec_stats(date,date) from public;
grant  execute on function public.exec_stats(date,date) to authenticated;
