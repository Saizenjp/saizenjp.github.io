# 04. 폴더 구조 (FOLDER STRUCTURE)

> **저장소명**: `saizenjp/saizenjp.github.io`
> **브랜치**: `main`
> **기준 커밋**: `8cd0ad8` (`8cd0ad8f8f68db0a2c9679e2c6452c769846b000`)
> **작성일**: 2026-07-21
> **문서 상태**: 기술기준 (코드에서 확인된 사실 기반)
> **분석 범위**: 저장소 전체 디렉터리·핵심 파일
> **제외 범위**: `.git`, `node_modules`(미사용), `dist`/`build`(미사용), 캐시

---

## 1. 최상위 구조

```
saizenjp.github.io/
├─ index.html            루트 진입점 → /ops/ 리다이렉트 (게이트 없음)
├─ 404.html              브랜드 안내 → /ops/
├─ privacy.html          개인정보처리방침(고객 PII, noindex)
├─ robots.txt            전면 색인 차단(Disallow: /)
├─ CLAUDE.md             ★ 정본 상세 가이드(도메인·규칙·변경이력)
├─ AGENTS.md             AI 에이전트 공통 진입 문서(요약)
├─ package.json          npm 스크립트(check/test/verify), 의존성 0
├─ app/                  단일 HTML 출력 시스템(localStorage)
├─ assets/               로고 SVG 3종
├─ design/               디자인 시스템(토큰·컴포넌트 미리보기)
├─ docs/                 기술 문서(본 인수인계 문서 포함)
├─ ops/                  ★ Supabase 기반 운영 시스템
├─ scripts/              check-syntax.mjs
├─ tests/                node:test 단위테스트
├─ .github/workflows/    ci.yml
└─ .cursor/rules/        Cursor 전용 규칙 3종
```

## 2. 진입점

| 진입점 | 역할 | 근거 |
|---|---|---|
| `/index.html` | 루트. `meta refresh` + `location.replace('./ops/'+search+hash)`로 `/ops/`로 이동. 초대/비번재설정 토큰(`#access_token`·`?code`) 보존. | `index.html` |
| `/ops/index.html` | Hub 카드 랜딩. 로그인 게이트·권한별 카드 노출. | `ops/index.html` |
| `/app/index.html` | 레거시 단일 HTML 출력 시스템(별도 축, localStorage). | `app/index.html` |

## 3. `/app/` — 단일 HTML 출력 시스템

- `app/index.html` (약 **10,869줄**) — localStorage 기반 인쇄·출력. 엠클릭 Excel 업로드 → 네임택·항공커버·현지수배서·석식명패·현장정산 등 산출. 외부 라이브러리 CDN. `../ops/assets/saizen-core.js`를 로드해 도메인 로직 일부 공유.
- 데이터 저장 = **localStorage 네임스페이스**(`manualData`, `memberMasterMap`, `tagCodeManualMap`, `tagTeamOverrideMap`, `saizen_lang` 등 — `CLAUDE.md` §3).

## 4. `/ops/` — Supabase 운영 시스템

```
ops/
├─ index.html            허브 랜딩(카드·게이트)
├─ README.md             구조 설명
├─ assets/
│  ├─ saizen-ops.js      공통 chrome·i18n·인증·페이지가드·footer·head 주입 (약 1,806줄)
│  ├─ saizen-core.js     순수 도메인 SZCore(UMD, DOM/Supabase 무의존, 약 398줄)
│  ├─ saizen-ops.css     공유 스타일
│  └─ qrcode-generator.js QR 생성 라이브러리(로컬)
├─ hub/                  운영 페이지 27종(§5)
│  └─ sql/               DB 마이그레이션 90개(§6)
└─ edge-functions/
   └─ translate-remarks/index.ts   Supabase Edge Function(비고 번역 추정 — 확인 필요)
```

### 공통(공유) 모듈

| 파일 | 역할 |
|---|---|
| `ops/assets/saizen-ops.js` | 전 ops 페이지 상단바·언어토글·로그인·페이지가드(`data-so-area`)·footer·favicon·Supabase URL+publishable key 내장·`__so_meAccess()`·맨위로 버튼 등. 변경 시 전 페이지 `?v=` 캐시버전 인상 규칙. |
| `ops/assets/saizen-core.js` | 순수 도메인 로직 단일 진실원 `SZCore`: 회원판정(`isMember`), 그룹태그(`orderGroup`), B2B 단가(`accomRate`), 박수→층(`allowedFloors`), 식사규칙(`mealPlan`), 숙박지판정(`accomFromProduct`), 출발지판정(`originPort`), F풀 겹침(`nmCodeConflict`) 등. Node·브라우저 공용(UMD). |
| `ops/assets/saizen-ops.css` | 공유 CSS 변수·컴포넌트. (단, 일부 chrome은 각 페이지 inline — `CLAUDE.md` 재고 항목) |

