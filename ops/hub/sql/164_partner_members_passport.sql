-- 164: 호텔 제출용 숙박자 명단(宿泊者名簿) — 시내·트라이얼 명단(partner_members)에 생년·여권 정보 추가 (Min 2026-11-04)
--  ✅ 2026-11-04 MCP apply_migration 적용 완료(Min 「sql 164 적용해」) — 컬럼 6·RLS 정책 불변·anon select 불가·anon secdef 15. 값은 step1 에서 그 달(11·12월)을 다시 등록하면 채워진다.
--  Min: 「호텔 제출용 명단 엑셀 — 고객명·영문성·영문이름·성별(M/F)·생년월일·여권번호·여권만료일·발행국가 + 호텔명·제목. 여권 제출 없이 처리되게」
--  159 에서 일부러 뺐던 생년·여권(일행별예약 원본 열)을 넣는다. 전화는 여전히 넣지 않는다.
--  RLS 불변(읽기 = 마스터 또는 partner_<brand> 보유자 또는 step1 / 쓰기 = step1). RPC 없음(anon secdef 15 유지).
--  적용 뒤 step1 에서 그 달을 다시 등록해야 값이 채워진다(코드는 컬럼이 없어도 그 칸만 빼고 적재).
alter table public.partner_members add column if not exists name_en_last     text;   -- 영문 성(여권 표기)
alter table public.partner_members add column if not exists name_en_first    text;   -- 영문 이름
alter table public.partner_members add column if not exists birth            date;   -- 생년월일
alter table public.partner_members add column if not exists passport_no      text;   -- 여권번호
alter table public.partner_members add column if not exists passport_exp     date;   -- 여권 만료일
alter table public.partner_members add column if not exists passport_country text;   -- 발행국가(원문 — 화면·엑셀에서 KOR 등 코드로 표기)
comment on column public.partner_members.passport_no is '호텔 제출용 宿泊者名簿(SQL 164) — 일행별예약 원본';
