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

console.log(`검사 대상: HTML ${files.length}개 · 인라인 스크립트 ${scripts}개`);
if (errors) {
  console.error(`\n✗ 문법 오류 ${errors}건 — 위 위치를 확인하세요.`);
  process.exit(1);
}
console.log('✓ 전체 인라인 스크립트 문법 검사 통과');
