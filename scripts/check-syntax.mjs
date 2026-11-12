/* ============================================================================
 * check-syntax.mjs — 전 HTML 파일의 인라인(src 없는) <script> 문법 검사
 * ----------------------------------------------------------------------------
 *  · CLAUDE.md §4 의 수동 검사("node --check")를 전 페이지 자동화한 것.
 *  · vm.Script 로 '파싱만' 한다(실행 안 함) → DOM·전역 미정의여도 문법 오류만 잡힘.
 *  · 외부 의존성 0(노드 빌트인만) → CI 에서 npm install 없이 즉시 실행.
 *  실행:  node scripts/check-syntax.mjs
 * ========================================================================== */
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
  const matches = [...html.matchAll(RE)];
  matches.forEach((m, i) => {
    //  JS 가 아닌 <script> 는 건너뛴다 — 구조화 데이터(application/ld+json)·템플릿 등.
    //  JSON-LD 를 JS 로 파싱하면 `"@context":` 가 라벨로 읽혀 무조건 문법 오류가 난다.
    //  ⚠ 여는 태그에서만 type 을 읽는다 — 본문까지 보면 스크립트 안의 `type="button"` 같은 글자를
    //    type 속성으로 읽어 그 스크립트를 통째로 건너뛴다(2026-11 검수: 49개 중 35개가 검사되지 않고 있었다).
    const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(openTag)?.[1]?.toLowerCase();
    const isJs = !type || /^(text\/javascript|application\/javascript|module)$/.test(type);
    if (!isJs) return;
    const code = m[1];
    if (!code.trim()) return;
    scripts++;
    try {
      new vm.Script(code, { filename: `${f}#script${i}` });
    } catch (e) {
      errors++;
      console.error(`✗ ${f} (script #${i}): ${e.message}`);
    }
  });
}

// ── 공유 asset(.js)도 파싱검사 ── 인라인만 보다가 saizen-ops.js 의 문법 오류를 놓친 적이 있다.
//    (SO_HELP 문자열 편집 중 쉼표 하나가 빠져 전 페이지의 상단바·게이트가 죽었다.)
const ASSETS = ['ops/assets/saizen-ops.js', 'ops/assets/saizen-core.js', 'ops/assets/qrcode-generator.js'];
for (const a of ASSETS) {
  let src; try { src = readFileSync(join(process.cwd(), a), 'utf8'); } catch { continue; }
  scripts++;
  try { new vm.Script(src, { filename: a }); }
  catch (e) { errors++; console.error(`✗ ${a}: ${e.message}`); }
}

console.log(`검사 대상: HTML ${files.length}개 · 인라인 스크립트 ${scripts}개`);

// ── 미정의 공용 헬퍼 검사 ───────────────────────────────────────────────
//  문법 검사는 통과하지만 실행 시 ReferenceError 로 죽는 부류를 잡는다.
//  실제 사고: room.html 이 esc() 를 정의 없이 호출 → render() 가 중간에 멈추고
//  connect() 의 catch 에 걸려 화면에 「연결 실패」로 표시됨(Supabase 는 정상이었음).
//  함수 안 지역 정의(const esc = …)도 정의로 인정한다.
const HELPERS = ['esc', 'tx', 'lang', 'toast'];
let undef = 0;
for (const f of files) {
  const html = readFileSync(f, 'utf8');
  const code = [...html.matchAll(RE)].map((m) => m[1]).join('\n');
  if (!code.trim()) continue;
  for (const name of HELPERS) {
    const used = new RegExp(`[^\\w.$]${name}\\s*\\(`).test(code);
    if (!used) continue;
    const declared = new RegExp(
      `(function\\s+${name}\\s*\\()|((const|let|var)\\s+${name}\\s*=)|(window\\.${name}\\s*=)`
    ).test(code);
    if (!declared) {
      undef++;
      console.error(`✗ ${f}: ${name}() 를 호출하는데 정의가 없습니다(실행 시 ReferenceError).`);
    }
  }
}

// ── 여러 줄 객체 리터럴 첫 줄의 // 주석 검사 ─────────────────────────────
//  문법은 멀쩡한데 **그 줄 뒤의 속성이 통째로 주석 처리**되는 부류를 잡는다.
//  실제 사고: pos.html 의 `let state={ …, grp:null,  // 설명  team:null, cart:[], … }`
//    → cart 가 사라져 renderCart 가 죽고 화면엔 「연결 실패」로만 보였다(2026-08).
//  판정: `let/const/var 이름 = {` 로 시작하는 줄에 //주석이 있고, 그 줄에서 { 가 닫히지 않으면 오류.
let midline = 0;
for (const f of files) {
  const html = readFileSync(f, 'utf8');
  const code = [...html.matchAll(RE)].map((m) => m[1]).join('\n');
  if (!code.trim()) continue;
  code.split('\n').forEach((line, i) => {
    if (!/^\s*(const|let|var)\s+[\w$]+\s*=\s*[{[]/.test(line)) return;
    //  문자열 리터럴을 먼저 지우고 본다 — 값 안의 // 나 괄호에 속지 않게.
    const bare = line
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');
    if (bare.indexOf('//') < 0) return;
    const opens = (bare.match(/[{[]/g) || []).length;
    const closes = (bare.match(/[}\]]/g) || []).length;
    if (opens > closes) {
      midline++;
      console.error(`✗ ${f}:${i + 1} 여러 줄 객체 첫 줄에 //주석 — 뒤따르는 속성이 통째로 주석 처리됩니다.`);
      console.error(`   ${line.trim().slice(0, 110)}`);
    }
  });
}

// ── 공용 asset 의 HEX 폴백 검사 ─────────────────────────────────────────
//  규칙(CLAUDE.md §8): CSS 변수만 사용, HEX 폴백 금지 — var(--accent,#3d5424) ✗ → var(--accent) ✓.
//  공용 파일은 :root 가 값을 주므로 폴백이 쓰이지 않는데, 같은 변수에 서로 다른 폴백 값이 70곳에 흩어져 있었다(2026-11 검수).
//  설명서 본문(SO_HELP·SO_HELP_TR 줄)은 보지 않는다.
let hexfb = 0;
for (const f of ['ops/assets/saizen-ops.css', 'ops/assets/saizen-ops.js']) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*'[a-z_0-9]+\.html':/.test(line) || line.startsWith('  var SO_HELP_TR = ')) return;
    const m = line.match(/var\(--[a-zA-Z0-9-]+,\s*#[0-9a-fA-F]{3,8}\)/);
    if (m) { hexfb++; console.error(`✗ ${f}:${i + 1} HEX 폴백 ${m[0]} — var(--이름) 만 씁니다.`); }
  });
}

if (errors || undef || midline || hexfb) {
  if (errors) console.error(`\n✗ 문법 오류 ${errors}건 — 위 위치를 확인하세요.`);
  if (undef) console.error(`✗ 미정의 헬퍼 ${undef}건 — 위 파일에 정의를 추가하세요.`);
  if (midline) console.error(`✗ 주석에 먹힌 속성 ${midline}건 — 주석을 윗줄로 올리세요.`);
  if (hexfb) console.error(`✗ 공용 asset 의 HEX 폴백 ${hexfb}건 — var(--이름) 만 씁니다.`);
  process.exit(1);
}
console.log('✓ 전체 인라인 스크립트 문법 검사 통과 · 공용 헬퍼 정의 · 주석에 먹힌 속성 · 공용 asset HEX 폴백 확인');
