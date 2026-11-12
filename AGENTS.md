# AGENTS.md — SaiZen Yamanami 운영 시스템

> AI 코딩 에이전트(Cursor·Claude 등) 공통 진입 문서. **정본 상세 가이드는 [`CLAUDE.md`](./CLAUDE.md)** 이며, Cursor 전용 규칙은 [`.cursor/rules/`](./.cursor/rules/)에 있다. 충돌 시 **코드 > CLAUDE.md > 이 문서** 순으로 신뢰한다.

## 무엇인가
일본 법인 SaiZen이 운영하는 아소 야마나미 리조트(구마모토)의 현장 운영 자동화. 한국 골프투어 패키지를 받아 네임택·항공커버·송영·숙박·식사·골프·정산 산출물을 자동 생성한다. 현장=일본어, 고객 소통=한국어. **응답은 한국어 존댓말.**

## 구조 (축은 `/ops/` 하나 — 레거시 `/app/` 은 2026-08 에 삭제)
- `ops/` — **Supabase** 기반 다중 페이지 Hub. 공유 `ops/assets/saizen-ops.{js,css}` + 순수 도메인 `ops/assets/saizen-core.js`. 페이지는 `ops/hub/*.html`, 마이그레이션은 `ops/hub/sql/NN_*.sql`.
- `index.html`(루트) → `./ops/` 리다이렉트(루트에 비밀번호 게이트 없음 — 접근 통제는 ops 의 Supabase 로그인 + `data-so-area` 가드 + RLS). 배포 = GitHub Pages가 `main` 루트 자동 배포.

## 명령
```bash
npm run verify          # = check-syntax + check-i18n + check-wait + check-tracked + node:test (커밋 전 필수)
node scripts/check-syntax.mjs
node --check ops/assets/saizen-ops.js
```

## 반드시 지킬 것
- **`sb_secret_…` 키는 절대 커밋/노출 금지.** 클라이언트는 publishable key만.
- 공유 asset(`saizen-ops.*`·`saizen-core.js`) 변경 시 **모든 ops 페이지 `?v=` 캐시 버전 인상**.
- `/ops/` 로컬 i18n 키에 `data-i18n` 금지(키 노출) — `id="t-"` + `applyStatic()` 사용.
- Supabase SQL 은 새 번호 파일로(멱등하게 작성) — **Min 승인 뒤 적용**, 같은 내용을 파일로 저장, `00_VERIFY.sql` 갱신. **이미 적용된 옛 번호 파일은 다시 실행하지 않는다**(05·06 은 객실 마스터·방배정을 지우고, 뒤 번호가 같은 함수·정책을 다시 정의했다).
- 검증 통과 후 `main`에 바로 커밋·푸시(상시 자동 배포). 파괴적 변경만 사전 확인.
- 디자인 토큰 `--accent:#647548`(올리브, `#3d5424`는 폐기). CSS 변수만, HEX 폴백 금지.

## 더 읽기
- 전체 규칙·도메인·이력: `CLAUDE.md`
- ops 변경 체크리스트: `.claude/skills/saizen-ops-change/SKILL.md`(본문) · `.cursor/rules/ops-changes.mdc`(요약 — 본문을 가리킨다)
- 새 ops 페이지 골격: `docs/ops-page-skeleton.html`
- Cursor에서 작업하기: `docs/CURSOR.md`
