---
name: saizen-ops-change
description: SaiZen Yamanami 운영 시스템(/ops/)에서 새 섹션(페이지)을 추가하거나 기존 화면을 수정할 때 항상 동일하게 맞춰야 하는 고정 체크리스트. ops 페이지 생성·수정, i18n(한·일·영) 추가, 권한 영역(data-so-area) 추가, Supabase RLS/마이그레이션, 설명서(SO_HELP) 갱신, 랜딩 카드 추가, 캐시 버전 범프, 배포 전 검증을 다룰 때 사용한다.
---

# SaiZen ops 변경 표준 절차 (섹션 추가·수정 공통)

**코드가 항상 정답.** 시작 전 실제 파일 상태(줄 수·버전 배지·탭/섹션 id·실제 색값)를 먼저 확인한다. 모든 화면 텍스트는 한·일·영 3개 국어, 응답은 한국어 존댓말.

이 체크리스트의 항목은 **빠뜨리면 화면이 깨지거나(키 노출) 캐시가 안 풀리거나 권한이 새는** 것들이다. 해당되는 항목만 그대로 따른다.

---

## 0. 작업 범위 판단
- **`/app/`** = 단일 HTML(localStorage·인쇄). 한 파일 안에서, 외부 라이브러리는 CDN.
- **`/ops/`** = 다중 페이지 + 공유 `assets/saizen-ops.{js,css}`(Supabase). 공통 변경은 공유 asset에서.
- 공유 asset(`saizen-ops.js/css`)을 바꾸면 → **§6 캐시 버전 범프 필수**.

## 1. i18n (가장 자주 깨지는 부분 — ⚠ §10 함정)
- **로컬 전용 키에 `data-i18n`을 쓰지 않는다.** saizen-ops의 전역 `applyLang()`이 부팅 때 모든 `data-i18n`을 자기 사전으로 덮어쓰고, **없는 키는 `t()`가 키 문자열 그대로 반환**해 화면에 `qThisMonth` 같은 키가 노출된다.
  - 로컬 키 → 마크업에 `id="t-..."` 부여 + 로컬 `applyStatic()`에서 `$('#t-...').textContent=tx('key')`로 채운다(frontdesk.html·stats.html 패턴).
  - `data-i18n`은 **전역 사전에 실제 존재하는 키**(`navHome`, `bd_*`, `ix_*` 등)에만 쓴다.
- 로컬 사전은 `const L={ ja:{...}, ko:{...}, en:{...} }` 3개 국어 **키 패리티 동일**하게. `tx(k)`는 현재 언어→ja 폴백.
  - 현재 언어: `function lang(){ return (window.SaizenOps&&SaizenOps.lang)||localStorage.getItem('saizen_lang')||'ja'; }`
- **언어 토글 훅**: `window.onSaizenLangChange=function(){ applyStatic(); if(<상태있으면>) render(); };` (동적 목록도 재렌더).
- 일본어 기본. 인쇄 산출물(/app/)은 일본어 유지. 동적으로 그리는 라벨은 렌더 함수 안에서 `tx()`로.

