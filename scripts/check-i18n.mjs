// ============================================================================
//  check-i18n.mjs — 언어 전환 관련 회귀 검사(정적 · 외부 의존 0)
// ----------------------------------------------------------------------------
//  언어를 바꿨을 때 화면이 깨지는 사고는 늘 같은 네 가지에서 나온다.
//   ① 전역 t() 는 일본어일 때 <ruby> HTML 을 돌려준다 → textContent·placeholder 같은
//      '텍스트 전용' 자리에 넣으면 태그가 글자로 보인다(실제 사고: POS 주문 전송 버튼).
//   ② 페이지 로컬 tx() 는 두 방식이 섞여 있다 — tx(k) 로 값만 돌려주는 페이지와
//      tx(k,…) 로 인자를 적용하는 페이지. 호출 형태가 어긋나면 함수 원문이 찍히거나 죽는다.
//   ③ 언어 토글 후 동적 화면을 다시 그리는 훅(onSaizenLangChange)이 없으면 반만 바뀐다.
//  ⚠ 로컬 사전의 ja/ko/en 키 일치는 중첩 객체·함수 본문 때문에 정적 파싱이 오탐을 낸다
//     → 실제 객체를 평가하는 jsdom 스모크 검수에서 확인한다(전 페이지 × 3개 언어 × 후리가나).
// ============================================================================
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const files = [
  ...fs.readdirSync(path.join(ROOT, 'ops/hub')).filter(f => f.endsWith('.html')).map(f => 'ops/hub/' + f),
  'ops/index.html',
];

const problems = [];
const add = (f, line, msg, code) => problems.push({ f, line, msg, code });

const TEXT_SINK = /(\.textContent\s*=|\.innerText\s*=|\.placeholder\s*=|setAttribute\('(?:placeholder|title)',)/;

for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const lines = src.split('\n');

  // ① 루비 누출 — 전역 t() 를 텍스트 자리에 대입
  //    그 페이지의 텍스트 헬퍼(log/setConn/toast)가 내부에서 평문화하면 안전으로 본다.
  const helperSafe = /function (log|setConn|toast|qrStatus)\([^)]*\)\s*\{[\s\S]{0,400}?plain\(/.test(src);
  lines.forEach((line, i) => {
    if (TEXT_SINK.test(line)
      && !/textContent\s*=\s*(''|"")/.test(line)
      && /[^a-zA-Z_$.]t\(/.test(line)
      && !/plain\(|stripRuby|__so_plain/.test(line)) {
      add(f, i + 1, '전역 t() 를 텍스트 자리에 대입 → 일본어에서 <ruby> 태그가 글자로 노출(innerHTML 또는 __so_plain 사용)', line.trim().slice(0, 120));
    }
    if (!helperSafe && /\b(setConn|log|toast|qrStatus)\(\s*(''\s*\+\s*)?t\('/.test(line)) {
      add(f, i + 1, '텍스트 전용 헬퍼에 전역 t() 전달 → 태그 노출(헬퍼에서 평문화하거나 __so_plain)', line.trim().slice(0, 120));
    }
  });

  // ② tx() 시그니처 ↔ 호출 형태
  const def = src.match(/function tx\(([^)]*)\)/);
  if (def) {
    const takesArgs = /\.\.\./.test(def[1]) || def[1].split(',').length > 1;
    const withArgs = [...new Set([...src.matchAll(/\btx\('([a-zA-Z0-9_]+)'\s*,/g)].map(m => m[1]))];
    const doubled = [...new Set([...src.matchAll(/\btx\('([a-zA-Z0-9_]+)'\)\s*\(/g)].map(m => m[1]))];
    if (!takesArgs && withArgs.length) add(f, 0, `tx(k) 가 인자를 안 받는데 인자를 넘긴다 → 사전 함수 원문이 화면에 찍힌다`, withArgs.join(', '));
    if (takesArgs && doubled.length) add(f, 0, `tx(k,…) 인데 tx('k')(…) 로 두 번 호출한다 → TypeError`, doubled.join(', '));
  }

  // ③ 언어 토글 후 재렌더 훅 — 없으면 토글해도 동적 화면이 그대로 남는다
  if (/(?:const|let|var)\s+L\s*=\s*\{/.test(src) && !/onSaizenLangChange/.test(src)) {
    add(f, 0, '언어 토글 후 동적 화면을 다시 그리는 훅(onSaizenLangChange)이 없다 → 화면이 반만 바뀐다', '');
  }
}

console.log(`검사 대상: ${files.length}개 페이지`);
if (!problems.length) {
  console.log('✓ 언어 전환 검사 통과 — 루비 누출·tx 인자·재렌더 훅 이상 없음');
  process.exit(0);
}
problems.forEach(p => console.error(`✗ ${p.f}${p.line ? ':' + p.line : ''}  ${p.msg}${p.code ? '\n    ' + p.code : ''}`));
console.error(`\n✗ 언어 전환 문제 ${problems.length}건`);
process.exit(1);
