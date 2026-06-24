# 세션 핸드오프 — 다음 세션이 그대로 이어받기

> 이 문서는 이전 세션을 종료/삭제해도 작업이 끊기지 않도록, **남은 일과 현재 상태**를 저장소에 박아둔 인계 노트다.
> 새 세션은 이 파일 + `CLAUDE.md`를 읽고 바로 이어가면 된다. (코드/SQL/디자인의 진실 원본은 항상 저장소다.)

**작성 시점 라이브 = 커밋 `21ac306` 이후 (Pages 배포 성공). 작업 브랜치 = `claude/peaceful-curie-flg7yw`.**

---

## ★ 새 세션 시작 시 — 이 프롬프트를 붙여넣으면 됨
```
이 저장소(saizenjp.github.io) ops 작업 이어서 함. CLAUDE.md + docs/SESSION_HANDOFF.md 먼저 읽어줘.
순서:
1) (빠른 선처리) Supabase에 39·40·41·42 적용 상태 확인하고 안 된 거 적용해줘(핸드오프 §2).
2) (주 작업) 클로드 디자인 연동 — SaiZen Ops 디자인 시스템 1차 추출(핸드오프 §3).
   /design-sync 스킬 사용. 먼저 claude.ai/design 프로젝트 연결 여부 확인하고,
   토큰 + 핵심 컴포넌트 8~10개를 design/ 미리보기 라이브러리로 추출해 동기화해줘.
작업 브랜치 claude/peaceful-curie-flg7yw 사용. 연속 푸시 금지(배포 완료 확인 후 다음).
```

---

## 1. 지금까지(코드·배포 완료, 라이브 반영됨)
- room 자동배정 **A 규칙**: 명단 순서 연속 짝(1-2,3-4), **짝에 회원 1명이라도 있으면 디럭스**, 없으면 예약종류. 3인팀·홀수 잔여 **미배정(보류)**. (`placePairs`→`placeGivenPairs` 분리)
- room **회원/일반 뱃지 일관화**(`.gbadge`/`.gbadge.mem` 클래스, 줄바꿈 방지) · **배정 검색** · **이동 이력 추적** · **상단 컨트롤 바 고정**.
- 공지(board): **고정 기간(pin_until)** · **드래그 순서(sort_order)** · 랜딩 띠 **캐러셀 + 부서 뱃지**.
- **손님 확인 화면** `ops/hub/pos_customer.html` + POS 「🖥 손님 화면 표시」(`pos_display` 폴링).
- settle: **御請求書·매출요약** → HTML 미리보기 팝업+[인쇄]/[엑셀]. **現地精算表** → [🖨 인쇄]+인쇄 CSS.
- 홈: hero **부제 삭제**. 날씨 **오늘 시간별(야마나미)**. 공통 **「맨 위로」**. `.nojekyll`·no-cache 메타.

## 2. ⚠ 선처리 — Supabase SQL (MCP 붙은 새 세션에서)
이전 세션에서 Supabase MCP가 중간에 끊겨 **41·42 미적용.** 39·40은 적용했으나 재확인 권장.
1. **적용 상태 확인** (SQL Editor):
   ```sql
   select '41 pos_display 테이블' as 항목, (to_regclass('public.pos_display') is not null) as 적용됨
   union all select '42 announcements.pin_until', exists(select 1 from information_schema.columns where table_name='announcements' and column_name='pin_until')
   union all select '42 announcements.sort_order', exists(select 1 from information_schema.columns where table_name='announcements' and column_name='sort_order')
   union all select '40 rooms 정원 트리거', exists(select 1 from pg_trigger where tgname='trg_rooms_capacity')
   union all select '39 v_folio_balance 보안', exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='v_folio_balance' and 'security_invoker=on' = any(coalesce(c.reloptions,'{}')))
   order by 1;
   ```
2. **`false`인 것 적용**(전부 멱등): `ops/hub/sql/39…40…41_pos_display.sql…42_board_pin_sort.sql`.
   - 41 없으면 **손님 확인 화면** 무동작 · 42 없으면 **공지 고정기간/순서** 무동작.

## 3. ▶ 주 작업 — 클로드 디자인 연동: "SaiZen Ops 디자인 시스템" 1차 추출
**목표**: 17개 ops 페이지에 흩어진 인라인 스타일을 **정본 디자인 시스템**으로 묶어 claude.ai/design에 미리보기 카드로 동기화. (`CLAUDE.md`가 지적한 "16페이지 1~2px 드리프트" 부채 해소의 시각판. 기존 `docs/ops-page-skeleton.html`의 발전형.)