## 2. 페이지 chrome (새 ops 페이지)
`docs/ops-page-skeleton.html`을 복사해 시작하거나 기존 페이지(frontdesk.html)를 본뜬다. 빠뜨리면 그 페이지만 깨진다.
- `<body data-so-area="<영역>">` — 권한 가드용(§3).
- 상단바 `.topbar.so-bar`: `.so-logo`(로고 링크) + `.step`(id="t-step") + `.navhome`(data-i18n="navHome") + `.so-spacer` + `.so-controls > .so-lang`(日本語/한국어/EN 버튼 `__so_setLang`) + `.pill#conn-state`.
- `.conn` 바(sb-url/sb-key/btn-connect/hint) — 키 내장 자동연결.
- `<script src="../assets/saizen-ops.js?v=현재버전"></script>` 를 인라인 스크립트 **앞**에 둔다. CSS `<link ...saizen-ops.css?v=...>`.
- 공통 chrome(.btn/.inp/.pill/.conn/#toast 등)은 각 페이지 inline에 있다 — **스켈레톤에서 복사**(중앙 css에 없음).

## 3. 권한 영역(가드) — 새 영역을 만들 때
- 페이지: `<body data-so-area="키">`. `guardPage()`가 미로그인=로그인카드 / 권한없음=차단 오버레이.
  - 기본 규칙: admin·manager 전 통과, staff=지정 영역만. **매니저 자동통과를 막아야 하면** saizen-ops `guardPage`에 영역 특례 추가(예: `stats`는 admin 또는 areas 포함자만).
- **admin.html에 영역 등록**(빠뜨리면 admin이 부여 못 함): `AREA_KEYS` 배열 + `DEPTS` 그룹 + `a_<키>`/`ac_<키>` 라벨 **3개 국어** + 필요시 `dg_*` 그룹 라벨 3개 국어.
- **랜딩(ops/index.html) 카드**: 그룹/카드 마크업 + `data-area="키"`. 카드 노출 게이트(`gate()`의 `.card[data-area]` 루프)가 영역 키 제네릭으로 동작 — 특례 영역이면 그 루프에도 동일 특례 추가.
- 카드 헤더/설명 i18n 키(`ix_*`)를 saizen-ops 전역 사전 **3개 국어**에 추가.

## 4. Supabase SQL / RLS
- 마이그레이션은 **번호순**(`ops/hub/sql/NN_*.sql`), **멱등**(`if not exists`, `drop policy if exists` 후 `create`).
- 적용: `mcp__Supabase__apply_migration`(project_id `wzfmloivrolpwpiuyhbs`) **+ 같은 내용을 파일로 저장**(저장소 기록).
- RLS: 읽기/쓰기 영역 기준. 금액·PII 민감 테이블은 영역 제한. 함수는 `security definer set search_path=public`.
- **`ops/hub/sql/00_VERIFY.sql`에 새 객체 점검 행 추가**(컬럼/테이블/정책/함수 존재 확인).
- 키: 클라이언트=**publishable key**만. `sb_secret_`는 절대 프론트·저장소·채팅에 넣지 않는다.

## 5. 설명서(SO_HELP)
- saizen-ops.js `SO_HELP`(한국어 원문)에 `'<파일>.html'` 항목 추가 + `SO_HELP_TR`에 같은 키로 `{ja, en}` 추가. 기능을 바꾸면 해당 페이지 설명서도 같이 고친다(이 항목 누락 잦음).
- 자동 주입: 파일명이 `SO_HELP`에 있으면 `.conn` 아래에 접이식 「📖 이 페이지 설명」으로 뜬다.

## 6. 캐시 버전 범프 (공유 asset 변경 시 필수)
`saizen-ops.js` 또는 `saizen-ops.css`를 바꿨으면 **모든 ops 페이지의 `?v=` 를 동일 값으로 올린다**:
```bash
OLD=14.84; NEW=14.85
grep -rl "v=$OLD" ops --include='*.html' | while read f; do \
  sed -i "s/saizen-ops\.js?v=$OLD/saizen-ops.js?v=$NEW/g; s/saizen-ops\.css?v=$OLD/saizen-ops.css?v=$NEW/g" "$f"; done
grep -rl "v=$OLD" ops --include='*.html' | wc -l   # 0 이어야 함
```
페이지 단독 변경(공유 asset 무변경)이면 범프 불필요.

## 7. 검증 (배포 전 필수)
```bash
node scripts/check-syntax.mjs          # 전 HTML 인라인 <script> 파싱
node --check ops/assets/saizen-ops.js  # 공유 JS 문법
```
- 가능하면 jsdom 스모크 또는 핵심 함수 단위검증(경계값·집계)도. RPC는 가드 때문에 service-role로 직접 호출이 막히면 **내부 쿼리만 `execute_sql`로 검증**.
- i18n 키 패리티(ja/ko/en 동일 키) 확인.

## 8. 배포 (상시 자동 배포)
- 검증 통과 후 **확인 없이 `main`에 커밋·푸시**(GitHub Pages 자동 배포 → 라이브 즉시). 실사용자 소수.
- ⚠ **되돌리기 어려운 파괴적 변경**(대량 삭제 등)은 먼저 확인. 멱등 마이그레이션·컬럼 추가는 안전.
- 커밋: 한국어 요약 + 무엇을·왜. 모델 식별자는 커밋/PR/코드에 넣지 않는다.

---

## 빠른 자기점검 (수정 후)
1. 로컬 라벨이 `data-i18n` 아닌 `id="t-"`로 처리됐나? 3개 국어 키 패리티?
2. 공유 asset 바꿨으면 전 페이지 `?v=` 0개 남았나?
3. 새 영역이면 admin.html(AREA_KEYS/DEPTS/라벨3종) + 랜딩 카드 + 가드 특례까지 다 했나?
4. SQL 멱등·MCP적용·파일저장·00_VERIFY 갱신했나?
5. SO_HELP(ko)+SO_HELP_TR(ja/en) 갱신했나?
6. `node scripts/check-syntax.mjs` + `node --check saizen-ops.js` 통과?
