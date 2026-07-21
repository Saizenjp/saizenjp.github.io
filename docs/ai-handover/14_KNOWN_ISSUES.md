# 14. 알려진 이슈 (KNOWN ISSUES)

> **저장소명**: `saizenjp/saizenjp.github.io`
> **브랜치**: `main`
> **기준 커밋**: `8cd0ad8` (`8cd0ad8f8f68db0a2c9679e2c6452c769846b000`)
> **작성일**: 2026-07-21
> **문서 상태**: 기술기준 (코드에서 확인된 사실 기반)
> **분석 범위**: 미완성·유휴코드·테스트·정합성 위험
> **제외 범위**: 실제 데이터

---

## 1. TODO / FIXME / XXX / HACK

- **명시적 마커 실질 0건.** 단어경계 검색(`\b(TODO|FIXME|HACK)\b`, `// XXX`) 시 `app/`·`ops/` 매치 없음. `app/index.html:508,4606,4607`의 "XXX"는 base64 이미지 문자열 오탐.
- 대신 **백로그·미결은 산문 주석·문서**에 존재: `app/index.html:544-545`("送迎配車는 추후 ops 기능(백로그)"), `docs/future-work.md`, `docs/pre-deploy-audit.md`.

## 2. Orphan / Dead 코드

| 대상 | 상태 | 근거 |
|---|---|---|
| `buildTransfer()` (송영 배차) | 정의·파이프라인 유지, **nav 미노출**(진입점 없음) | `app/index.html:2239`(정의), `:2094,2113`(호출), `:544-545`(주석) |
| `renderGolf()` (골프 조합표) | 정의 유지, 골프 nav 탭 제거로 **사실상 도달 불가** | `app/index.html:3371`(정의), `:1150`(tab==='golf') |
| `mountUser()` (수기 담당자 위젯) | **dead 확정** — 초기화에서 호출 0건, `renderUser`/`editUser`도 내부 전용 → 사슬 전체 dead. 로그인 `mountAuth`로 대체 | `ops/assets/saizen-ops.js:1123`(정의만) |
| 네임택/航空カバー xlsx 다운로드 함수 | 잔존(`downloadNametag`/`downloadAircover` 등). 일부 산출물 버튼 제거로 유휴 가능 | `app/index.html:7082,7088,4599,8741` — **확인 필요**(각 버튼 렌더 여부) |

> 근거 요약: `CLAUDE.md`에도 "`/app/`엔 orphan JS(`buildTransfer`/`renderGolf` 등)만 잔존하나 내비 미노출"로 기재.

## 3. 테스트 커버리지

- **단위테스트(`tests/*.test.mjs`, node:test, 의존성 0)** — 대상은 전부 `ops/assets/saizen-core.js`(SZCore) 순수함수:
  - `saizen-core.test.mjs` — 회원판정·등급라벨·날짜파싱·`overlaps`(체류 겹침) 등.
  - `saizen-core-domain.test.mjs` — `accomRate`/`b2bFees`(정산 단가), `accomFromProduct`, `originPort`, `allowedFloors`(층배정), `mealPlan`/`mealGoneCount`(식수), `nmCodeConflict`(F풀 쿨다운) 등 회귀방지(다수).
  - `saizen-core-grouptag.test.mjs` — `teamTagN`/`personTagN`, `orderGroup`(원본 불변).
- **문법검사** `scripts/check-syntax.mjs` — 전 HTML 인라인 스크립트를 `vm.Script`로 파싱(실행 아님).
- **CI** `.github/workflows/ci.yml` — push/PR마다 Node 22에서 문법검사 + 단위테스트.
- **갭**:
  - CI에 **jsdom 스모크 없음**(권고: `docs/pre-deploy-audit.md:55`).
  - **E2E/통합 테스트 없음.**
  - 테스트는 **코어 순수함수만** — RLS·SQL·페이지 렌더·정산 뷰 권한·업로드 파이프라인은 **미검증**.

