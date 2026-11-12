---
name: saizen-ops-change
description: SaiZen Yamanami 운영 시스템(/ops/)에서 새 섹션(페이지)을 추가하거나 기존 화면을 수정할 때 항상 동일하게 맞춰야 하는 고정 체크리스트. ops 페이지 생성·수정, i18n(한·일·영) 추가, 권한 영역(data-so-area) 추가, Supabase RLS/마이그레이션, 설명서(SO_HELP) 갱신, 랜딩 카드 추가, 캐시 버전 범프, 배포 전 검증을 다룰 때 사용한다.
---

# SaiZen ops 변경 표준 절차 (섹션 추가·수정 공통)

**코드가 항상 정답.** 시작 전 실제 파일 상태(줄 수·버전 배지·탭/섹션 id·실제 색값)를 먼저 확인한다. 모든 화면 텍스트는 한·일·영 3개 국어, 응답은 한국어 존댓말.

이 체크리스트의 항목은 **빠뜨리면 화면이 깨지거나(키 노출) 캐시가 안 풀리거나 권한이 새는** 것들이다. 해당되는 항목만 그대로 따른다.

---

## 0. 작업 범위 판단
- (레거시 `/app/` 은 2026-08 에 삭제 — 인쇄물도 전부 `ops/hub/` 화면이다.)
- **`/ops/`** = 다중 페이지 + 공유 `assets/saizen-ops.{js,css}`(Supabase) + 순수 규칙 `assets/saizen-core.js`. 공통 변경은 공유 asset에서.
- 공유 asset(`saizen-ops.js/css`·`saizen-core.js`)을 바꾸면 → **§6 캐시 버전 범프 필수**.

## 1. i18n (가장 자주 깨지는 부분 — ⚠ §10 함정)
- **로컬 전용 키에 `data-i18n`을 쓰지 않는다.** saizen-ops의 전역 `applyLang()`이 부팅 때 모든 `data-i18n`을 자기 사전으로 덮어쓰고, **없는 키는 `t()`가 키 문자열 그대로 반환**해 화면에 `qThisMonth` 같은 키가 노출된다.
  - 로컬 키 → 마크업에 `id="t-..."` 부여 + 로컬 `applyStatic()`에서 `$('#t-...').textContent=tx('key')`로 채운다(frontdesk.html·stats.html 패턴).
  - `data-i18n`은 **전역 사전에 실제 존재하는 키**(`navHome`, `bd_*`, `ix_*` 등)에만 쓴다.
- 로컬 사전은 `const L={ ja:{...}, ko:{...}, en:{...} }` 3개 국어 **키 패리티 동일**하게. `tx(k)`는 현재 언어→ja 폴백.
  - 현재 언어: `function lang(){ return (window.SaizenOps&&SaizenOps.lang)||localStorage.getItem('saizen_lang')||'ja'; }`
- **언어 토글 훅**: `window.onSaizenLangChange=function(){ applyStatic(); if(<상태있으면>) render(); };` (동적 목록도 재렌더).
- 일본어 기본. 인쇄 산출물(현장 제출용 표)은 일본어 유지. 동적으로 그리는 라벨은 렌더 함수 안에서 `tx()`로.

