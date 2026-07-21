# 01. 저장소 개요 (REPOSITORY OVERVIEW)

> **저장소명**: `saizenjp/saizenjp.github.io`
> **브랜치**: `main`
> **기준 커밋**: `8cd0ad8` (`8cd0ad8f8f68db0a2c9679e2c6452c769846b000`)
> **작성일**: 2026-07-21
> **문서 상태**: 기술기준 (코드에서 확인된 사실 기반)
> **분석 범위**: 저장소 전체 소스 — `app/`, `ops/`, `assets/`, `design/`, `docs/`, `scripts/`, `tests/`, `.github/`, SQL 마이그레이션(`ops/hub/sql/`)
> **제외 범위**: `.git`, `node_modules`(미사용), `dist`/`build`(미사용·정적 배포), 캐시, 실제 데이터·비밀값·개인정보

---

## 1. 저장소 목적

일본 법인 **SaiZen(株式会社SaiZen)** 이 운영하는 **아소 야마나미 리조트**(구마모토현, 27홀 골프장)의 **현장 운영 자동화 시스템**이다. 한국 골프투어 패키지(**메리트투어** 송객)를 받아 네임택·항공커버·현지수배서·식사·객실·POS·정산 산출물을 생성한다.

- 현장 운영 언어 = 일본어, 고객 소통 = 한국어 → 화면은 **한·일·영 3개국어 i18n**.
- 근거: `CLAUDE.md`(정본 상세 가이드), `AGENTS.md`, `ops/README.md`.

## 2. 주요 사용자

- **현장 운영 담당자**(소수, 실사용자 2~3명 규모로 명시됨 — `CLAUDE.md`).
- 권한 3단계: **admin(마스터) / manager / staff** + 영역(area) 부여. 계정은 관리자가 Supabase Invite로 발급(자가 회원가입 없음). 근거: `ops/hub/sql/18_access_control.sql`, `ops/hub/admin.html`, `ops/assets/saizen-ops.js`.
- 고객용 화면 일부 존재: `ops/hub/pos_customer.html`(손님 태블릿 주문), `ops/hub/bill.html`(고객 청구서).

## 3. 시스템이 담당하는 업무

| 업무 | 담당 화면(대표) |
|---|---|
| 예약 Excel 임포트·저장·변환 | `ops/hub/step1.html` |
| 객실 배정 | `ops/hub/room.html`, `ops/hub/shizu.html` |
| 식사 관리(석식오더·명패) | `ops/hub/dinner.html` |
| 인쇄 산출물 | `nametag.html`·`aircover.html`·`dispatch.html`·`dinner.html`·`qrcards.html`·`notice.html` |
| 현장 체크인·키택 | `keytag.html`·`frontdesk.html` |
| POS·주방·메뉴 | `pos.html`·`pos_customer.html`·`kitchen.html`·`menu.html`·`bill.html` |
| 정산 | `settle.html`(현장 folio) · `settle_merit.html`(메리트 B2B) |
| 통계 | `stats.html`(경영) · `visitor_stats.html`(방문) · `audit.html`(데이터 검수) |
| 그룹코드·회원 마스터 | `groupcodes.html` |
| 권한 관리·공지 | `admin.html`·`board.html`·`notes.html` |
| 골프 조편성 | `golf.html` |
| 재고 | `inventory.html` |

> ⚠ 상세 업무 흐름 및 각 화면의 입출력·데이터는 `03_BUSINESS_FLOW.md` 및 `06`~`09` 참조.

## 4. 사용 기술

- **프론트엔드**: 순수 정적 HTML/CSS/JavaScript. **빌드 단계 없음**(트랜스파일·번들러 없음). 근거: `package.json`(빌드 스크립트 없음), 정적 파일 구조.
- **백엔드/DB**: **Supabase**(PostgreSQL + Auth + RLS + Edge Functions). 서버 코드는 SQL 마이그레이션(`ops/hub/sql/*.sql`)과 Edge Function 1건(`ops/edge-functions/translate-remarks/index.ts`).
- **외부 라이브러리(CDN, 인라인 로드)** — 근거: `app/index.html`, `ops/**`:
  - `@supabase/supabase-js@2` (Supabase 클라이언트)
  - `xlsx@0.18.5` (SheetJS — Excel **읽기**)
  - `exceljs 4.3.0` (Excel **쓰기**)
  - `html5-qrcode@2.3.8` (QR 스캔)
  - `pretendard@1.3.9` (폰트)
  - 로컬: `ops/assets/qrcode-generator.js` (QR 생성)
