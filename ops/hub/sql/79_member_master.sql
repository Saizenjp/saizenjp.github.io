-- ============================================================================
--  79_member_master.sql — member_codes 확장: 회원권 단위(회원번호) + 정/지정 관계
-- ----------------------------------------------------------------------------
--  목적: 야마나미가 태그코드의 '평생 소스'가 되도록 회원 마스터(엠클릭 회원관리)를
--   member_codes에 흡수. 회원번호(회원권 단위)로 정회원·지정회원을 묶어,
--   코드 미보유 회원에게 빈 코드 배정 시 같은 회원권의 지정회원에게도 동일코드를
--   자동 부여할 수 있게 한다. (엠클릭 '직위' 컬럼 수기입력 폐지 목적)
--    · mem_no   = 회원번호(회원권 고유키. 정회원+지정회원이 공유)
--    · mem_type = 회원구분(정회원/지정회원)
--    · rep_name = 정회원명
--  member_key(이름+생년6)는 이미 1인 1행(유일) → member_key 유니크 인덱스 추가로
--   code 를 나중에 바꿀 수 있게(코드 미보유 회원 = code null 로 등록 후 배정) upsert 키 확보.
--  기존 (code, member_key) 유니크는 그대로 두어 회원_배정_현황 업로드 경로 불변.
--  멱등(add column if not exists / create index if not exists). ⚠ 수동/MCP 적용.
-- ============================================================================

alter table member_codes add column if not exists mem_no   text;   -- 회원번호(회원권 단위)
alter table member_codes add column if not exists mem_type text;   -- 정회원/지정회원
alter table member_codes add column if not exists rep_name text;   -- 정회원명

-- member_key 는 데이터상 이미 유일(5,814행=5,814키) → 사람키 upsert/갱신용 유니크 인덱스
create unique index if not exists member_codes_member_key_uidx on member_codes(member_key);

-- ⚠ PK를 (code, member_key) → member_key 로 전환하여 code 를 nullable 로.
--   (코드 미보유 회원 = code null 로 등록 후 「코드 미보유 회원」 패널에서 배정.)
--   기존 upsert 는 onConflict:'member_key' 로 통일(groupcodes importGo/saveMember).
do $$
begin
  if exists(select 1 from pg_constraint where conrelid='public.member_codes'::regclass and contype='p'
              and conname='member_codes_pkey'
              and array_length(conkey,1)=2) then
    alter table member_codes drop constraint member_codes_pkey;
    alter table member_codes alter column code drop not null;
    alter table member_codes add constraint member_codes_pkey primary key using index member_codes_member_key_uidx;
  end if;
end $$;

-- 조회 최적화: 회원권 단위 그룹핑
create index if not exists member_codes_mem_no_idx on member_codes(mem_no) where mem_no is not null;
