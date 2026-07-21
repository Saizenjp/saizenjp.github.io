# 06. Excel 임포트 흐름 (EXCEL IMPORT FLOW)

> **저장소명**: `saizenjp/saizenjp.github.io`
> **브랜치**: `main`
> **기준 커밋**: `8cd0ad8` (`8cd0ad8f8f68db0a2c9679e2c6452c769846b000`)
> **작성일**: 2026-07-21
> **문서 상태**: 기술기준 (코드 근거)
> **분석 범위**: `ops/hub/step1.html`, `ops/hub/groupcodes.html`, 관련 SQL
> **제외 범위**: 실제 데이터 값, 엠클릭 내부 동작

---

## 1. 업로드 가능한 파일 형식·화면

- **화면**: `ops/hub/step1.html` (data-so-area=`step1`). 업로드 슬롯 **2개**: `res`(예약리스트), `ilhaeng`(일행별예약). 근거 `step1.html:379-382`.
  - ⚠ `회원그룹코드 / 회원_배정_현황` xlsx는 step1이 아니라 **`ops/hub/groupcodes.html`**(data-so-area=`groupcodes`)이 업로드·관리. 근거 `groupcodes.html:112,159,428`.
  - CLAUDE.md §6의 "업로드 카드 3개(inp1/inp2/inp5)"는 `/app/` 기준(ops step1에는 미해당).
- **파일 형식**: Excel(`.xlsx`). **읽기 = SheetJS(XLSX)** — `XLSX.read(..,{type:'array',cellDates:true})` → `sheet_to_json(첫 시트,{defval:''})`. 근거 `step1.html:451-452`. 첫 시트만 읽고, 여러 파일 드롭 시 rows `concat` 병합.

## 2. Excel 컬럼 구조 → Supabase 매핑

### 예약리스트(`res`) → `bookings` (근거 `step1.html:599-642`)
| Excel 헤더(한글) | 컬럼 |
|---|---|
| `행사번호` | event_no |
| `구분` | status (필터: 견적/대기/확정/정산만) |
| `대표고객` | rep_name (PII) |
| `회원권구분` | member_type |
| `출발일자` / `도착일자` | dep_date / arr_date |
| `예약일자`(또는 `예약일`) | reserved_at |
| `기간` | nights_label |
| `출발지` / `항공` | origin / airline |
| `상품명` | product_name |
| `판매금액` / `미수금액` | sales_amount / unpaid_amount (money) |
| `예약` | **pax (단독 사용, 예약−취소 방식 폐기)** |
| `비고` / `현지 비고` / `기타 비고` | remark / remark_local / remark_etc |
| `비고`의 `팀:xxx` | team_label (`parseTeam`) |

### 일행별예약(`ilhaeng`) → `passengers` (근거 `step1.html:680-716`)
| Excel 헤더 | 컬럼 |
|---|---|
| `pkgPsgrSeq` | id (PK) |
| `eventSeq` | event_seq (FK, 적재된 booking만) |
| `No` | seq_in_team |
| `고객명` / `영문성`+`영문이름` | name_kr / name_en |
| `성별` / `생년월일` | gender / birth·birth_yymmdd (PII) |
| `여권번호` / `만료일` / `휴대번호` | passport_no / passport_exp / phone (PII) |
| `출발편`·`귀국편`·`출발지`·`항공사`·`PNR`·`도착지` | dep_flight·ret_flight·origin·airline·pnr·dest |
| `한국출발`·`현지도착`·`현지출발`·`한국도착` | dep_time·loc_arr_time·ret_dep_time·kor_arr_time |
| `사전좌석`·`항공포함` | pre_seat·air_included |
| **`고객등급`(T)** | member_grade (fallback `회원권구분`) |
| **`회원권구분`(V)** | member_class |
| **`회원구분`(U)** | member_div |

## 3. 필수값·유효성 검사

- 예약리스트: `구분` 화이트리스트(견적/대기/확정/정산), `eventSeq` 필수, `detectAccom(상품명)`이 **야마나미/쿠주/간지/시즈 4종**이 아니면 제외(타 리조트 오염 방지). 출발일자 파싱 실패=badDate 경고. 근거 `step1.html:601,611,653`.
- 일행별예약: `event_seq`가 적재된 booking에 존재해야 통과(`validSeq`, FK 보호).

