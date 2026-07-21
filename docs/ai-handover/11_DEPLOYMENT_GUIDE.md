# 11. 배포 가이드 (DEPLOYMENT GUIDE)

> **저장소명**: `saizenjp/saizenjp.github.io`
> **브랜치**: `main`
> **기준 커밋**: `8cd0ad8` (`8cd0ad8f8f68db0a2c9679e2c6452c769846b000`)
> **작성일**: 2026-07-21
> **문서 상태**: 기술기준 (코드에서 확인된 사실 기반)
> **분석 범위**: 빌드·배포·마이그레이션·CI
> **제외 범위**: 실제 비밀값·계정

---

## 1. 로컬 실행 방법

- **정적 사이트**이므로 별도 서버 불필요. 단, Supabase(`/ops/`)는 `file://`에서 동작하지 않음 → **로컬 정적 서버(`http://localhost`)** 필요. 근거: `CLAUDE.md` §9.
  - 예: 저장소 루트에서 임의 정적 서버 기동 후 브라우저 접속(구체 명령은 저장소에 정의되지 않음 — **확인 필요**).
- `/app/index.html`은 localStorage 기반이라 `file://`로도 열람 가능하나, 다운로드/일부 동작 제약 가능.

## 2. 개발 환경 / 검증 명령

`package.json` 스크립트 (의존성 0, Node 빌트인만 사용):

```bash
npm run check     # node scripts/check-syntax.mjs  (전 HTML 인라인 스크립트 문법검사)
npm test          # node --test "tests/**/*.test.mjs"  (saizen-core 단위테스트)
npm run verify    # check + test  (커밋 전 필수 — CLAUDE.md §4)
```

- `scripts/check-syntax.mjs` = src 없는 인라인 `<script>`를 `vm.Script`로 파싱검사(실행 아님). 근거: `package.json`, `scripts/check-syntax.mjs`.
- Node 버전: CI 기준 **Node 22**. 근거: `.github/workflows/ci.yml`.

## 3. 빌드

- **빌드 없음.** 트랜스파일·번들·최소화 단계가 없다(정적 HTML/CSS/JS 그대로 배포). 근거: `package.json`에 build 스크립트 부재, `dist`/`build` 폴더 부재.

## 4. 배포 절차 (프론트엔드)

- **GitHub Pages** 가 `main` 브랜치 **루트**를 자동 배포 → `https://saizenjp.github.io/`. 근거: `CLAUDE.md`, `AGENTS.md`.
- 운영 규칙(`CLAUDE.md` §3): **검증(`npm run verify`) 통과 후 `main`에 직접 커밋·푸시**하면 즉시 라이브 반영(상시 자동 배포). 되돌리기 어려운 파괴적 변경(DB 마이그레이션 실행·대량 삭제)만 사전 확인.
- **캐시 버전**: 공유 asset(`saizen-ops.js`/`saizen-core.js`/`saizen-ops.css`) 변경 시 **모든 ops 페이지의 `?v=` 쿼리 버전을 인상**해야 캐시 무효화됨(누락 시 구버전 로드). 근거: `AGENTS.md`, `CLAUDE.md` §8. 개별 `*.html` 페이지 편집은 버전 무관(하드 리프레시 필요).

## 5. CI

`.github/workflows/ci.yml` — 모든 `push` / `pull_request`에서:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` (node 22)
3. `node scripts/check-syntax.mjs` (인라인 문법검사)
4. `node --test "tests/**/*.test.mjs"` (단위테스트)

목적: 깨진 코드가 `main`(=Pages 프로덕션)에 들어가는 것을 차단. `npm install` 불필요(의존성 0).

> ⚠ CI는 **문법·단위테스트만** 수행. jsdom 스모크·E2E·RLS 적용검증은 CI에 없음(수동). → `14_KNOWN_ISSUES.md` 참조.

## 6. 데이터베이스 마이그레이션 절차

- 위치: `ops/hub/sql/NN_*.sql` (01~87 + 공유). 
- 실행: **Supabase Dashboard → SQL Editor에서 번호순 수동 실행**(CLI/자동 파이프라인 아님). **멱등** 작성 원칙(재실행 안전). 근거: `CLAUDE.md` §9, `ops/README.md`.
- 적용 상태 확인: `ops/hub/sql/00_VERIFY.sql` 실행 → 각 마이그레이션 적용 여부(✅/❌) 리포트. 데이터 정합성: `00_DATA_AUDIT.sql`.
- 일부 RPC/DDL은 MCP `apply_migration`으로도 적용 가능(운영자 판단). `CREATE FUNCTION` 등 DDL 실행 시 Supabase가 "destructive" 경고를 띄우나 멱등 재정의는 안전.
- ⚠ **의존 순서 주의**: 예) `31_member_class.sql`은 step1 import **전** 적용 필요(VERIFY에 'import전필수' 표기). 근거: `CLAUDE.md`, `00_VERIFY.sql`.

## 7. 필요한 외부 서비스

| 서비스 | 필요성 | 비고 |
|---|---|---|
| Supabase 프로젝트 | 필수(`/ops/` 전부) | Postgres+Auth+RLS. URL+publishable key로 접속. Pro 결제(자동 백업·Branching 활용 가능 — `CLAUDE.md`). |
| GitHub Pages | 필수(호스팅) | `main` 루트 자동 배포 |
| (Supabase Edge Function 런타임) | `translate-remarks` 배포 시 | 배포·호출 여부 **확인 필요** |

## 8. 배포 후 확인 항목

- 라이브 URL(`https://saizenjp.github.io/`) 접속 → `/ops/` 리다이렉트 정상.
- 공유 asset 변경 시 `?v=` 인상 반영(구버전 캐시 아님) 확인.
- Supabase 마이그레이션 실행 후 `00_VERIFY.sql` 전 항목 ✅.
- 로그인·페이지가드·권한별 카드 노출 동작 확인.

## 9. 롤백

- 프론트: Git 되돌리기(정적 파일) → `main` 재푸시로 이전 상태 배포. 명시적 롤백 스크립트/설정은 저장소에 없음 — **확인 필요**.
- DB: 마이그레이션은 멱등·전진 방향. 되돌림(다운 마이그레이션) 스크립트는 일반적으로 부재 — 스키마 롤백은 수동. Supabase Pro 자동 백업 활용 가능(`CLAUDE.md`). **확인 필요**(백업 복구 절차 문서화 여부).

## 10. 확인 필요 요약

- 로컬 정적 서버 기동의 표준 명령(저장소에 미정의).
- Edge Function 배포·연동 상태.
- 롤백/백업 복구 표준 절차.