## 2. 페이지 chrome (새 ops 페이지)
`docs/ops-page-skeleton.html`을 복사해 시작하거나 기존 페이지(frontdesk.html)를 본뜬다. 빠뜨리면 그 페이지만 깨진다.
- `<body data-so-area="<키>">` — 권한 가드용(§3).
- 상단바 `.topbar.so-bar`: `.so-logo`(로고 링크) + `.step`(id="t-step") + `.navhome`(data-i18n="navHome") + `.so-spacer` + `.so-controls > .so-lang`(日本語/한국어/EN 버튼 `__so_setLang`) + `.pill#conn-state`.
- `.conn` 바(sb-url/sb-key/btn-connect/hint) — 키 내장 자동연결.
- `<script src="../assets/saizen-core.js?v=…">` 다음에 `<script src="../assets/saizen-ops.js?v=…">` 를 인라인 스크립트 **앞**에 둔다(권한 판정 `SZCore.areaAllowed` 가 saizen-core 에 있다). CSS `<link ...saizen-ops.css?v=...>`. `?v=` 는 다른 화면과 같은 현재 값(§6).
- 공통 chrome(.btn/.inp/.pill/.conn/#toast 등)은 각 페이지 inline에 있다 — **스켈레톤에서 복사**(중앙 css에 없음).

## 3. 권한 영역(가드)
- 페이지: `<body data-so-area="키">`(공백으로 여러 키를 적으면 하나만 있어도 통과). `guardPage()`(saizen-ops.js)의 판정:
  - 미로그인 = 로그인 카드 / 권한 조회 실패 = 「다시 시도」 안내 / 차단된 계정 = 전면 차단.
  - **마스터(role `admin`)만 전 화면 통과.** 매니저·일반(`manager`·`staff`)은 **지정된 영역만** — 수정 영역이면 통과, 보기 영역(`read_areas`)이면 읽기 전용 띠, 둘 다 없으면 차단.
  - `data-so-area="admin"` 은 영역이 아니라 마스터 전용 화면 표시다.
- 랜딩(`ops/index.html` 의 `gate()`)도 같은 규칙: 마스터만 전 카드, 그 밖의 계정은 카드의 `data-area` 가 `SZCore.areaAllowed` 를 통과(수정 또는 보기)할 때만 보인다.
- 키 체계 = `SZCore.AREA_TREE`(`ops/assets/saizen-core.js`): 부모 키(그룹 전체) → 자식 키(화면 하나). 페이지·카드는 **자식 키**를 적는다. 트리 밖 단일 키도 있다(`step1`·`groupcodes`·`menu`·`board`·`signage`·`report`·`watch`).
- **새 화면은 자기 키를 갖는다**(기존 키를 빌려 쓰면 권한 관리에 체크표가 없다).

### 새 키 등록 순서
1. `ops/assets/saizen-core.js` 의 `AREA_TREE` 에 자식 키를 더한다(새 그룹이면 부모 키도). saizen-core 의 `?v=` 를 올린다(§6).
2. 새 번호 SQL 파일에서 `area_tree` 를 재시드한다 — 직전 재시드 파일의 목록을 통째로 이어받아 새 키를 더한다(`insert … on conflict (child) do update` + 목록 밖 행 `delete`). 기존 계정에 넘겨줄 권한이 있으면 `user_access` 승계 `update` 도 같은 파일에. `00_VERIFY.sql` 의 `area_tree` 행 수 점검과 새 키 점검 행을 고친다. 적용은 §4.
   - 직전 재시드 파일 찾기: `grep -l "insert into public.area_tree" ops/hub/sql/*.sql | sort -V | tail -1`
3. `tests/saizen-core-areas.test.mjs` 의 「SQL seed 와 AREA_TREE 가 같다」 테스트를 새 파일 이름과 새 개수로 고친다.
4. `ops/hub/admin.html` — 라벨 `a_<키>` 3개 언어(화면 이름은 랜딩 카드 이름과 같게). 새 부모 키·단일 키면 `DEPTS` 에 넣고 `ac_<키>`(여는 카드 안내)·필요하면 `dg_*` 그룹 라벨도 3개 언어. 자식 줄은 `AREA_TREE` 에서 자동으로 그려진다.
5. 랜딩 `ops/index.html` 카드에 `data-area="키"`, 카드 제목·설명 `ix_*` 를 saizen-ops.js 전역 사전 3개 언어에.
6. 페이지 `<body data-so-area="키">`.

## 4. Supabase SQL / RLS
- **새 번호 파일**(`ops/hub/sql/NN_*.sql`, 마지막 번호는 `ls ops/hub/sql | sort -V | tail -1`)로 쓴다. 새 파일은 **멱등**하게(`if not exists`, `drop policy if exists` 뒤 `create`, `create or replace`).
- **적용은 Min 승인 뒤.** 파일을 먼저 만들어 내용을 보이고, 승인을 받은 뒤 `mcp__Supabase__apply_migration`(project_id `wzfmloivrolpwpiuyhbs`)으로 적용한다. **적용한 내용과 파일이 같아야 한다** — DB 에서 직접 고친 함수가 있으면 새 번호 파일로 본문을 남긴다. 파일 머리에 적용 날짜와 검증 결과를 적는다.
- **이미 적용된 옛 번호 파일은 다시 실행하지 않는다.** 뒤 번호가 같은 함수·정책·`area_tree` 를 다시 정의했으면 옛 정의로 되돌아가고(예: `has_any_area` 는 19 → 49 → 138), 05·15 는 객실 마스터를 지웠다 다시 넣고 06 은 방배정을 비운다. 고칠 것은 새 번호 파일로 더한다.
- **`ops/hub/sql/00_VERIFY.sql`에 새 객체 점검 행 추가**(컬럼/테이블/정책/함수 존재 확인). 지운 객체의 점검 행은 같이 지운다.
- RLS: 읽기/쓰기를 영역 기준으로(`has_any_area`·`has_any_read_area`). 서버는 계정의 보유 키를 `area_expand` 로 넓혀 판정한다(SQL 138) — 정책에 **부모 키**를 적으면 그 그룹의 자식 키를 하나라도 가진 계정이 통과하고, **자식 키**를 적으면 그 키(또는 부모 키)를 가진 계정만 통과한다. 금액·PII 민감 테이블은 영역 제한.
- 함수는 `security definer set search_path=public` + 본문 첫머리에서 권한 검사. **새 RPC 는(다시 만들 때도) `revoke all on function … from public, anon;` 뒤에 `grant execute on function … to authenticated;`** — Postgres 는 함수 실행 권한을 기본으로 PUBLIC 에 주고, `create or replace` 는 옛 권한을 그대로 둔다(SQL 119·139). **손님 QR·안내 모니터처럼 비로그인이 부르는 RPC(목록·개수는 `00_VERIFY.sql` 139 행)는 예외다** — `revoke execute on function … from public;` 뒤 `grant execute on function … to anon, authenticated;`(예: 148·155). 이런 함수를 다시 만들면서 anon 을 회수하면 손님 청구서·모니터가 열리지 않는다. 비로그인(anon)에 함수나 정책을 **새로** 열면 `00_VERIFY.sql` 의 개수 점검(118 anon 정책·139 anon RPC)도 같이 고친다.
- `charges` 쓰기 RLS 는 `settle`·`pos` 뿐이다. 다른 영역에서 청구를 만들어야 하면 SECURITY DEFINER 트리거/RPC 로(예: 58 夕食 別注, 59 싱글차지, 146 `golf_add_charge`).
- 집계(SQL·화면 KPI)를 만들거나 고치면 다른 모양의 쿼리로 한 번 더 계산해 대조하고 `data_audit()` 에 짝을 넣는다(CLAUDE.md §3-3).
- 키: 클라이언트=**publishable key**만. `sb_secret_`는 절대 프론트·저장소·채팅에 넣지 않는다.

## 5. 설명서(SO_HELP)
- saizen-ops.js `SO_HELP`(한국어 원문)에 `'<파일>.html'` 항목 추가 + `SO_HELP_TR`에 같은 키로 `{ja, en}` 추가. 기능을 바꾸면 해당 페이지 설명서도 같이 고친다(이 항목 누락 잦음).
- 설명서 내용을 바꾸면 그 화면의 `SO_HELP_VER` 를 올린다(요약 줄에 N 배지가 뜬다).
- 자동 주입: 파일명이 `SO_HELP`에 있으면 `.conn` 아래에 접이식 「이 페이지 설명 · 계산 방식」으로 뜬다.

## 6. 캐시 버전 범프 (공유 asset 변경 시 필수)
`saizen-ops.js` 또는 `saizen-ops.css`를 바꿨으면 **모든 ops 페이지와 뼈대(`docs/ops-page-skeleton.html`)의 `?v=` 를 한 값으로 올린다**(js·css 는 같은 값). 숫자는 문서에 적어 두지 않고 지금 값을 읽어 올린다:
```bash
OLD=$(grep -ohE 'saizen-ops\.js\?v=[0-9.]+' ops/index.html | head -1 | cut -d= -f2)
NEW=$(awk -v o="$OLD" 'BEGIN{printf "%.1f", o+0.1}'); echo "saizen-ops $OLD -> $NEW"
grep -rlE 'saizen-ops\.(js|css)\?v=' ops docs/ops-page-skeleton.html --include='*.html' \
  | xargs sed -i -E "s/(saizen-ops\.(js|css)\?v=)[0-9.]+/\1$NEW/g"
grep -rhoE 'saizen-ops\.(js|css)\?v=[0-9.]+' ops docs/ops-page-skeleton.html | sort | uniq -c   # 새 값 하나만 나와야 한다
```
`saizen-core.js` 는 번호가 따로다(정수) — 바꿨으면 따로 올린다:
```bash
OLD=$(grep -ohE 'saizen-core\.js\?v=[0-9]+' ops/index.html | head -1 | cut -d= -f2); NEW=$((OLD+1)); echo "saizen-core $OLD -> $NEW"
grep -rlE 'saizen-core\.js\?v=' ops docs/ops-page-skeleton.html --include='*.html' \
  | xargs sed -i -E "s/(saizen-core\.js\?v=)[0-9]+/\1$NEW/g"
grep -rhoE 'saizen-core\.js\?v=[0-9]+' ops docs/ops-page-skeleton.html | sort | uniq -c           # 새 값 하나만 나와야 한다
```
- 바꾸기 전에 무엇이 바뀌는지 보려면 `sed -i -E "…/g"` 를 `sed -n -E "…/gp"` 로 바꿔 돌린다(파일을 쓰지 않고 바뀔 줄만 찍는다).
- 옛 값이 남은 화면(뼈대를 복사해 만든 새 화면 등)도 이 명령이 같은 값으로 맞춘다.
- 페이지 단독 변경(공유 asset 무변경)이면 범프 불필요.

## 7. 검증 (배포 전 필수)
```bash
npm run verify                         # 문법·정적 검사 + 언어 전환 검사 + 대기 예약 제외 검사 + 추적 파일 검사 + 단위테스트(package.json)
node --check ops/assets/saizen-ops.js  # 공유 JS 문법
```
- 가능하면 jsdom 스모크 또는 핵심 함수 단위검증(경계값·집계)도. RPC는 가드 때문에 service-role로 직접 호출이 막히면 **내부 쿼리만 `execute_sql`로 검증**.
- i18n 키 패리티(ja/ko/en 동일 키) 확인.

## 8. 배포 (상시 자동 배포)
- 검증 통과 후 **확인 없이 `main`에 커밋·푸시**(GitHub Pages 자동 배포 → 라이브 즉시). 실사용자 소수.
- ⚠ **되돌리기 어려운 파괴적 변경**(대량 삭제 등)은 먼저 확인. SQL 적용은 종류와 관계없이 Min 승인 뒤(§4).
- 커밋 전에 `git status --short` 로 올라갈 파일을 확인한다 — 데이터 파일(xlsx·csv·pdf)·비밀값은 올리지 않는다(CLAUDE.md §3-2, `.gitignore`).
- 커밋: 한국어 요약 + 무엇을·왜. 모델 식별자는 커밋/PR/코드에 넣지 않는다.

---

## 빠른 자기점검 (수정 후)
1. 로컬 라벨이 `data-i18n` 아닌 `id="t-"`로 처리됐나? 3개 국어 키 패리티?
2. 공유 asset 바꿨으면 `?v=` 가 전 화면과 뼈대에서 한 값인가(§6 의 마지막 확인 줄)?
3. 새 영역이면 AREA_TREE → SQL `area_tree`(+00_VERIFY) → areas 테스트 → admin.html 라벨 3개 언어 → 랜딩 카드까지 다 했나?
4. SQL: 새 번호 파일·멱등·Min 승인 뒤 적용·파일과 DB 가 같은가·00_VERIFY 갱신·새 RPC 의 revoke/grant?
5. SO_HELP(ko)+SO_HELP_TR(ja/en) 갱신하고 SO_HELP_VER 를 올렸나?
6. `npm run verify` + `node --check ops/assets/saizen-ops.js` 통과?