## 5. `/ops/hub/` — 운영 페이지 (27종)

| 파일 | 기능(요약) |
|---|---|
| `step1.html` | 엠클릭 Excel 업로드 → Supabase 적재·월 동기화 |
| `room.html` | 객실 배정(자동/수기·타임라인·분할·폐쇄) |
| `shizu.html` | 시즈노야도 예약표·개인단위 배정 |
| `dinner.html` | 석식오더·명패·식수집계·팀묶기 |
| `nametag.html` · `aircover.html` · `dispatch.html` | 네임택 · 항공커버 · 현지수배서 인쇄 |
| `qrcards.html` · `notice.html` | 주문 QR 카드 · 현장 안내문 |
| `keytag.html` · `frontdesk.html` | 키택 · 프론트데스크 통합 화면 |
| `pos.html` · `pos_customer.html` · `kitchen.html` · `menu.html` · `bill.html` | POS · 손님주문 · 주방 · 메뉴 · 청구서 |
| `settle.html` · `settle_merit.html` | 현장 정산(folio) · 메리트 B2B 정산 |
| `stats.html` · `visitor_stats.html` · `audit.html` | 경영통계 · 방문통계 · 데이터검수 |
| `groupcodes.html` | 그룹코드·회원 마스터 관리 |
| `admin.html` · `board.html` · `notes.html` | 권한관리 · 공지/요약 · 팀메모 |
| `golf.html` · `inventory.html` | 골프 조편성 · F&B·객실 재고 |

> 각 페이지의 `data-so-area`(권한 영역)·읽기/쓰기 테이블은 `03`·`07`·`08`·`09`·`13` 참조.

## 6. `/ops/hub/sql/` — DB 마이그레이션 (90개)

- 번호순 `01~87`(+ 공유 09·11~13 등). **Supabase Dashboard SQL Editor에서 수동 실행**(CLI 아님), **멱등** 작성.
- `00_VERIFY.sql` = 적용 상태 점검 쿼리. `00_DATA_AUDIT.sql` = 데이터 정합성 점검.
- 상세: `05_DATABASE_SCHEMA.md`, `11_DEPLOYMENT_GUIDE.md`.

## 7. 기타 폴더

| 폴더/파일 | 역할 | 사용 여부 |
|---|---|---|
| `assets/` | 로고 SVG(가로·가로다크·세로) | 사용(파비콘·헤더) |
| `design/` | 디자인 시스템 — `tokens.css`, `index.html`, `components/01~10*.html`, `README.md` | 개발 참조용(런타임 미로드로 추정 — **확인 필요**) |
| `docs/` | 기술 문서 — 지침·명세·블루프린트·`future-work.md`·`pre-deploy-audit.md`·`maturity-kit.md`·`ops-page-skeleton.html`·`presentation/`(ja·ko) 등 | 문서 |
| `docs/ai-handover/` | **본 인수인계 문서 세트(신규)** | 문서 |
| `scripts/check-syntax.mjs` | 전 HTML 인라인 스크립트 `vm.Script` 파싱검사 | CI·수동 |
| `tests/*.test.mjs` | `saizen-core.test.mjs`·`saizen-core-domain.test.mjs`·`saizen-core-grouptag.test.mjs` | CI·수동 |
| `.github/workflows/ci.yml` | push/PR 시 문법검사+테스트 | CI |
| `.cursor/rules/` | `saizen-core.mdc`·`ops-changes.mdc`·`app-print.mdc` | Cursor 에이전트용 |

## 8. 사용 여부가 불분명한 코드 (확인 필요)

- `app/index.html` 내 **orphan JS**(예: `buildTransfer`·`renderGolf`) — 내비 미노출, 레거시 잔존으로 `CLAUDE.md`에 기재. **확인 필요**(정리 여부).
- `design/` 폴더가 런타임에 로드되는지 — 컴포넌트 미리보기 목적으로 보이나 **확인 필요**.
- `ops/edge-functions/translate-remarks` 실제 배포·호출 여부 — **확인 필요**(`10_API_INTEGRATIONS.md`에서 재확인).

## 9. 제외 대상

`.git`(버전관리), `node_modules`(의존성 0으로 미존재), `dist`/`build`(정적 배포로 미존재), 캐시 파일 — 분석·문서 대상에서 제외.