- **공유 모듈**: `ops/assets/saizen-ops.js`(공통 chrome·i18n·인증·페이지가드), `ops/assets/saizen-core.js`(순수 도메인 로직 `SZCore`, UMD — 브라우저 전역 + Node `module.exports`), `ops/assets/saizen-ops.css`.
- **테스트/검증(Node)**: `node:test` 단위테스트(`tests/*.test.mjs`), 인라인 스크립트 문법검사(`scripts/check-syntax.mjs`). 의존성 0.

## 5. 실행 환경

- **배포/실행**: **GitHub Pages** — `main` 브랜치 루트를 자동 배포 → `https://saizenjp.github.io/`. 근거: `CLAUDE.md`, `AGENTS.md`.
- **진입점**: 루트 `index.html`이 `meta refresh` + `location.replace('./ops/' + search + hash)`로 **`/ops/`로 리다이렉트**(0.5초). 접근 비밀번호 게이트 없음. 근거: `index.html`.
- **Supabase 제약**: `file://` 차단 → `https://`(GitHub Pages) 또는 `http://localhost`에서만 동작. 근거: `CLAUDE.md` §9.
- **두 개의 독립 축**:
  - `/app/index.html` — **단일 HTML**(약 10,869줄), **localStorage** 기반 인쇄·출력 시스템. Supabase 미사용.
  - `/ops/` — **Supabase** 기반 다중 페이지 Hub(로그인·RLS).

## 6. 주요 디렉터리 (요약 — 상세는 `04_FOLDER_STRUCTURE.md`)

```
/index.html         루트 → /ops/ 리다이렉트
/app/index.html     단일 HTML 출력 시스템(localStorage)
/assets/            로고 SVG 3종
/design/            디자인 시스템(토큰·컴포넌트 미리보기)
/ops/index.html     Hub 카드 랜딩
/ops/assets/        saizen-ops.js·saizen-core.js·saizen-ops.css·qrcode-generator.js
/ops/hub/*.html     운영 페이지 27종
/ops/hub/sql/       Supabase 마이그레이션 90개(수동 실행)
/ops/edge-functions/ Supabase Edge Function(translate-remarks)
/docs/              기술 문서
/scripts/           check-syntax.mjs
/tests/             node:test 단위테스트 3종
/.github/workflows/ci.yml   문법검사+테스트 CI
```

## 7. 외부 시스템

| 외부 시스템 | 관계 | 근거 |
|---|---|---|
| **Supabase** | Postgres DB·Auth·RLS·Edge Function 호스팅. 클라이언트가 `supabase-js@2`로 직접 접속(URL+publishable key). | `ops/assets/saizen-ops.js`, `ops/hub/sql/` |
| **메리트투어** | 한국 송객사(고객 유입 원천). 제작·제공 표기. | `CLAUDE.md`, `ops/assets/saizen-ops.js`(`mountFooter`) |
| **엠클릭(M클릭)** | 메리트투어 예약 시스템사. **Excel 다운로드가 데이터 소스**(예약리스트·일행별예약·회원그룹코드). | `ops/hub/step1.html`, `CLAUDE.md` §6 |
| **GitHub Pages** | 정적 배포 호스팅. | `index.html`, `robots.txt` |

## 8. 분석 기준

- **브랜치**: `main`
- **기준 커밋 해시**: `8cd0ad8f8f68db0a2c9679e2c6452c769846b000` (short `8cd0ad8`)
- **작성일**: 2026-07-21
- **정본 문서 우선순위**(저장소 자체 규칙): **코드 > `CLAUDE.md` > `AGENTS.md`**. 근거: `AGENTS.md` 상단.
