# 08. 식사 · 송영 운영 (MEAL & SHUTTLE OPERATION)

> **저장소명**: `saizenjp/saizenjp.github.io`
> **브랜치**: `main`
> **기준 커밋**: `8cd0ad8` (`8cd0ad8f8f68db0a2c9679e2c6452c769846b000`)
> **작성일**: 2026-07-21
> **문서 상태**: 기술기준 (코드 근거)
> **분석 범위**: `ops/hub/dinner.html`, `ops/assets/saizen-core.js`, 송영 관련 코드, 관련 SQL
> **제외 범위**: 실제 데이터

---

## 1. 식사 관리 구조 — `dinner.html` (data-so-area=`print`)

- **성격**: 夕食オーダー(A3 세로 인쇄) + 朝/昼/夕 식수 자동집계 + レストラン名札. step1 데이터 기준(재계산 없음).
- **입력**: `bookings`·`guests`·`passengers`·`guest_members` + `print_overrides`(excluded·dining_group·dinner_split·exclude_reason) + `dinner_addons`.

### 식수 규칙 — `SZCore.mealPlan(team, date)` (단일 진실원, `saizen-core.js:194-214`)
- 숙소 그룹: **OFFSITE(간지·시즈)=요일 규칙** / 그 외(야마나미·쿠주)=체류 규칙. `MEAL_OFFSITE`(`:189`).
- **朝食(breakfast)**: offsite=(퇴실일 && 수/목/일) / onsite=(dep<date && arr>=date).
- **昼食(lunchKind ∈ ''|'arr'|'cont')**: onsite는 중박=cont, 입도&非PUS=arr(가츠카레), 퇴실&PUS=cont / offsite는 요일·간지 토일 등 세부.
- **夕食(dinner)**: `dep<=date && arr>date`(묵는 전원).
- **PUS/ICN 판정** = `SZCore.originPort`(항공편 ZE→PUS·TW→ICN, 부산·김해=PUS, `:150-158`).
- **조기퇴실 차감** = `SZCore.mealGoneCount`(朝=actual_dep<date, 昼夕=actual_dep<=date, `:179-184`).

### 날짜별·예약별·인원별 처리
- **날짜별**: 인쇄 기본=첫날 하루(전체 토글로 전 날짜). 밤별 식수 자동집계.
- **예약(팀)별**: 팀 pax 기준, `print_overrides.pax_override`는 폐지(현재 basePax 사용 — 태그·인원 직접수정 기능 제거됨, 묶기로 일원화).
- **인원별**: 명단(guest_members) 기준 개인 태그·이름.

### 예외 처리
- **夕食除外(exclusion)**: 팀 단위, **석식 수량에서만** 차감(朝·昼 유지), 사유 입력. SQL `35_dinner_exclude.sql`·`43_dinner_exclude_reason.sql`.
- **別注·업그레이드/알레르기**(addon): 업그레이드는 인분만큼 석식 기본수량 차감, 단가 있으면 御請求書(charges)에 자동청구(트리거 `58`), 알레르기는 청구 없음. SQL `43_dinner_addons.sql`.
- **팀 묶기(레스토랑 명패 합석)**: `print_overrides.dining_group`(같은 묶음 1장 명패, 인원 합산·식수 불변). 석식분리=`dinner_split`(`sql/60`).

### 입력·출력
- **입력**: step1 데이터 + 화면 숙소칩 필터·제외·別注·묶기.
- **출력**: 夕食オーダー A3 인쇄 프리뷰 + Excel 다운로드(ExcelJS) + レストラン名札. ※테이블No·워크인·일본고객 식수는 `/app/` 수기항목 → ops 공란.

## 2. 송영 관리 구조 — 배차 **미구현 / 백로그**

- **`/ops/`에 송영 배차(shuttle-dispatch) 기능 없음.** 전 저장소 grep(`배차`/`shuttle`/`送迎配車`/`buildTransfer`) 결과 `/ops/hub/`에 0건. 매칭은 `/app/index.html`(orphan `buildTransfer`)·`docs/*`·`CLAUDE.md`뿐. 근거: 조사 결과, `CLAUDE.md` §7(송영 배차=ops 백로그).
- `ops/hub/dispatch.html`은 이름과 달리 **現地手配書(수배서) 인쇄물**이며 배차가 아님.
- **정산에는 송영비 반영됨**: `settle_merit.html` `TRANSPORT_PER=6000`(¥/인), transport=`pax*6000`, 시트 컬럼 `송영비(¥)`. 근거 `settle_merit.html:130,407`.
- **결론**: 송영 "배차 운영"=백로그(미구현), 송영 "정산 요금"=구현됨.

## 3. 관련 테이블·화면·파일

| 항목 | 내용 |
|---|---|
| 화면 | `ops/hub/dinner.html`(식사) · `ops/hub/settle_merit.html`(송영비) |
| 도메인 | `ops/assets/saizen-core.js`(`mealPlan`·`mealOffsite`·`mealGoneCount`·`originPort`) |
| 테이블 | `print_overrides`·`dinner_addons`·`charges`(별주청구)·`guest_members`(actual_dep) |
| SQL | `35`·`43`(dinner_addons/exclude_reason)·`58`·`60` |
| 송영(정산) | `settle_merit.html`, `sql/30_settle_b2b.sql` |

## 4. 확인 필요

- 송영 배차 기능의 실제 운영 방식(수기 엑셀 등 시스템 외 처리 여부).
- 夕食 워크인/일본고객·테이블No는 `/app/` localStorage 기반 → ops 이전 여부.
- 간지·시즈 요일 규칙의 특이 케이스(수기 보정) 실제 빈도.