**전제**:
- claude.ai/design **디자인 시스템 프로젝트** + 디자인 권한, **`/design-sync` 스킬** 사용.
- DesignSync 흐름: 로컬 `design/` 미리보기 라이브러리(컴포넌트별 HTML + 첫 줄 `<!-- @dsCard group="…" -->` 마커) → finalize_plan → write_files. 컴포넌트 **하나씩** 동기화(전면 교체 아님).

**⚠ 1차 결정사항(추출 전 Min 확인)**:
- **대표 `--accent` 값 충돌**: 페이지 `:root`는 **`#3d5424`**(실제 사용), 그런데 `CLAUDE.md`·브랜드·`theme-color`·saizen-ops mountHead는 **`#647548`(올리브)**. → **둘 중 무엇을 정본으로?** (디자인 시스템 토큰의 기준점이라 먼저 정해야 함. `CLAUDE.md`는 `#647548`이 정답·`#3d5424`는 폐기값이라 명시 → 추정 정본=`#647548`이나 실제 코드 다수가 `#3d5424`이므로 **확정 필요**.)
- `--accent2`도 축별로 다름: `/app/`=`#4F5E38` ↔ Hub=`#9a7322`(골드). 시스템에선 명확히 분리 표기.

**컴포넌트 인벤토리(코드 실측 빈도순 — 1차 8~10개 우선)**:
1. **토큰**: 색(accent/accent2/surface/bg/border/text + ok/warn/err), 폰트(JetBrains Mono · Noto Sans KR), 라운드·간격.
2. **버튼** `.btn` (+ `.ghost` `.sm` `.big` `.connected`) — 117회
3. **입력** `.inp` + 연결바 `.conn` — 46/61회
4. **칩** `.chip`/`.on` + 날짜칩 + venue탭 — 61회
5. **상태 알약/뱃지** `.pill`(ok/err/warn) · `.gbadge`(회원/일반) · `.dbadge`(부서) · `.repbadge`(REP) — 56회
6. **카드** `.card`(랜딩) · 팀카드(`.team-btn`) · 객실카드(`.room`) — 30회
7. **상단바** `.topbar`/`.so-bar` (로고·언어토글 `.so-lang`·후리가나 `.so-furi`·담당자 `.so-user`·로그인 `.so-auth`) — 50회 (※saizen-ops.css에 일부 중앙화됨)
8. **패널** `.panel` — 35회
9. **표** `table.list` (정산·명단)
10. **토스트** `.toast`(ok/err/warn) — 60회
11. (보조) settle 요약박스 `.sbox`/`.grand`, **인쇄 문서**(네이비/모노 御請求書·精算表)

**1차 추출 권장 범위**: 토큰 + 2~8번(버튼·입력·칩·뱃지·카드·상단바·패널·토스트). 9~11은 2차.
**산출물**: `design/` 폴더(컴포넌트별 미리보기 HTML + `@dsCard`), claude.ai/design에 동기화된 디자인 시스템.
**주의**: 추출은 **읽어서 정리**만 — 운영 페이지 동작/색을 임의로 안 바꿈(정본 결정 전까지). 토큰 충돌은 위 결정 후 반영.

## 4. 열린 설계 메모(여유 시)
- 운영 인프라(오픈 전): 스테이징(Supabase Branching) · 백업 복구 1회 실연습 · 에러 수집.
- 날씨 좌표를 골프장 클럽하우스 정확 위경도로 보정(현재 아소 근사 32.95/131.12).
- hero 부제: 지웠음. 되살리려면 saizen-ops.js `ix_heroP`(ja/ko/en 보존)에 다시 연결.

## 5. 진행 규칙(중요)
- `CLAUDE.md` 전면 준수(한국어 존댓말, 코드가 정답, 검증 후 보고).
- 브랜치 `claude/peaceful-curie-flg7yw` → main 머지 → 배포.
- **Pages 배포 연속 푸시 금지**: 한 번 푸시 후 **배포 완료 확인 뒤** 다음(연속 시 GitHub Pages 충돌/hang로 라이브 멈춘 사례 있음 — 이번 세션 실제 발생).
- `saizen-ops.js/css` 변경 시 전 ops `?v=` 동반 상향(현재 `14.75`).
