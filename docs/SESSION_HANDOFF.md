# 세션 핸드오프 — 다음 세션이 그대로 이어받기

> 이 문서는 이전 세션을 종료/삭제해도 작업이 끊기지 않도록, **남은 일과 현재 상태**를 저장소에 박아둔 인계 노트다.
> 새 세션은 이 파일 + `CLAUDE.md`를 읽고 바로 이어가면 된다. (코드/SQL의 진실 원본은 항상 저장소다.)

**작성 시점 라이브 = 커밋 `21ac306` (Pages 배포 성공). 작업 브랜치 = `claude/peaceful-curie-flg7yw`.**

---

## 1. 지금까지(코드·배포 완료, 라이브 반영됨)
- room 자동배정 **A 규칙**: 명단 순서 연속 짝(1-2,3-4), **짝에 회원이 1명이라도 있으면 디럭스**, 없으면 예약종류. 3인팀·홀수 잔여는 **미배정(보류)**. (`placePairs`→`placeGivenPairs` 분리)
- room **회원/일반 뱃지 일관화**(`.gbadge`/`.gbadge.mem` CSS 클래스, 줄바꿈 방지).
- room **배정 검색**(태그·한글·영문·행사번호 → 위치 표시+점프) · **변경이력 이동 추적**(자동배정 A→B `↪️ 이동`) · **상단 컨트롤 바 고정**.
- 공지(board): **고정 기간(pin_until)** · **드래그 순서변경(sort_order)** · 랜딩 띠 **캐러셀 + 부서 뱃지**.
- **손님 확인 화면** `ops/hub/pos_customer.html` + POS 「🖥 손님 화면 표시」(`pos_display` 폴링).
- settle: **御請求書·매출요약** → HTML 미리보기 팝업+[인쇄]/[엑셀]. **現地精算表(settle_merit)** → [🖨 인쇄] + 인쇄 CSS.
- 홈: hero **부제 삭제**(제목만). 날씨 **오늘 시간별(야마나미, 아소 좌표 32.95/131.12)**. 공통 **「맨 위로」** 버튼.
- 인프라: **`.nojekyll`**(정적 배포), ops 홈 **no-cache 메타**, SQL 폴더 정리(중복 RUN_ALL 삭제).

## 2. ⚠ 남은 일 — Supabase SQL (이것만 하면 끝)
이전 세션에서 Supabase MCP 커넥터가 중간에 끊겨 **41·42를 적용 못 함.** 39·40은 적용했으나 재확인 권장.
**새 세션(Supabase MCP 연결됨)에서 적용·검증할 것:**

1. **적용 상태 확인** — SQL Editor에서 실행:
   ```sql
   select '41 pos_display 테이블' as 항목, (to_regclass('public.pos_display') is not null) as 적용됨
   union all select '42 announcements.pin_until', exists(select 1 from information_schema.columns where table_name='announcements' and column_name='pin_until')
   union all select '42 announcements.sort_order', exists(select 1 from information_schema.columns where table_name='announcements' and column_name='sort_order')
   union all select '40 rooms 정원 트리거', exists(select 1 from pg_trigger where tgname='trg_rooms_capacity')
   union all select '39 v_folio_balance 보안', exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='v_folio_balance' and 'security_invoker=on' = any(coalesce(c.reloptions,'{}')))
   order by 1;
   ```
2. **`false`인 것 적용** — 저장소의 해당 파일을 그대로 Run(전부 멱등):
   - `ops/hub/sql/39_settle_views_security_invoker.sql` (정산 뷰 RLS 우회 차단 — 보안)
   - `ops/hub/sql/40_rooms_capacity_guard.sql` (객실 더블부킹 DB 차단)
   - `ops/hub/sql/41_pos_display.sql` (**손님 확인 화면** 연동 — 이게 없으면 pos_customer·표시 버튼 무동작)
   - `ops/hub/sql/42_board_pin_sort.sql` (**공지 고정기간·순서변경**)
3. (선택) `ops/hub/sql/00_VERIFY.sql` 로 17~40 전체 점검. ※00_VERIFY엔 41·42 항목은 아직 없음 → 위 1) 쿼리로 별도 확인.

## 3. 열려있는 설계 메모(다음에 논의 가능)
- 운영 인프라(오픈 전): **스테이징 분리(Supabase Branching)** · **백업 복구 1회 실연습** · **에러 수집**. (미착수)
- 날씨 좌표를 골프장 클럽하우스 정확 위경도로 더 맞출지(현재 아소 근사).
- hero 부제: 지웠음. 원하면 "예약 데이터 한 번으로 객실·송영·식음·정산까지…" 카피로 되살리기 가능(saizen-ops.js `ix_heroP`에 ja/ko/en 보존돼 있음).

## 4. 진행 규칙(중요)
- `CLAUDE.md` 전면 준수(한국어 존댓말, 코드가 정답, 검증 후 보고).
- 작업 브랜치 `claude/peaceful-curie-flg7yw` → main 머지 → 배포.
- **Pages 배포는 연속 푸시 금지**: 한 번 푸시하면 **배포 완료를 확인한 뒤** 다음 푸시(연속 푸시 시 GitHub Pages가 충돌/hang나 라이브가 멈춘 사례 있음).
- `saizen-ops.js/css` 변경 시 전 ops 페이지 `?v=` 동반 상향(현재 `14.75`).
