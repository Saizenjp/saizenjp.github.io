# SaiZen Yamanami 운영 시스템 — 배포 전 정밀 점검 (2026-06-24)

읽기 전용 4관점 감사(보안·정산·방배정·마이그레이션). 코드·SQL 기준. 실제 Supabase DB 상태는 일부 추측이며 Min 확인 필요 표기.

**총평**: 골격은 견고합니다 — 읽기 경로는 graceful degrade, 쓰기 경로는 가시적 실패로 설계됐고, 키 관리(`sb_secret_` 없음)·접근 게이트·권한상승 RPC·cascade·페이지네이션·CI 문법검사 모두 양호. 실배포 리스크는 **소수의 구체적 항목에 집중**돼 있고 모두 수정 가능합니다.

---

## 🔴 배포 전 반드시 고칠 것

### A. 정산 뷰가 RLS를 우회 — 돈 데이터 권한 없이 노출 (보안)
`v_folio_balance`·`v_settlement_by_category`·`v_folio_summary`·`v_folio_by_category`·`v_folio_lines` 가 `security_invoker` 없이 생성됨(`09/01/03`). 뷰는 소유자 권한으로 실행돼 `folios·charges·payments`의 영역 RLS(19)를 무시 → **정산 권한 없는 staff(front·step1 등)가 전 팀 매출·잔액 열람**. frontdesk·pos·settle이 실제 사용 중. anon(미로그인) 노출 여부는 추측(대시보드 권한 조회 필요).
→ **수정**: SQL 39 — 정산 뷰 전체를 `with (security_invoker = on)`으로 재생성 + `revoke select ... from anon`.

### B. 수기 배정의 월경계 정원 체크 회귀 (방배정)
`autoAssign`은 DB 전체 점유(occ)로 권위 체크하지만, `assignMembers`(room.html:1434)·`commitSplit`(1308)·빈방 피커는 **로드된 달의 `state.rooms`만** 봄. 다른 달 경계팀이 같은 방·겹치는 날을 점유해도 합산에서 빠져 **더블부킹**(CLAUDE.md가 "수정 완료"로 적은 버그가 수기 경로에 잔존).
→ **수정**: 수기/분할 정원 합산을 autoAssign처럼 DB 전체 점유 기준으로.

### C. DB에 정원·겹침 배제 제약 없음 — 동시편집 더블부킹 (방배정)
SQL 전체에 `EXCLUDE`/정원 트리거 없음. 유일 제약은 "같은 사람 같은 방 중복"만 막음(06). 정원은 **순수 클라이언트 검사** → 두 직원이 같은 방을 동시에 배정하면 DB가 못 막음.
→ **수정**: BEFORE INSERT 정원 검증 트리거(같은 inventory_id·겹침 점유 합산 ≥ cap이면 거부). 최소 1인실 겹침 배제 우선.

### D. settle_merit 인원 과소청구 (정산)
`pax = PCNT || b.pax`(settle_merit.html:244) — 명단이 **부분 import**되면(4명 중 2명만 passengers) PCNT=2가 예약 pax=4보다 우선 → **B2B 숙박·송영비 절반만 청구**(메리트투어 청구액 = 직접 매출). 명단 0행이면 예약 pax 폴백이라 안전하나 부분 import가 위험.
→ **수정**: `max(PCNT, b.pax)` 또는 불일치 경고 배지("명단 2/예약 4").

### E. 마이그레이션 적용 추적 부재 + 37·38 미적용 의심 (마이그레이션)
`00_VERIFY.sql`이 **01~16까지만** 검사 → 17~38(RLS·권한·신규 테이블) 누락을 못 잡음 = 배포 추적 최대 사각지대. **37(dining_group)·38(area 분리)은 방금 추가돼 거의 확실히 미적용** → 夕食 묶기 저장 실패 + print/front 페이지가 기존 room 권한자에게 차단.
→ **수정**: ① 30~38 + 17~19 적용 상태 실제 확인 후 누락분 번호순 실행 ② `00_VERIFY`를 17~38까지 확장.

### F. 31(member_class/member_div)을 step1 import보다 먼저 적용 (마이그레이션)
CLAUDE.md 명시. 미적용 상태로 업로드 시 없는 컬럼 upsert로 **import 전체 실패** 가능.
→ **수정**: E와 함께 적용 순서 보장.

---

## 🟡 운영 중 보완 (배포 후 점진)

- **folio 중복 open 유니크 제약** — `settle.html:679 openFolio`가 재조회 가드 없이 insert → 동시 개설 시 open folio 2개. SQL 한 줄로 근본 차단: `create unique index on folios(event_seq) where subject='team' and status='open';`(+개인 folio). **권장 상향(SQL 쉬움).**
- **동시 결제 중복** — 같은 folio 두 단말 전액결제 → 잔액 음수. insert 전 잔액 재조회 경고.
- **미등록 숙소 0원 무음** — settle_merit, ACCOM_RATE 4종에 없으면 숙박 0원 조용히 청구. 경고 배지.
- **N분의1 세액 ±1엔** — gross는 보존(고객 청구 정확), 세액 집계만 건당 ±1엔. 회계 정밀 필요 시.
- **confirmOrphan 모달 개선** — step1 월 동기화 삭제 시 대상 팀 목록·**배정(rooms) 보유 경고** 노출 + `badDate>0`(출발일 인식 실패) 업로드 시 자동 동기화 보수화. 경계팀 배정 cascade 유실 방지.
- **commitSplit roomClosure 가드 추가** + 분할 월경계 체크(B와 함께).
- **dinner.html:325 select error 콘솔 경고** — 컬럼 누락을 조용히 흡수해 디버그 불가.
- **settle_deductions 월삭제 잔존** — 월 완전삭제 후 재업로드 시 유령 차감.

---

## 운영 인프라 (코드 밖, 장기 안정성)

1. **스테이징 분리** — Supabase Branching(Pro 결제됨). main→Pages 직결 위험 해소.
2. **에러 수집** — 현장 콘솔 에러를 한 곳에 기록 → 보고 안 된 오류도 포착.
3. **백업 복구 1회 실연습** — Pro 일일백업 실제 되돌리기 검증.
4. **핵심 로직 자동 테스트** — 정산금액·식수·정원·월경계부터 jsdom 스모크 자산화.

---

## 양호 확인 (안심해도 되는 부분)

키 관리(`sb_secret_`/service_role 없음)·접근 게이트(UI는 우회 가능하나 RLS 백업 — 정산 뷰만 예외=A)·권한상승 RPC(`is_admin` 게이트)·가입 요청 흐름·内税 항등식(전 구간 0오차)·N분의1 gross 보존·박수 폴백·잔액 정의 일관성·개인 folio 묶음 합계·cascade/고아행·페이지네이션 1000행 한도 처리·CI 문법검사 = 모두 양호.