## 4. 중복 처리 (upsert 충돌키)

| 테이블 | onConflict | 근거 |
|---|---|---|
| `bookings` | `event_seq` | `step1.html:671` |
| `passengers` | `id` | `:717` |
| `guests` | `event_seq` | `:806` |
| `guest_members` | `event_seq,seq_in_team` | `:840` |

- 청크 500행 단위 upsert(`upsertChunked`, `:563-574`).

## 5. 임포트 시 생성/계산되는 정보

1. **그룹코드(회원 판정)** — `match_group_codes` RPC 호출(`:777`): 대표자 `이름+생년6자리`(member_key)로 `member_codes`에서 code 조회(PII 미노출, `sql/22_group_match.sql`).
2. **guests 생성**(`:786-805`): 회원=코드, 비회원=**F풀 자동배정**(`assignNonMemberCode`, `:759`). F풀 = 18 prefix × 33 가나 = 594/연, event_seq 영속, **30일 쿨다운 충돌회피**(`SZCore.nmCodeConflict`, `:751`), 순차 커서 분산. team_tag=`{code}-{accomPfx}`.
3. **guest_members 생성**(`:818-839`): 팀 내 `seq_in_team` 1..N 재부여, person_tag=`{group_code}-{num}{pfx}`, is_rep=(num===1), member_grade/class/div 승계.

## 6. 재임포트 정리 (데이터 정합)

- **유령행 청소**(`:843-881`): 인원 감소 시 새 명단 1..N 초과 자리 삭제. `rooms.member_id` **ON DELETE CASCADE**라 삭제 전 방배정을 같은 사람(passenger_id/이름)의 새 자리로 **re-link 보존** 후 삭제.
- **월 단위 동기화(취소 정리)**(`:927-988`): **파일에 포함된 출발일자(fileDeps) 범위에 한해** DB에 있으나 파일에 없는 팀(orphan) 자동 cascade 삭제, `change_log`(entity=cancel_log) 기록. ⚠ 과거 "그 달 전체 삭제" 버그를 fileDeps 범위로 한정.
- **개인취소 반영**(`:1012-1074`): 팀은 남고 빠진 사람 삭제. 단 일행 0건 팀은 보호.
- **팀 전체취소**(`:1075-1119`): rooms→guest_members→passengers→bookings cascade.
- **비고 팀 자동묶기**(`:883-925`): `팀:A,B` union-find → `print_overrides.team_group`(수동 묶음 보존).
- **수정이력 diff**(`:993-1010`): teams/persons added·removed·grade_changed → `import_log`/`change_log`.

## 7. 데이터 저장 순서

```
bookings upsert → passengers upsert → match_group_codes → guests upsert
→ guest_members upsert → 유령행 청소 → 월 동기화/취소 정리 → import_log·change_log
```

## 8. 업로드 이후 생성되는 정보

- `guests.group_code`·`team_tag`, `guest_members.person_tag`(태그코드) → 이후 배정·식사·인쇄가 재계산 없이 사용.
- `import_log`(counts·changes jsonb), `change_log`(cancel_log 등).

## 9. 오류 처리

- 파싱 실패·필수값 누락·타 리조트 상품 = 해당 행 제외 + 화면 경고 카운트(badDate 등). FK 위반 방지(validSeq). 파일에 없는 취소는 fileDeps 범위 내에서만 정리(안전).
- **확인 필요**: 대량 잘못된 파일 업로드 시 롤백(트랜잭션) 여부 — upsert 단위라 부분 반영 가능성.

## 10. 관련 코드/SQL 경로

- 화면: `ops/hub/step1.html`, `ops/hub/groupcodes.html`
- SQL: `01_schema.sql`(bookings/passengers/guests/guest_members), `07_passenger_air.sql`, `10_member_grade.sql`, `31_member_class.sql`, `22_group_match.sql`(match_group_codes), `08_import_log.sql`·`14`(import_log), `29_change_log.sql`
- 도메인 규칙: `ops/assets/saizen-core.js`(`isMember`·`nmCodeConflict`·`accomFromProduct`)
