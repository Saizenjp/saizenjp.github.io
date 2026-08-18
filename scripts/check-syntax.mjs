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

if (errors || undef) {
  if (errors) console.error(`\n✗ 문법 오류 ${errors}건 — 위 위치를 확인하세요.`);
  if (undef) console.error(`✗ 미정의 헬퍼 ${undef}건 — 위 파일에 정의를 추가하세요.`);
  process.exit(1);
}
console.log('✓ 전체 인라인 스크립트 문법 검사 통과 · 공용 헬퍼 정의 확인');
