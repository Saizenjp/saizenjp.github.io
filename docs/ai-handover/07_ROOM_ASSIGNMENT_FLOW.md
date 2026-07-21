# 07. 객실 배정 흐름 (ROOM ASSIGNMENT FLOW)

> **저장소명**: `saizenjp/saizenjp.github.io`
> **브랜치**: `main`
> **기준 커밋**: `8cd0ad8` (`8cd0ad8f8f68db0a2c9679e2c6452c769846b000`)
> **작성일**: 2026-07-21
> **문서 상태**: 기술기준 (코드 근거)
> **분석 범위**: `ops/hub/room.html`, `ops/hub/shizu.html`, 관련 SQL
> **제외 범위**: 실제 데이터. 코드 미확인 운영 규칙은 `확인 필요`

---

## 1. 배정에 사용하는 데이터

- **읽기**(근거 `room.html:1239` 등): `guests`+`bookings`(inner: event_no·rep_name·dep/arr·product·member_type·remark·check_status), `guest_members`(명단·member_grade/class/div), `room_inventory`(active), `rooms`(배정 1행=1명), `room_closures`.
- **회원 판정** = `SZCore.isMember`(고객등급T·회원권구분V·회원구분U **3컬럼 OR**, 회원우선). 근거 `room.html:2243-2244`, `ops/assets/saizen-core.js`.

## 2. 객실·투숙객 구조

- `room_inventory` = 객실 마스터(facility·zone·room_no·room_type·capacity·max_capacity·active). 야마나미 호텔동/별장/쿠주/시즈 실데이터: `sql/05_room_inventory_real.sql`·`15_shizunoyado_rooms.sql`.
- `rooms` = 배정 결과(**1행=1명**, member_id=guest_members.id, inventory_id, check_in/out, assigned_pax, assign_source).
- 룸타입: 디럭스더블트윈·디럭스트윈·트윈(스탠다드)·컴팩트트윈·트리플·싱글·더블 등.

## 3. 배정 규칙 (`autoAssign()`, 근거 `room.html:2414-2530`)

1. **회원→디럭스**(`DELUXE_TYPES=['디럭스더블트윈','디럭스트윈']`, `:2234`), 일반→예약종류(`autoRoute`, `:2248-2263`).
2. **룸메 짝(A규칙)**: 명단 연속 2명(1-2, 3-4). 짝에 회원 1명이라도 있으면 디럭스(`:2487`).
3. **2-pass**(`:2501-2502`): ① 회원 짝 전 팀(예약순) → ② 일반 짝 전 팀. 각 pass 내부 `event_seq` 오름차순 선착 → 늦게 예약한 회원도 먼저 예약한 일반보다 디럭스 우선.
4. **층 규칙(청소효율, 야마나미 호텔동만)**: `SZCore.allowedFloors` — 3·4박→9·6·3층 / 7박→11·10·7·4층(고정) / 그 외→유동층 12·8·5(층마다 한 박수, 혼합 금지). 같은 팀 같은 층 우선(`pickFloor`). 근거 `:2465-2470,2282-2285`.
5. **강등**: 디럭스 부족→스탠다드→컴팩트(`:2483-2490`). **보류(hold)**: 3명팀·홀수잔여·`싱글` 지정팀(`:2459-2464`).
6. **정원 가드**: `pickRoom`이 `roomUsedFor+need<=cap`(`:2344-2351`), DB 권위조회 `dbRoomUsedPax`(다른 달 점유 포함, `:2333`), 초과 스캔·해소 "충돌 점검"(`planResolve`). DB 트리거 `sql/40_rooms_capacity_guard.sql`.
7. **폐쇄**: `room_closures`(`sql/33`)로 기간 폐쇄, `roomClosure`가 자동/수기/빈방피커 모두 차단.

## 4. 수정 및 취소 처리

- **`assign_source`**: 자동=`'auto'`, 수기/분할=`'manual'`. 자동배정 재실행은 **auto만 삭제·재정렬, manual 보호**(`:2421-2428`).
- **분할 체류(✂)**: 기준일부터 뒷부분을 다른 방으로(원행 check_out 단축 + 새 수기행).
- **해제 되돌리기(✕/↩)**: `toastUndo`+`restoreRooms`+`_roomSnap`(6초 토스트).
- **조기퇴실**: `guest_members.actual_dep`/`actual_dep_reason` 갱신(`:1980,1956,2867`) + 침대 단축 + 정산 follow-up(`sql/51`,`52`).
- 모든 배정/해제/자동배정을 `change_log`(entity=room_assign, `logAssign`)에 기록.

## 5. 출력물·관련 화면

- 배정 결과 → `frontdesk.html`(방번호·리스트), `shizu.html`(시즈 예약표), `settle.html`(folio).
- 화면: 월 피커, 일별 칩, 카드/타임라인 토글, 숙소 다중필터, 미배정 목록(현지도착일 2그룹), 오늘 퇴실, 층 비우기, 변경이력 패널.

## 6. 시즈노야도 — `shizu.html` (data-so-area=`shizu`)

- room.html 자동배정에서 **시즈 제외**(`:2261`) → `shizu.html`(`autoAssignShizu`) 전담.
- 규칙: **2인 페어만·홀수 미배정·빈방(occ===0)만** 배정. auto만 정리·**manual 보존**(주석 `shizu.html:920`). 개인 단위 배정/이동/병합 = `shizu_place` RPC(`sql/77`). 되돌리기(undo) 제공.
- SQL: `15`·`57`·`63`·`67`·`69`·`71`·`75`·`77`·`83`·`85`.

## 7. 관련 테이블·파일

- 테이블: `rooms`·`room_inventory`·`room_closures`·`guest_members`·`guests`·`bookings`·`change_log`·`followups`.
- 파일: `ops/hub/room.html`·`ops/hub/shizu.html`·`ops/assets/saizen-core.js`(allowedFloors·isMember).
- SQL: `01`·`02`·`05`·`06`·`10`·`15`·`33`·`40`·`51`·`67`·`77`·`84`.

## 8. 확인 필요 (코드상 불명확한 운영 규칙)

- 소보별장·아소별장은 자동배정 제외 대상(코드 라우팅) — 실제 현장 배정 정책 문서화 여부.
- `싱글` 지정 팀 보류 후 수기 처리 절차(현장 규칙).
- `rooms.member_id` 파일상 타입 불일치(`14_KNOWN_ISSUES` §7) — 라이브 확인.
- 시즈노야도·간지호텔 전용 카드 분리 계획(메모리상 언급) 진행 여부.
