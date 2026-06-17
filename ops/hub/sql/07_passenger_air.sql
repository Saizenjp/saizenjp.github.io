-- 07_passenger_air.sql
-- 앱 v14.0 일행별예약 신규 컬럼을 Hub로 적재하기 위한 스키마 확장 (출력 카드 마이그레이션 Phase 1).
-- 실행 순서: 기존 01~06 이후 Supabase SQL Editor에서 1회 실행.
-- 모두 add column if not exists 라 재실행 안전. 기존 데이터/동작 영향 없음(컬럼 추가만).

-- passengers: 인별 출발지 + 항공 정보 + 항공 시각 4종
alter table passengers add column if not exists origin        text;  -- 인별 출발지 (인천/김해→부산 표준화 전 원문)
alter table passengers add column if not exists airline       text;  -- 항공사 (TW/ZE)
alter table passengers add column if not exists pnr           text;  -- PNR
alter table passengers add column if not exists dest          text;  -- 도착지 (구마모토 등)
alter table passengers add column if not exists dep_time      text;  -- 往路 한국출발 시각 HH:MM
alter table passengers add column if not exists loc_arr_time  text;  -- 往路 현지(구마모토) 도착 시각 HH:MM
alter table passengers add column if not exists ret_dep_time  text;  -- 復路 현지(구마모토) 출발 시각 HH:MM
alter table passengers add column if not exists kor_arr_time  text;  -- 復路 한국 도착 시각 HH:MM
alter table passengers add column if not exists pre_seat      text;  -- 사전좌석 (포함/불포함)
alter table passengers add column if not exists air_included  text;  -- 항공포함 (포함/불포함 = air별도 여부)

-- bookings: 예약리스트 비고 3컬럼 (현지 비고 / 기타 비고). 기존 remark = 비고 원문 유지.
alter table bookings   add column if not exists remark_local  text;  -- 현지 비고
alter table bookings   add column if not exists remark_etc    text;  -- 기타 비고