## 4. 데이터 정합성 위험 (근거: `docs/pre-deploy-audit.md`, 2026-06-24 감사)

| # | 위험 | 심각도 | 근거 |
|---|---|---|---|
| A | 정산 뷰 5종 `security_invoker` 없음 → 권한 없는 staff 금전 열람 | 상 | `:11-13` · 보완 `ops/hub/sql/39_*.sql` |
| B | 수기 배정 월경계 정원 회귀(`assignMembers`/`commitSplit`이 로드된 달만 참조) | 중 | `:15-17` |
| C | DB 정원/겹침 배제 제약 부재 → 동시편집 더블부킹(트리거 `40`은 있으나 EXCLUDE 미도입) | 상 | `:19-21` · `ops/hub/sql/40_rooms_capacity_guard.sql` |
| D | `settle_merit` 인원 과소청구(부분 import 시 PCNT<예약 pax) | 중 | `:23-25` |
| E | 마이그레이션 적용 추적 사각(과거 `00_VERIFY`가 일부만 검사) | 상 | `:27-29` |
| F | `31`(member_class/div) step1 import 전 미적용 시 upsert 실패 | 중 | `:31-33` |
| 🟡 | folio 중복 open 유니크 없음 · 동시결제 중복→잔액 음수 · 미등록 숙소 0원 무음 · N분의1 세액 ±1엔 · settle_deductions 유령 차감 | 운영보완 | `:37-46` |

> ⚠ 위 감사는 2026-06-24 시점. 이후 다수 마이그레이션(39·40·46·49·65·84·87 등)이 추가돼 일부는 완화됨. **라이브 DB 적용 상태는 `00_VERIFY.sql`로 재확인 필요.**

## 5. 인프라 위험 (근거: `docs/pre-deploy-audit.md:50-56`)

- **스테이징 미분리** — `main` 푸시가 즉시 Pages 프로덕션(무중단 검증 계층 없음).
- **에러 수집(모니터링) 없음.**
- **백업 복구 미실연습**(Supabase Pro 자동백업 존재하나 복구 리허설 여부 확인 필요).

## 6. 중복 코드 (/app/ ↔ /ops/)

- 두 진입점 병존: `/app/index.html`(단일 파일 10,869줄, 인쇄 파이프라인) ↔ `/ops/`(멀티페이지 + Supabase).
- **부분 통합**: 공통 순수 규칙은 `ops/assets/saizen-core.js`(SZCore)로 단일화(`accomRate`·`b2bFees`·`accomFromProduct`·`mealPlan`·태그 규칙·날짜/겹침 등). `/app/`도 이 모듈을 로드해 일부 위임.
- **잔존 부채**: `/app/`은 여전히 자체 인라인 로직(`buildTransfer`/`renderGolf`/네임택 계산 등) 보유 → 규칙 변경 시 양쪽 수정 필요 가능. `docs/maturity-kit.md:113` "두 군데 이상 똑같이 고치는 함수부터 이관"이 미완. **확인 필요**(잔존 이중정의 정밀 대조).

## 7. 스키마 표기 불일치 (근거: 마이그레이션 파일)

- `ops/hub/sql/06_rooms_member.sql`이 `rooms.member_id`를 `bigint`로 선언하나 `guest_members.id`는 `uuid` → **파일상 타입 불일치**. 라이브 DB 실제 타입 **확인 필요**.
- 마이그레이션 **번호 충돌**: `43_dinner_addons.sql`/`43_dinner_exclude_reason.sql`, `44_dispatch_memo_rpc.sql`/`44_settle_extras.sql`(같은 번호 2파일). **결번 `72`**.

## 8. 배포 위험 요약

- 수동 SQL 마이그레이션 + `main` 직결 배포 → 사람 실수 시 프로덕션 직접 영향. 완화: `npm run verify`(CI) + `00_VERIFY.sql`. 개선은 `15_IMPROVEMENT_BACKLOG.md` 참조.
