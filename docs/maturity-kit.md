# 엔지니어링 성숙도 키트 (다른 저장소에 이식)

> **사용법:** 이 문서 전체를 다른 시스템(예: 14hills · 메리트투어)의 Claude Code 대화창에
> 그대로 붙여넣으세요. 그 저장소의 에이전트가 아래 골격을 그대로 설치합니다.
> 정적 HTML(인라인 `<script>`) 기반 프로젝트용 **CI + 공유 모듈 + 단위 테스트** 세트입니다.
> 외부 의존성 0(Node 빌트인만) → `npm install` 없이 동작합니다.

---

## 에이전트에게: 아래를 이 저장소에 설치해줘

### 1) `scripts/check-syntax.mjs` — 전 HTML 인라인 스크립트 문법 검사

```js
/* 전 HTML 파일의 인라인(src 없는) <script> 를 vm.Script 로 '파싱만' 검사(실행 안 함).
   DOM·전역 미정의여도 문법 오류만 잡힘. 외부 의존성 0. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const SKIP = new Set(['node_modules', '.git']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}
const files = walk(process.cwd()).sort();
const RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let scripts = 0, errors = 0;
for (const f of files) {
  const html = readFileSync(f, 'utf8');
  [...html.matchAll(RE)].forEach((m, i) => {
    const code = m[1];
    if (!code.trim()) return;
    scripts++;
    try { new vm.Script(code, { filename: `${f}#script${i}` }); }
    catch (e) { errors++; console.error(`✗ ${f} (script #${i}): ${e.message}`); }
  });
}
console.log(`검사 대상: HTML ${files.length}개 · 인라인 스크립트 ${scripts}개`);
if (errors) { console.error(`\n✗ 문법 오류 ${errors}건`); process.exit(1); }
console.log('✓ 전체 인라인 스크립트 문법 검사 통과');
```

> ⚠ `<script type="module">`(ESM, import/export)이 인라인에 있으면 vm.Script가 막습니다.
> 그런 페이지가 있으면 알려줘 — 그 경우만 별도 처리한다.

### 2) `.github/workflows/ci.yml` — push/PR마다 검사+테스트

```yaml
name: CI
on:
  push:
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: 인라인 스크립트 문법 검사
        run: node scripts/check-syntax.mjs
      - name: 단위 테스트
        run: node --test "tests/**/*.test.mjs"
```

### 3) `package.json` — 없으면 생성, 있으면 `scripts`만 병합

```json
{
  "name": "REPO_NAME",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "check": "node scripts/check-syntax.mjs",
    "test": "node --test \"tests/**/*.test.mjs\"",
    "verify": "npm run check && npm test"
  }
}
```

> ⚠ **`"type": "module"` 을 넣지 마세요.** 공유 모듈(.js)이 CommonJS `module.exports`라
> .js=CJS · .mjs=ESM 으로 유지되어야 합니다.

### 4) 공유 도메인 모듈 (중복 제거 — 선택이지만 강력 추천)

여러 페이지가 **똑같이 복붙한 순수 함수**(날짜 파싱·판정 로직·계산 규칙 등)를 한 곳으로:

- `assets/<프로젝트>-core.js` 를 **UMD**로 작성 — 브라우저 전역 + Node `module.exports` 동시 지원:

```js
;(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CoreNS = api;            // 예: SZCore, MeritCore …
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function example(x){ return String(x||'').trim(); }   // ← 첫 공통 함수 이전
  return { example: example };
});
```

- 각 페이지가 `<script src="assets/<프로젝트>-core.js?v=1"></script>` 로드 후,
  **로컬 중복 정의를 위임 래퍼로 교체**: `function example(x){ return CoreNS.example(x); }`
  → 이후 그 로직은 모듈 한 곳만 고치면 전체 반영.
- 시작점: "두 군데 이상에서 똑같이 고치고 있는 함수"부터 옮긴다.

### 5) `tests/<프로젝트>-core.test.mjs` — 단위 테스트(빌트인, 의존성 0)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Core = require('../assets/<프로젝트>-core.js');

test('example 트림', () => {
  assert.equal(Core.example('  a  '), 'a');
});
```

### 6) 검증 + CLAUDE.md 기록

- 로컬 검증: `node scripts/check-syntax.mjs && node --test "tests/**/*.test.mjs"`
- 통과 확인 후 커밋·푸시(평소 브랜치 규칙대로).
- 이 저장소 `CLAUDE.md`에 "CI(문법+단위테스트) 도입 / 공유 모듈 `<프로젝트>-core.js` 단일 진실원"을
  한 줄 기록해 다음 세션이 알게 한다.

---

## 적용 순서(권장)
1. **0단계** = 1)·2)·3) 설치 + 작업을 PR 경유로 → 깨진 코드 main 차단. (효과 최고/노력 최소)
2. **1단계** = 4)·5) 공유 모듈 + 테스트로 중복 부채 해소.
3. 이후 스테이징 분리 / 마이그레이션 추적 / 백업은 시스템별로 별도 논의.

> 이 키트는 **정적 HTML + 인라인 스크립트** 구조 어디서나 동작합니다(SaiZen에서 실제 가동 중).
> 빌드 단계나 프레임워크가 있는 저장소면 그 사실을 먼저 말해줘 — CI를 그 빌드에 맞게 조정한다.
