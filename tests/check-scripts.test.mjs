// 검사 스크립트(scripts/)의 회귀 테스트 — 「검사 스크립트도 검수 대상이다」(2026-11 검수 33차).
//  작은 임시 트리를 만들어 스크립트를 그대로 돌리고, 자리마다의 판정까지 대조한다
//  (「오류 줄이 있나」만 보면, 통과해야 할 사례는 검사가 그 자리를 아예 못 읽어도 통과한다).
//  사례의 이름·코드는 모두 지어낸 값이다. 비밀값 꼴은 실행 중에 이어 붙여 만든다(이 파일에는 그 꼴이 없다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { skeleton, blankHtmlComments, scriptsOf, scriptKind, failLine, CODE, STR, COMMENT, REGEX } from '../scripts/lib/js-skeleton.mjs';
import { decodeAttr } from '../scripts/lib/html-entities.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = (name) => join(ROOT, 'scripts', name);
const page = (...scripts) => '<!doctype html><html><body>\n' + scripts.map((s) => (s.startsWith('<') ? s : `<script>\n${s}\n</script>`)).join('\n') + '\n</body></html>\n';
const css = (body) => `<!doctype html><html><head><style>${body}</style></head><body></body></html>\n`;
const fn = (body) => `async function f(){\n${body}\n}`;

/* 스크립트의 출력을 읽는다 — lines(「✗ 」 오류 줄) · of(파일)(그 파일의 오류 줄) · flagged(오류가 난 파일) · sites(대기 검사의 자리별 판정) */
function report(r, files) {
  const lines = (r.stderr || '').split('\n').filter((l) => l.startsWith('✗ '));
  const keys = Object.keys(files).sort((a, b) => b.length - a.length);      /* 긴 이름부터 — 빈칸이 든 이름도 그대로 맞춘다 */
  const by = new Map();
  for (const l of lines) {
    const rest = l.slice(2);
    const k = keys.find((key) => rest.startsWith(key) && (rest.length === key.length || rest[key.length] === ':' || rest[key.length] === ' '));
    if (k) by.set(k, (by.get(k) || []).concat(l));
  }
  const sites = new Map();
  for (const l of (r.stdout || '').split('\n')) {
    if (!l.startsWith('@@')) continue;
    const o = JSON.parse(l.slice(2));
    sites.set(o.rel, (sites.get(o.rel) || []).concat(`${o.kind} ${o.verdict}`));
  }
  return { status: r.status, out: r.stdout || '', err: r.stderr || '', lines, of: (f) => by.get(f) || [], flagged: [...by.keys()].sort(), sites: (f) => (sites.get(f) || []).join(', ') };
}
function writeTree(dir, files) {
  for (const [rel, body] of Object.entries(files)) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), body); }
}
/* files = {경로: 내용} 을 임시 폴더에 쓰고 스크립트를 돌린다 */
function runIn(script, files, { env = {}, args = [], cwd = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'szchk-'));
  try {
    writeTree(dir, files);
    return report(spawnSync(process.execPath, [SCRIPT(script), ...args], { cwd: join(dir, cwd), encoding: 'utf8', env: { ...process.env, ...env } }), files);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const relOf = (i, ext = 'html') => `ops/hub/c${String(i + 1).padStart(2, '0')}.${ext}`;

/* 대기 검사 표 — cases = [[이름, 기대 판정('' = 자리 없음 · '종류 판정, 종류 판정' = 자리 순서대로), 스크립트 본문 또는 화면 전체]] */
function waitTable(cases) {
  const files = {};
  cases.forEach(([, , body], i) => { files[relOf(i)] = body.startsWith('<!doctype') ? body : page(fn(body)); });
  const r = runIn('check-wait.mjs', files, { env: { DUMP: '1' } });
  cases.forEach(([name, want], i) => {
    const rel = relOf(i);
    assert.equal(r.sites(rel), want, `${name} — 자리별 판정이 다릅니다\n${r.of(rel).join('\n')}`);
    assert.equal(r.of(rel).length > 0, /miss|long/.test(want), `${name} — ${/miss|long/.test(want) ? '오류 줄이 있어야 합니다' : '오류 줄이 없어야 합니다'}\n${r.of(rel).join('\n')}`);
  });
  assert.equal(r.status, cases.some(([, want]) => /miss|long/.test(want)) ? 1 : 0);
  return r;
}
/* 문법 검사·추적 파일 검사 표 — cases = [[이름, 기대 오류([] = 없음 · 오류 줄마다 들어 있어야 할 글), 내용, 파일 이름(생략하면 cNN.html)]] */
function errTable(script, cases, extra = {}) {
  const files = { ...extra }; const rels = [];
  cases.forEach(([, , body, name], i) => { const rel = name || relOf(i); rels.push(rel); files[rel] = body; });
  const r = runIn(script, files);
  cases.forEach(([name, want], i) => {
    const got = r.of(rels[i]);
    assert.equal(got.length, want.length, `${name} — 오류 ${want.length}줄이어야 하는데 ${got.length}줄\n${got.join('\n')}`);
    want.forEach((w) => assert.ok(got.some((l) => l.includes(w)), `${name} — 「${w}」 오류 줄이 없습니다\n${got.join('\n')}`));
  });
  return r;
}

// ── scripts/lib/js-skeleton.mjs ─────────────────────────────────────────────
test('뼈대: 글자마다 코드·문자열·주석·정규식을 가린다', () => {
  const src = "const a = 'x//y'; // 줄 주석 'q'\nconst re = /a\\/b['\"]/g, n = i++ / 2; /* 블록 */ const t = `p${ q + 'r' }s`;";
  const sk = skeleton(src);
  assert.equal(sk.ok, true);
  const kindAt = (needle, off = 0) => sk.kind[src.indexOf(needle) + off];
  assert.equal(kindAt("'x//y'"), STR);
  assert.equal(kindAt('// 줄 주석'), COMMENT);
  assert.equal(kindAt("'q'"), COMMENT, '주석 안의 따옴표는 주석이다');
  assert.equal(kindAt('/a\\/b'), REGEX);
  assert.equal(kindAt('/ 2'), CODE, 'i++ 뒤의 / 는 나눗셈이다');
  assert.equal(kindAt('/* 블록 */'), COMMENT);
  assert.equal(kindAt('`p'), STR);
  assert.equal(kindAt('q + '), CODE, '템플릿의 ${ } 안은 코드다');
  assert.equal(kindAt("'r'"), STR);
  assert.equal(sk.text.length, src.length, '뼈대는 원문과 길이가 같다');
  /* 점 뒤의 예약어는 속성 이름이다 — 그 뒤의 / 는 나눗셈 */
  const src2 = "const r = t.in / t.total + c?.new / 2 + a / b; const m = [...list].map((x) => x.of / 2); if (typeof x === 'string' && /a\\/b/.test(x)) go(); async function g() { f(...await /re/.exec(x)); }";
  const sk2 = skeleton(src2);
  assert.equal(sk2.ok, true, sk2.why);
  assert.equal(sk2.kind[src2.indexOf('/ t.total')], CODE);
  assert.equal(sk2.kind[src2.indexOf('/ 2 + a')], CODE);
  assert.equal(sk2.kind[src2.indexOf('/a\\/b/')], REGEX, '연산자 뒤의 정규식은 그대로 정규식');
  assert.equal(sk2.kind[src2.indexOf('/re/')], REGEX, '...펼침 뒤의 await 는 예약어다(속성 이름이 아니다)');
  const src4 = 'class A { #in = 4; half(){ return this.#in / 2; } }';
  const sk4 = skeleton(src4);
  assert.equal(sk4.ok, true, sk4.why);
  assert.equal(sk4.kind[src4.indexOf('/ 2')], CODE, '비공개 필드 이름(#in)도 속성 이름이다');
});
test('뼈대: 옛 방식 줄 주석·CRLF 줄 이음·제어문 괄호 뒤 정규식을 읽는다', () => {
  const src = "<!-- 옛 방식 줄 주석 don't\nvar a = 'x \\\r\n y';\nif (ok) /'/.test(s);\nfor (;;) /\"/.test(s);\n--> 끝 주석 '\nvar b = (1) / 2;\n";
  const sk = skeleton(src);
  assert.equal(sk.ok, true, sk.why);
  assert.equal(sk.kind[src.indexOf("don't")], COMMENT, '일반 스크립트의 <!-- 는 줄 주석이다');
  assert.equal(sk.kind[src.indexOf('--> 끝')], COMMENT, '줄 머리의 --> 도 줄 주석이다');
  assert.equal(sk.kind[src.indexOf(" y'")], STR, '역슬래시 + CRLF 는 문자열의 줄 이음이다');
  assert.equal(sk.kind[src.indexOf("/'/")], REGEX, 'if ( ) 뒤의 / 는 정규식이다');
  assert.equal(sk.kind[src.indexOf('/"/')], REGEX, 'for ( ) 뒤의 / 는 정규식이다');
  assert.equal(sk.kind[src.indexOf('/ 2')], CODE, '그 밖의 닫는 괄호 뒤는 나눗셈이다');
  assert.equal(skeleton('<!-- x\nvar a = 1;', { module: true }).ok, false, '모듈에서는 <!-- 가 주석이 아니다');
  /* 블록·함수 본문 정보 */
  const src3 = 'function f(a){ if (a) { g(); } }\nconst h = (x) => { return x; };';
  const sk3 = skeleton(src3);
  const blockOf = (needle) => sk3.blk[src3.indexOf(needle)];
  assert.equal(sk3.isFn[blockOf('if (a)')], true, 'function 의 중괄호는 함수 본문');
  assert.equal(sk3.isFn[blockOf('g();')], false, 'if 의 중괄호는 함수 본문이 아니다');
  assert.equal(sk3.parent[blockOf('g();')], blockOf('if (a)'));
  assert.equal(sk3.isFn[blockOf('return x')], true, '=> { 는 함수 본문');
  assert.equal(blockOf('const h'), -1, '최상위는 -1');
});
test('뼈대: 읽지 못하면 ok:false 와 자리를 알린다(조용히 통과시키지 않는다)', () => {
  assert.equal(skeleton("function f(){ return 'a' ; ").ok, false);
  assert.equal(skeleton('const s = `열고 닫지 않음').ok, false);
  assert.equal(skeleton('const s = "줄이 바뀜\n";').ok, false);
  assert.equal(skeleton('/* 닫지 않은 주석').ok, false);
  assert.equal(skeleton('var a = 1; }').ok, false);
  assert.equal(skeleton('import x from "y"; export const a = 1;').ok, false, '일반 스크립트로는 import 를 읽지 못한다');
  assert.equal(skeleton('import x from "y"; export const a = 1;', { module: true }).ok, true);
  /* 문법은 맞지만 이 뼈대가 따라가지 못하는 꼴( } 바로 뒤의 나눗셈 ) — 틀리게 읽고 넘어가지 않고 실패로 알린다 */
  const src = 'var a = 1;\nvar q = {} / 2;\n';
  const bad = skeleton(src);
  assert.equal(bad.ok, false);
  assert.equal(failLine(bad, src), 2, '실패한 줄을 알려 준다');
  const bad2 = skeleton('var a = 1;\nvar b = 2;\nvar c = (;\n');
  assert.equal(bad2.ok, false);
  assert.equal(failLine(bad2, 'var a = 1;\nvar b = 2;\nvar c = (;\n'), 3, 'V8 이 뼈대를 읽지 못한 줄');
});
test('뼈대: 드문 꼴 — 숫자 끝의 소수점 · 이름이 of 인 변수 · for await · export default · U+2028', () => {
  const kind = (src, needle, opts) => { const sk = skeleton(src, opts); assert.equal(sk.ok, true, `${src} — ${sk.why}`); return sk.kind[src.indexOf(needle)]; };
  assert.equal(kind('var half = 1. / 2; var s = "a";', '/ 2'), CODE, '숫자 끝의 소수점 뒤의 / 는 나눗셈이다');
  assert.equal(kind('var t = 1./3 + 2.*x; var s = "a";', '/3'), CODE);
  assert.equal(kind('var u = 1..toFixed() / 2 + arr[0].in / 3; var s = "a";', '/ 2'), CODE);
  assert.equal(kind('var of = 4; var half = of / 2; var s = "a";', '/ 2'), CODE, '이름이 of 인 변수 뒤의 / 는 나눗셈이다');
  assert.equal(kind('for (const k of /a"/.exec(s) || []) {}', '/a"/'), REGEX, 'for (x of …) 의 of 뒤는 정규식이다');
  assert.equal(kind('for (const [a, b] of /a"/.exec(s) || []) {}', '/a"/'), REGEX, '구조분해 뒤의 of 도 같다');
  assert.equal(kind('async function g(it){ for await (const x of it) /re"/.test(x) && go(x); }', '/re"/'), REGEX, 'for await ( ) 뒤의 / 는 정규식이다');
  assert.equal(kind('export default /re"x/;\nexport const a = 1;', '/re"x/', { module: true }), REGEX, 'export default 뒤의 / 는 정규식이다');
  assert.equal(kind('// 주석\u2028var s = "문자열";\nvar t = 1;', '"문자열"'), STR, 'U+2028 은 줄 끝이다 — 줄 주석이 거기서 끝난다');
});
test('HTML 주석: <script> 밖의 주석만 빈칸으로(길이·줄 수 유지), 주석의 끝은 브라우저와 같게', () => {
  const html = "<p>a</p><!-- <script>bad(</script> -->\n<script>const s = '<!-- 글자 -->';</script>";
  const out = blankHtmlComments(html);
  assert.equal(out.length, html.length);
  assert.ok(!out.includes('bad('));
  assert.ok(out.includes("const s = '<!-- 글자 -->';"), '스크립트 안의 <!-- 글자는 건드리지 않는다');
  for (const [name, h] of [
    ['빈 주석 <!-->', '<!-->\n<script>keep1()</script><!-- x -->'],
    ['빈 주석 <!--->', '<!--->\n<script>keep1()</script><!-- x -->'],
    ['--!> 로 끝나는 주석', '<!-- a --!>\n<script>keep1()</script><!-- x -->'],
    ['textarea 안의 <!--', '<textarea><!-- </textarea>\n<script>keep1()</script><!-- x -->'],
    ['title 안의 <!--', '<title><!-- </title>\n<script>keep1()</script><!-- x -->'],
    ['style 안의 <!--', '<style><!-- .a{} </style>\n<script>keep1()</script><!-- x -->'],
    ['noscript 안의 <!--', '<noscript><!-- </noscript>\n<script>keep1()</script><!-- x -->'],
    ['xmp 안의 <!--', '<xmp><!-- </xmp>\n<script>keep1()</script><!-- x -->'],
    ['iframe 안의 <!--', '<iframe><!-- </iframe>\n<script>keep1()</script><!-- x -->'],
    ['속성 값 안의 <!--', '<input placeholder="<!-- 로 시작">\n<script>keep1()</script><!-- x -->'],
    ['속성 값 안의 <!-- (작은따옴표 · 따옴표 없음)', "<input title='a <!-- b' data-x=<!--y>\n<script>keep1()</script><!-- x -->"],
    ['속성 값 안의 > 뒤의 주석', '<input title="a > b"><!-- x -->\n<script>keep1()</script><!-- x -->'],
    ['속성 값 안의 > 와 <!--', '<input title="a > b <!-- c">\n<script>keep1()</script><!-- x -->'],
  ]) {
    const o = blankHtmlComments(h);
    assert.equal(o.length, h.length, name);
    assert.ok(o.includes('<script>keep1()</script>'), `${name} — 뒤의 스크립트를 주석으로 지우면 안 된다`);
    assert.ok(!o.includes(' x '), `${name} — 뒤의 진짜 주석은 지운다`);
  }
  assert.equal(blankHtmlComments('<!-- 닫지 않음\n<script>a()</script>').includes('a()'), false, '닫히지 않은 주석은 끝까지 주석이다');
});
test('스크립트 태그: 실행되는 것만 읽는다(type · data-type · src · 닫히지 않은 태그)', () => {
  for (const [tag, want] of [
    ['<script>', 'classic'], ['<script type="">', 'classic'], ['<script type=module>', 'module'], ['<script TYPE="Module">', 'module'],
    ["<script type='text/javascript'>", 'classic'], ['<script type="application/x-javascript">', 'classic'], ['<script type="text/ecmascript">', 'classic'],
    ['<script type="application/json">', null], ['<script type="application/ld+json">', null], ['<script type="importmap">', null], ['<script type="text/template">', null],
    ['<script data-type="application/json">', 'classic'],
  ]) assert.equal(scriptKind(tag), want, tag);
  const html = '<p>a</p><script src="a.js"></script>\n<script data-src="x">var a=1;</script><script type="application/json">{"a":1}</script>\n<script>var b=2;\n';
  const r = scriptsOf(blankHtmlComments(html));
  assert.deepEqual(r.list.map((t) => [t.kind, t.src, t.code]), [['classic', 'a.js', ''], ['classic', null, 'var a=1;'], [null, null, '{"a":1}']]);
  assert.equal(r.unclosed, html.indexOf('<script>var b'), '닫는 태그가 없는 <script> 의 자리');
  assert.equal(scriptsOf('<script>var a=1;</script>').unclosed, -1);
});
test('속성 값의 문자 참조를 브라우저 규칙대로 푼다', () => {
  for (const [src, want] of [
    ['a &lt; b', 'a < b'], ['a &lt b', 'a < b'], ['a &ltx b', 'a &ltx b'], ['a&amp=b', 'a&amp=b'], ['a&copy;=1', 'a\u00a9=1'],
    ['x&#39;y&#x27;z', "x'y'z"], ['&quot;a&quot', '"a"'], ['&hellip;', '\u2026'], ['&zzz;', '&zzz;'], ['&notit;', '&notit;'], ['&amp;lt;', '&lt;'],
    ['&#0;', '\ufffd'], ['&#x110000;', '\ufffd'],
  ]) assert.equal(decodeAttr(src), want, src);
});

// ── scripts/check-wait.mjs ──────────────────────────────────────────────────
test('대기 검사: 직접 조회 — 필터가 그 조회에 있어야 통과한다', () => {
  waitTable([
    ['필터 없음', 'direct miss', "const r=await supa.from('bookings').select('event_seq');"],
    ['필터', 'direct 필터', "const r=await supa.from('bookings').select('event_seq').neq('status','대기');"],
    ['필터 — 빈칸·줄바꿈', 'direct 필터', "const r=await supa.from('bookings')\n  .select('a')\n  . neq ( 'status' , '대기' );"],
    ['.eq 대기는 대기만 읽는 것(필터 아님)', 'direct miss', "const r=await supa.from('bookings').select('event_seq').eq('status','대기');"],
    ['다른 열의 neq', 'direct miss', "const r=await supa.from('bookings').select('event_seq').neq('check_status','대기');"],
    ['.not · .or 꼴은 필터로 보지 않는다(사유 주석으로)', 'direct miss, direct miss', "const r=await supa.from('bookings').select('a').not('status','eq','대기'); const q=await supa.from('bookings').select('a').or('status.neq.대기');"],
    ['필터 글자가 문자열 안에만', 'direct miss', "const r=await supa.from('bookings').select('event_seq').eq('memo',\".neq('status','대기')\");"],
    ['필터 글자가 주석 안에만', 'direct miss', "const r=await supa.from('bookings').select('event_seq') /* .neq('status','대기') */ .eq('session_ym',ym);"],
    ['삼항의 다른 가지에만 필터', 'direct miss, direct 필터', "const r=ALL? await supa.from('bookings').select('a') : await supa.from('bookings').select('a').neq('status','대기');"],
    ['|| 뒤의 다른 조회에만 필터', 'direct miss, direct 필터', "const r=(await supa.from('bookings').select('a')).data || (await supa.from('bookings').select('a').neq('status','대기')).data;"],
    ['then 콜백 안 다른 조회의 필터', 'direct miss, direct 필터', "const r=await supa.from('bookings').select('a').then(x=>supa.from('bookings').select('b').neq('status','대기'));"],
    ['catch 콜백 안 다른 조회의 필터', 'direct miss, direct 필터', "const r=await supa.from('bookings').select('a').catch(()=>supa.from('bookings').select('b').neq('status','대기'));"],
    ['finally 콜백 안 다른 조회의 필터', 'direct miss, direct 필터', "const r=await supa.from('bookings').select('a').finally(()=>supa.from('bookings').select('b').neq('status','대기'));"],
    ['Promise.all 형제 조회의 필터', 'direct miss, direct 필터', "const [a,b]=await Promise.all([supa.from('bookings').select('a'), supa.from('bookings').select('b').neq('status','대기')]);"],
    ['인자 안 다른 조회의 필터는 이 조회의 필터가 아니다', 'direct miss, direct 필터', "const r=await supa.from('bookings').select('*').in('event_seq',(await supa.from('bookings').select('b').neq('status','대기')).data.map(x=>x.event_seq));"],
    ['인자 안 다른 객체의 .neq 도 아니다', 'direct miss', "const r=await supa.from('bookings').select('*').in('event_seq',ids.filter(x=>x.neq('status','대기')));"],
    ['필터 인자 사이의 주석', 'direct 필터, direct 필터', "const r=await supa.from('bookings').select('*').neq('status', '대기' /* 값 */); const q=await supa.from('bookings').select('*').neq(/* 열 */ 'status',\n  // 대기 예약은 뺀다\n  '대기');"],
    ['필터의 값이 대기가 아니거나 인자가 더 있다', 'direct miss, direct miss', "const r=await supa.from('bookings').select('*').neq('status','대기 '); const q=await supa.from('bookings').select('*').neq('status','대기',extra);"],
    ['세미콜론 없는 조회 + 다음 줄의 필터 있는 조회', 'direct miss, direct 필터', "const a=await supa.from('bookings').select('a')\nconst b=await supa.from('bookings').select('b').neq('status','대기')"],
    ['줄이 바뀐 뒤의 괄호 앞에서 체인이 끝난다', 'direct miss, direct 필터', "const a=await supa.from('bookings').select('a')\n(async()=>{ await supa.from('bookings').select('b').neq('status','대기'); })();"],
    ['줄이 바뀐 뒤의 괄호 안에 적은 사유는 앞 조회의 사유가 아니다', 'direct miss, helper 주석', "const a=await supa.from('bookings').select('a')\n(async()=>{ await pagedIn('bookings','a','a',ids) /* 대기 포함: 방이 배정된 팀만 읽는다 */; })();"],
    ['catch · finally 콜백 안의 사유는 앞 조회의 사유가 아니다', 'direct miss, helper 주석, direct miss, helper 주석', "const r=await supa.from('bookings').select('a').catch(()=>pagedIn('bookings','a','a',ids) /* 대기 포함: 방이 배정된 팀만 읽는다 */); const q=await supa.from('bookings').select('a').finally(()=>pagedIn('bookings','a','a',ids) /* 대기 포함: 방이 배정된 팀만 읽는다 */);"],
    ['partner_bookings 삼항 표 이름 + 필터', 'direct 필터', "const r=await supa.from(BRAND?'partner_bookings':'bookings').select('a').neq('status','대기');"],
    ['partner_bookings — 필터 없음', 'direct miss', "const r=await supa.from('partner_bookings').select('a');"],
    ['큰따옴표·백틱 + 필터', 'direct 필터, direct 필터', 'const r=await supa.from("bookings").select("a").neq("status","대기"); const q=await supa.from(`bookings`).select(`a`).neq(`status`,`대기`);'],
    ['큰따옴표·백틱 — 필터 없음', 'direct miss, direct miss', 'const r=await supa.from("bookings").select("a"); const q=await supa.from(`bookings`).select(`a`);'],
    ['템플릿 보간 표 이름', 'direct miss', 'const r=await supa.from(`${PFX}bookings`).select("a");'],
    ['이스케이프로 적은 표 이름', 'direct miss', "const r=await supa.from('book\\u0069ngs').select('a');"],
    ['글자끼리 이어 붙인 표 이름', 'direct miss', "const r=await supa.from('book'+'ings').select('a');"],
    ['글자끼리 이어 붙인 표 이름 + 필터', 'direct 필터', "const r=await supa.from('book' + 'ings').select('a').neq('status','대기');"],
    ['긴 인자(6천 자가 넘는 배열) 뒤의 필터', 'direct 필터', `const r=await supa.from('bookings').select('a').in('event_seq',[${Array.from({ length: 1500 }, (_, k) => 1000000 + k).join(',')}]).neq('status','대기');`],
    ['쓰기(from 바로 뒤 update·upsert·insert·delete)', 'direct write, direct write, direct write, direct write', "await supa.from('bookings').update({a:1}).eq('event_seq',1); await supa.from('bookings').upsert(rows); await supa.from('bookings').insert(rows); await supa.from('bookings').delete().eq('event_seq',1);"],
    ['조회 조건의 값은 조회가 아니다', '', "const r=await supa.from('change_log').select('id').eq('entity','bookings').in('entity',['bookings','guests']);"],
    ['주석·문자열·정규식 안의 글자는 조회가 아니다', '', "// supa.from('bookings').select('*')\n/* pagedIn('bookings') */\nconst L={a:'Scans all imported bookings (via step1)', b:'예약(bookings) 기준 — bookings(대기 제외)'}; const re=/from\\('bookings'\\)/;"],
    ['다른 표(cart_bookings)는 대상이 아니다', '', "const r=await supa.from('cart_bookings').select('*'); const g=await supa.from('golf_groups').select('id,cart_bookings!inner(qty)');"],
    ['이어 붙인 결과가 다른 표(cart_bookings)', '', "const r=await supa.from('cart_'+'bookings').select('a'); const g=await supa.from('golf_groups').select('id,cart_'+'bookings!inner(qty)');"],
    ['RPC 는 대상이 아니다', '', "const r=await supa.rpc('booking_trend',{p_days:7});"],
  ]);
});
test('대기 검사: 임베드 — !inner 와 그 임베드의 status 필터가 있어야 통과한다', () => {
  waitTable([
    ['!inner — 필터 없음', 'embed miss', "const r=await supa.from('guests').select('event_seq,bookings!inner(dep_date)');"],
    ['!inner — bookings.status 필터', 'embed 필터', "const r=await supa.from('guests').select('event_seq,bookings!inner(dep_date)').neq('bookings.status','대기');"],
    ['!inner — 표 이름 없는 열의 필터', 'embed miss', "const r=await supa.from('guests').select('event_seq,bookings!inner(dep_date)').neq('status','대기');"],
    ['inner 아님 — 필터가 있어도(부모 행은 걸러지지 않는다)', 'embed miss', "const r=await supa.from('guests').select('event_seq,bookings(dep_date)').neq('bookings.status','대기');"],
    ['여러 줄 템플릿·빈칸', 'embed miss', 'const r=await supa.from("guests").select(`event_seq,\n   bookings!inner (dep_date)`);'],
    ['별칭 임베드 — 별칭 열의 필터', 'embed 필터', "const r=await supa.from('guests').select('event_seq,b:bookings!inner(dep_date)').neq('b.status','대기');"],
    ['따옴표 식별자 임베드', 'embed miss', "const r=await supa.from('guests').select('event_seq,\"bookings\"!inner(dep_date)');"],
    ['템플릿 꼬리 임베드(inner 인지 모른다)', 'embed miss', "const X='!inner'; const r=await supa.from('guests').select(`event_seq, bookings${X}(dep_date)`).neq('bookings.status','대기');"],
    ['수식어가 보간인 임베드( bookings!${JOIN}( )', 'embed miss', "const r=await supa.from('guests').select(`event_seq, bookings!${JOIN}(dep_date)`).neq('bookings.status','대기');"],
    ['수식어를 변수로 이어 붙인 임베드', 'embed miss, embed miss', "const a=await supa.from('guests').select('event_seq, bookings' + (strict ? '!inner' : '') + '(dep_date)').neq('bookings.status','대기'); const b=await supa.from('guests').select('event_seq, bookings!' + JOIN + '(dep_date)').neq('bookings.status','대기');"],
    ['온전하지 않은 조각의 \\n 이스케이프 뒤 임베드', 'embed miss', "const r=await supa.from('guests').select(`event_seq,\\n bookings!inner(dep_date, ${C})`);"],
    ['partner_bookings 임베드', 'embed miss', "const r=await supa.from('partner_members').select('id,partner_bookings!inner(dep_date)');"],
    ['partner_bookings 임베드 + 필터', 'embed 필터', "const r=await supa.from('partner_members').select('id,partner_bookings!inner(dep_date)').neq('partner_bookings.status','대기');"],
    ['이어 붙인 select 의 임베드', 'embed miss', "const r=await supa.from('guests').select('event_seq,'+'book'+'ings!inner(dep_date)');"],
    ['중첩 임베드의 전체 경로 필터는 읽지 못한다(사유 주석으로)', 'embed miss', "const r=await supa.from('rooms').select('id,guest_members!inner(id,bookings!inner(dep_date))').neq('guest_members.bookings.status','대기');"],
    ['중첩 임베드 — 표 이름만 적은 필터로는 통과하지 않는다', 'embed miss', "const r=await supa.from('rooms').select('id,guest_members!inner(id,bookings!inner(dep_date))').neq('bookings.status','대기');"],
    ['중첩 임베드 — 사유 주석', 'embed 주석', "const r=await supa.from('rooms').select('id,guest_members!inner(id,bookings!inner(dep_date))').neq('guest_members.bookings.status','대기') /* 대기 제외: 전체 경로 필터 */;"],
    ['select 라는 이름의 다른 메서드 + 필터 콜백(헬퍼와 같다)', 'embed miss', "const r=await db.select('guests','event_seq,bookings!inner(dep_date)',q=>q.neq('bookings.status','대기'));"],
    ['referencedTable 옵션의 값은 표 이름 자리가 아니다', 'embed 필터', "const r=await supa.from('guests').select('event_seq,bookings!inner(dep_date)').neq('bookings.status','대기').order('dep_date',{referencedTable:'bookings'});"],
    ['foreignTable 옵션의 값만', '', "const r=await supa.from('guests').select('event_seq').order('dep_date',{foreignTable:'bookings'});"],
    ['헬퍼에 넘긴 임베드 — 표시 없음', 'embed miss', "const r=await loadAll(supa,'guests','event_seq,bookings!inner(dep_date)');"],
    ['헬퍼에 넘긴 임베드 — 필터 콜백만(헬퍼가 쓰는지 모른다)', 'embed miss', "const r=await loadAll(supa,'guests','event_seq,bookings!inner(dep_date)',q=>q.neq('bookings.status','대기'));"],
    ['헬퍼에 넘긴 임베드 뒤에 이어 붙인 필터', 'embed miss', "const r=await loadAll(supa,'guests','event_seq,bookings!inner(dep_date)').neq('bookings.status','대기');"],
    ['헬퍼에 넘긴 임베드 — 사유 주석', 'embed 주석', "const r=await loadAll(supa,'guests','event_seq,bookings!inner(dep_date)') /* 대기 제외: loadAll 이 bookings.status 필터를 건다 */;"],
  ]);
});
test('대기 검사: select 를 담은 변수 — 쓰는 자리마다 본다', () => {
  const GS = "const GS='event_seq,bookings!inner(dep_date)'; ";
  waitTable([
    ['쓰는 자리 필터 없음', 'embed miss', GS + "const r=await supa.from('guests').select(GS,{count:'exact'}).eq('accom','x');"],
    ['쓰는 자리 필터', 'embed 필터', GS + "const r=await supa.from('guests').select(GS).neq('bookings.status','대기');"],
    ['이어 붙여 만든 변수 — 필터 없음', 'embed miss', "const GS='event_seq,'+'bookings!inner(dep_date)'; const r=await supa.from('guests').select(GS).eq('accom','x');"],
    ['이어 붙여 만든 변수 — 필터', 'embed 필터', "const GS='event_seq,'+'bookings!inner(dep_date)'; const r=await supa.from('guests').select(GS).neq('bookings.status','대기');"],
    ['다른 변수로 옮김( sel = GS ) — 필터 없음', 'embed miss', GS + "let sel; sel = GS; const r=await supa.from('guests').select(sel);"],
    ['다른 변수로 옮김 — 필터', 'embed 필터', GS + "let sel; sel = GS; const r=await supa.from('guests').select(sel).neq('bookings.status','대기');"],
    ['값 없는 선언 목록( var a, sel; )은 쓰는 자리가 아니다', 'embed 필터', GS + "var a, sel; sel = GS; const r=await supa.from('guests').select(sel).neq('bookings.status','대기');"],
    ['호출 밖에서 다른 값에 섞으면 따라가지 못한다(사유 주석으로)', 'literal miss', GS + "let sel; sel = GS; const t = cond ? a : sel;"],
    ['return 으로 내보내도 같다', 'literal miss', GS + "let sel; sel = GS; return sel;"],
    ['다른 함수의 지역 변수는 보이지 않는다', 'embed 필터', "const cols='event_seq,bookings!inner(dep_date)'; return supa.from('guests').select(cols).neq('bookings.status','대기'); }\nasync function b(table,cols){ return supa.from(table).select(cols);"],
    ['같은 화면 다른 <script> 의 최상위 변수 — 필터 없음', 'embed miss', page("const GS2='event_seq,bookings!inner(dep_date)';", fn("return supa.from('guests').select(GS2).eq('accom','x');"))],
    ['같은 화면 다른 <script> 의 최상위 변수 — 필터', 'embed 필터', page("const GS2='event_seq,bookings!inner(dep_date)';", fn("return supa.from('guests').select(GS2).neq('bookings.status','대기');"))],
    ['다른 화면의 최상위 변수는 이 화면에서 보이지 않는다(위 사례의 GS2)', '', "return supa.from('guests').select(GS2).eq('accom','x');"],
    ['전역 변수와 이름이 같은 매개변수는 그 변수가 아니다', 'embed 필터', page("const cols='event_seq,bookings!inner(dep_date)';\nasync function a(){ return supa.from('guests').select(cols).neq('bookings.status','대기'); }\nasync function load(table, cols){ return supa.from(table).select(cols); }")],
    ['전역 변수와 이름이 같은 지역 변수도 아니다', 'embed 필터', page("const SEL='event_seq,bookings!inner(dep_date)';\nasync function a(){ return supa.from('guests').select(SEL).neq('bookings.status','대기'); }\nasync function b(){ const SEL='id,room_no'; return supa.from('rooms').select(SEL); }")],
    ['앞 줄의 화살표 매개변수와 이름이 같아도 그 뒤는 전역이다(끝에 ; 없음)', 'embed miss', page("const cols='event_seq,bookings!inner(dep_date)';\nasync function load(){\n  const clean = (cols) => { return cols.trim(); }\n  const { data } = await supa.from('guests').select(cols).eq('accom', A);\n  return data;\n}")],
    ['객체의 앞 속성이 화살표(매개변수 이름이 같다) — 뒤 속성은 전역을 쓴다', 'embed miss', page("const cols='event_seq,bookings!inner(dep_date)';\nconst Repo = {\n  trim: (cols) => cols.trim(),\n  guests: () => supa.from('guests').select(cols).eq('accom', A),\n};")],
    ['세미콜론 없는 코드 — 앞 줄의 식 본문 화살표', 'embed miss', page("const cols='event_seq,bookings!inner(dep_date)';\nasync function load(){\n  let out = []\n  const add = (cols) => out.push(1)\n  const { data } = await supa.from('guests').select(cols)\n  return data\n}")],
    ['닫힌 블록 화살표 뒤 줄이 식 문장이어도 전역이다', 'embed miss', page("const cols='event_seq,bookings!inner(dep_date)';\nasync function load(){\n  const clean = (cols) => { return cols.trim(); }\n  supa.from('guests').select(cols).then(render)\n}")],
    ['매개변수 기본값 식에 나온 이름은 가리는 것이 아니다', 'embed miss', page("const cols='event_seq,bookings!inner(dep_date)';\nasync function load(n = cols.length){ return supa.from('guests').select(cols); }")],
    ['화살표 본문 안에서는 매개변수가 가린다', 'embed 필터', page("const cols='event_seq,bookings!inner(dep_date)';\nasync function a(){ return supa.from('guests').select(cols).neq('bookings.status','대기'); }\nconst load = (table, cols) => supa.from(table).select(cols);\nconst load2 = (table, cols) => { return supa.from(table).select(cols); };")],
    ['삼항의 가운데 가지는 쓰는 자리다', 'literal miss', page("const GS5='event_seq,bookings!inner(dep_date)';\nasync function load(w){ const s = w ? 'event_seq,' + GS5 : 'event_seq'; return supa.from('guests').select(s); }")],
    ['객체의 키 이름은 쓰는 자리가 아니다', 'embed 필터', page("const cols='event_seq,bookings!inner(dep_date)';\nasync function a(){ const o = { cols: 1, b: 2 }; return supa.from('guests').select(cols).neq('bookings.status','대기'); }")],
    ['쉼표 식으로 담은 전역( a=2, GSX=… )', 'embed miss', page("var a1=1; a1=2, GSX='event_seq,bookings!inner(dep_date)';\nasync function a(){ return supa.from('guests').select(GSX); }")],
    ['클래스 필드에 담은 select 는 담은 자리에서 잡는다', 'literal miss', page("class Q{ static SEL='event_seq,bookings!inner(dep_date)'; }\nasync function a(){ return supa.from('guests').select(Q.SEL); }")],
  ]);
});
test('대기 검사: 헬퍼 호출·호출 밖의 표 이름 — 사유 주석으로만 통과한다', () => {
  waitTable([
    ['헬퍼 호출 — 표시 없음', 'helper miss', "const r=await pagedIn('bookings','event_seq','event_seq',seqs);"],
    ['헬퍼 호출 — 필터 콜백만(헬퍼가 쓰는지 모른다)', 'helper miss', "const r=await pagedIn('bookings','event_seq','event_seq',seqs,q=>q.neq('status','대기'));"],
    ['헬퍼 호출 뒤에 이어 붙인 필터 — 헬퍼가 무엇을 돌려주는지 모른다', 'helper miss', "const r=await pagedIn('bookings','event_seq','event_seq',seqs).neq('status','대기');"],
    ['헬퍼 호출 — 바로 뒤 같은 줄 사유 주석', 'helper 주석', "const r=await pagedIn('bookings','event_seq','event_seq',seqs) /* 대기 포함: 방이 배정된 팀만 읽는다 */;"],
    ['긴 인자(6천 자가 넘는 배열)를 가진 헬퍼 호출 + 사유 주석', 'helper 주석', `const r=await pagedIn('bookings','event_seq','event_seq',[${Array.from({ length: 1500 }, (_, k) => 1000000 + k).join(',')}]) /* 대기 포함: 방이 배정된 팀만 읽는다 */;`],
    ['괄호 짝을 한도(20만 자) 안에서 찾지 못하면 통과가 아니라 오류', 'helper long', `const r=await pagedIn('bookings','event_seq','event_seq',[${Array.from({ length: 30000 }, (_, k) => 1000000 + k).join(',')}]) /* 대기 포함: 방이 배정된 팀만 읽는다 */;`],
    ['사유 주석 — 윗줄', 'helper miss', "/* 대기 포함: 윗줄 */\nconst r=await pagedIn('bookings','event_seq','event_seq',seqs);"],
    ['사유 주석 — ; 뒤', 'helper miss', "const r=await pagedIn('bookings','event_seq','event_seq',seqs); /* 대기 포함: 뒤 */"],
    ['사유 주석 — 아랫줄', 'helper miss', "const r=await pagedIn('bookings','event_seq','event_seq',seqs)\n/* 대기 포함: 아랫줄 */\nconst z=1;"],
    ['사유 주석 — 이유 없음', 'helper miss', "const r=await pagedIn('bookings','event_seq','event_seq',seqs) /* 대기 포함: */;"],
    ['사유 주석 — 줄 주석은 세지 않는다', 'helper miss', "const r=await pagedIn('bookings','event_seq','event_seq',seqs) // 대기 포함: 줄 주석\n;"],
    ['사유 주석 — 줄 주석 안에 적은 블록 주석 글자', 'helper miss', "const r=await pagedIn('bookings','event_seq','event_seq',seqs) // 예: /* 대기 포함: 이유 */\n;"],
    ['사유 주석 — 닫는 괄호 뒤 같은 줄', 'direct 주석', "const r=await paged((a,b)=>supa.from('bookings').select('a').range(a,b)) /* 대기 포함: 대기 줄로 따로 보인다 */;"],
    ['사유 주석 — 줄이 바뀐 뒤 닫는 괄호 + 같은 줄', 'direct 주석', "const r=await paged((a,b)=>supa.from('bookings').select('a').range(a,b)\n) /* 대기 포함: 대기 줄로 따로 보인다 */;"],
    ['사유 주석 — 대기 제외 · 대기 무관', 'direct 주석, helper 주석', "const r=await supa.from('bookings').select('a') /* 대기 제외: 받은 뒤 화면에서 거른다 */; await saveAll('bookings', rows) /* 대기 무관: 쓰기 */;"],
    ['호출 밖의 표 이름(변수·객체·배열)', 'literal miss, literal miss, literal miss', "const T='bookings'; const cfg={table:'bookings'}; const list=['guests','bookings'];"],
    ['호출 밖의 표 이름 + 그 자리 주석', 'literal 주석', "const cfg={table:'bookings' /* 대기 제외: 이 설정으로 부르는 load() 가 필터를 건다 */};"],
    ['REST 주소', 'literal miss', "const r=await fetch(URL+'/rest/v1/bookings?select=event_seq');"],
    ['이어 붙인 REST 주소', 'literal miss', "const r=await fetch(URL+'/rest/v1/'+'bookings?select=event_seq');"],
    ['REST 조각 — 기준 주소 변수 + 표 이름으로 시작하는 글자', 'literal miss, literal miss', "const a=await fetch(REST + 'bookings?select=event_seq&dep_date=eq.' + d); const b=await fetch(`${REST}bookings?select=event_seq`);"],
    ['REST 조각 — 이어 붙여 표 이름?select 가 되는 글자', 'literal miss', "const a=await fetch(REST + 'bookings' + '?select=event_seq,pax&dep_date=eq.' + d);"],
  ]);
});
test('대기 검사: 허용 문장 — 등록 현황·연결 확인은 정해진 꼴일 때만', () => {
  waitTable([
    ['등록 현황(session_ym 만)', 'direct 허용 문장', "const r=await supa.from('bookings').select('session_ym').order('event_seq').range(0,999);"],
    ['등록 현황 + session_ym 조건', 'direct 허용 문장', "const r=await supa.from('bookings').select('session_ym').gte('session_ym','2026-01').order('session_ym').range(0,999);"],
    ['등록 현황에 다른 열', 'direct miss', "const r=await supa.from('bookings').select('session_ym,pax').order('event_seq');"],
    ['등록 현황에 다른 조건', 'direct miss', "const r=await supa.from('bookings').select('session_ym').eq('status','대기');"],
    ['연결 확인(head, 조건 없음)', 'direct 허용 문장', "const {error}=await supa.from('bookings').select('event_seq',{count:'exact',head:true});"],
    ['열 확인(head + limit)', 'direct 허용 문장', "const {error}=await supa.from('bookings').select('room_type',{head:true}).limit(1);"],
    ['건수 조회 + 조건(숫자로 쓰는 조회)', 'direct miss', "const {count}=await supa.from('bookings').select('*',{count:'exact',head:true}).eq('session_ym',ym);"],
    ['head 조회에 조건이 붙으면 허용이 아니다(받는 값과 무관)', 'direct miss', "const {error}=await supa.from('bookings').select('*',{count:'exact',head:true}).eq('session_ym',ym);"],
    ['head 조회의 count 를 받아 쓰면 허용이 아니다', 'direct miss', "const {count}=await supa.from('bookings').select('event_seq',{count:'exact',head:true});"],
    ['head 조회를 변수에 담아 두면 허용이 아니다', 'direct miss', "const p=supa.from('bookings').select('event_seq',{count:'exact',head:true}); const r=await p;"],
    ['등록 현황을 변수에 담아 두면 허용이 아니다(뒤에서 조건을 붙일 수 있다)', 'direct miss', "let q=supa.from('bookings').select('session_ym'); q=q.eq('dep_date',today); const n=(await q).data.length;"],
    ['등록 현황 — .then 으로 바로 받는다', 'direct 허용 문장', "supa.from('bookings').select('session_ym').order('event_seq').then(r=>render(r.data));"],
    ['등록 현황 — Promise.all 의 원소', 'direct 허용 문장, direct 허용 문장', "const [a,b]=await Promise.all([supa.from('bookings').select('session_ym').range(0,999), supa.from('bookings').select('session_ym').range(1000,1999)]);"],
    ['등록 현황 — 다른 배열의 원소는 아니다', 'direct miss', "const list=[supa.from('bookings').select('session_ym').range(0,999)];"],
    ['연결 확인 — r 로 받아 r.error 만 본다', 'direct 허용 문장', "const res=await supa.from('bookings').select('room_type',{head:true,count:'exact'}).limit(1); HAS=!res.error;"],
    ['연결 확인 — r 로 받아 r.count 를 쓰면 허용이 아니다', 'direct miss', "const r=await supa.from('bookings').select('*',{count:'exact',head:true}); kpi.textContent=r.count+'팀';"],
    ['연결 확인 — (await …).count', 'direct miss', "const n=(await supa.from('bookings').select('*',{count:'exact',head:true})).count;"],
    ['연결 확인 — (await …).error 만', 'direct 허용 문장', "if ((await supa.from('bookings').select('room_type',{head:true}).limit(1)).error) HAS=false;"],
    ['연결 확인 — await ….then(r => r.count)', 'direct miss', "const n=await supa.from('bookings').select('*',{count:'exact',head:true}).then(r=>r.count);"],
    ['연결 확인 — ...rest · 따옴표 키로 받는다', 'direct miss, direct miss', "const {error,...rest}=await supa.from('bookings').select('*',{count:'exact',head:true}); const {'count':n}=await supa.from('bookings').select('*',{count:'exact',head:true});"],
    ['연결 확인 — 속성에 담음 · 호출 인자 · return await', 'direct miss, direct miss, direct miss', "state.total=await supa.from('bookings').select('*',{count:'exact',head:true}); show(await supa.from('bookings').select('*',{count:'exact',head:true})); return await supa.from('bookings').select('*',{count:'exact',head:true});"],
    ['연결 확인 — 먼저 선언한 변수에 담아 count 를 쓴다', 'direct miss', "var res; res=await supa.from('bookings').select('*',{count:'exact',head:true}); kpi.textContent=res.count;"],
    ['연결 확인 — 값을 받지 않는다', 'direct 허용 문장', "await supa.from('bookings').select('event_seq',{count:'exact',head:true});"],
    ['임베드 등록 현황(session_ym 건수)', 'embed 허용 문장', "const {count}=await supa.from('guests').select('event_seq,bookings!inner(session_ym)',{count:'exact',head:true}).eq('bookings.session_ym',ym);"],
    ['임베드 등록 현황 + 다른 조건', 'embed miss', "const {count}=await supa.from('guests').select('event_seq,bookings!inner(session_ym)',{count:'exact',head:true}).eq('bookings.session_ym',ym).eq('accom','x');"],
    ['임베드 등록 현황 — 행을 받는 조회', 'embed miss', "const r=await supa.from('guests').select('event_seq,bookings!inner(session_ym)').eq('bookings.session_ym',ym);"],
    ['임베드 등록 현황을 변수에 담아 두면 허용이 아니다', 'embed miss', "const q=supa.from('guests').select('id,bookings!inner(session_ym)',{count:'exact',head:true}); const {count}=await q.eq('accom','x').eq('bookings.dep_date',today);"],
  ]);
});
test('대기 검사: 여러 파일 — 공용 JS·허용 파일·인라인 핸들러·읽지 못한 스크립트', () => {
  const read = "async function f(){ return supa.from('bookings').select('*'); }";
  const files = {
    'ops/assets/shared.js': "window.GSEL9='event_seq,bookings!inner(dep_date)';\n",
    'ops/assets/esm-ok.js': 'import { x } from "./y.js";\nexport async function load(supa){ return supa.from("bookings").select("a").neq("status","대기"); }\n',
    'ops/assets/esm-leak.js': 'import { x } from "./y.js";\nexport async function load(supa){ return supa.from("bookings").select("a"); }\n',
    'ops/hub/uses-shared.html': page("async function f(){ return supa.from('guests').select(GSEL9).eq('accom','x'); }"),
    'ops/hub/uses-shared-ok.html': page("async function f(){ return supa.from('guests').select(GSEL9).neq('bookings.status','대기'); }"),
    'ops/hub/html-comment.html': page("<!-- <script>supa.from('bookings').select('*')</script> -->", '<script type="application/json">{"table":"bookings"}</script>'),
    'ops/hub/empty-comment.html': "<!doctype html><html><body><!-->\n<script>\n" + read + "\n</script>\n<p>끝</p><!-- 꼬리 -->\n</body></html>\n",
    'ops/hub/noscript.html': "<!doctype html><html><body>\n<noscript><!-- </noscript>\n<script>\n" + read + "\n</script>\n<p>--></p>\n</body></html>\n",
    'ops/hub/attr-comment.html': "<!doctype html><html><body>\n<input placeholder=\"<!-- 로 시작\">\n<script>\n" + read + "\n</script>\n<p>끝</p><!-- 꼬리 -->\n</body></html>\n",
    'ops/hub/old-type.html': page('<script type="text/javascript">\n' + read + '\n</script>'),
    'ops/hub/data-type.html': page('<script data-type="application/json">\n' + read + '\n</script>'),
    'ops/hub/module.html': page('<script type="module">\nimport { a } from "./a.js";\nconst r = await supa.from("bookings").select("a").neq("status","대기");\n</script>'),
    'ops/hub/handler.html': page('<button onclick="supa.from(\'bookings\').select(\'*\')">x</button>'),
    'ops/hub/handler-bare.html': page("<button onclick=supa.from('bookings').select('*')>x</button>"),
    'ops/hub/step1.html': page(read), 'ops/hub/room.html': page(read), 'ops/hub/audit.html': page(read),
    'ops/hub/sub/step1.html': page(read),
    'ops/step1.html': page(read),
    'ops/hub/broken.html': page("async function f(){ const r=await supa.from('guests').select('id' ; }"),
    'ops/hub/unreadable.html': page("var q = {} / 2;\n" + read),
    'ops/hub/unclosed.html': '<!doctype html><html><body><script>\nasync function g(){ return supa.from("bookings").select("a"); }\n</script>\n<script>\n' + read + '\n</body></html>\n',
    'ops/hub/utf16.html': Buffer.from('\ufeff' + page(read), 'utf16le'),
    'ops/hub/skip.mjs': "export const r = supa.from('bookings').select('a');\n",
    'ops/hub/skip.htm': page(read),
    'other/outside.html': page(read),
  };
  const r = runIn('check-wait.mjs', files, { env: { DUMP: '1' } });
  assert.equal(r.status, 1);
  const want = {
    'ops/assets/shared.js': '', 'ops/assets/esm-ok.js': 'direct 필터', 'ops/assets/esm-leak.js': 'direct miss',
    'ops/hub/uses-shared.html': 'embed miss', 'ops/hub/uses-shared-ok.html': 'embed 필터',
    'ops/hub/html-comment.html': '', 'ops/hub/empty-comment.html': 'direct miss', 'ops/hub/old-type.html': 'direct miss', 'ops/hub/data-type.html': 'direct miss',
    'ops/hub/noscript.html': 'direct miss', 'ops/hub/attr-comment.html': 'direct miss',
    'ops/hub/module.html': 'direct 필터', 'ops/hub/handler.html': 'literal miss', 'ops/hub/handler-bare.html': 'literal miss',
    'ops/hub/step1.html': '', 'ops/hub/room.html': '', 'ops/hub/audit.html': '',
    'ops/hub/sub/step1.html': 'direct miss', 'ops/step1.html': 'direct miss',
    'ops/hub/broken.html': 'unread miss', 'ops/hub/unreadable.html': 'unread miss', 'ops/hub/unclosed.html': 'unread miss, direct miss', 'ops/hub/utf16.html': 'unread miss',
    'ops/hub/skip.mjs': '', 'ops/hub/skip.htm': '', 'other/outside.html': '',
  };
  for (const [rel, w] of Object.entries(want)) assert.equal(r.sites(rel), w, rel + '\n' + r.of(rel).join('\n'));
  assert.deepEqual(r.flagged, Object.keys(want).filter((k) => /miss/.test(want[k])).sort());
  assert.match(r.of('ops/hub/unreadable.html')[0], /unreadable\.html:3 /, '읽지 못한 줄을 알려 준다');
  assert.match(r.of('ops/hub/unclosed.html').join('\n'), /unclosed\.html:4 .*닫히지 않았습니다/);
  assert.match(r.err, /✗ 대기 누락 12건 · 읽지 못한 스크립트·파일 4개/);
  assert.match(r.out, /허용 파일 3개/);
});
test('대기 검사: 깨끗한 트리는 통과하고, ops 폴더가 없으면 오류다', () => {
  const ok = runIn('check-wait.mjs', {
    'ops/hub/a.html': page("async function f(){ const a = await supa.from('bookings').select('*').neq('status','대기'); return supa.from('guests').select('*'); }"),
    'ops/hub/b.html': page("async function f(){ return pagedIn('bookings','a','a',ids) /* 대기 포함: 방이 배정된 팀만 읽는다 */; }"),
    'ops/assets/a.js': "var x = 1;\n",
  }, { args: ['--list'] });
  assert.equal(ok.status, 0, ok.err);
  assert.match(ok.out, /bookings 읽기 2곳 \(화면 HTML 2개·공용 JS 1개/);
  assert.match(ok.out, /임베드 2곳\(필터 1 · 사유 주석 1 · 허용 문장 0\)/);
  assert.match(ok.out, /필터\s+ops\/hub\/a\.html:3/, '--list 는 자리마다 판정을 보여 준다');
  const none = runIn('check-wait.mjs', { 'hub/c.html': page("async function f(){ return supa.from('bookings').select('a'); }") });
  assert.equal(none.status, 1);
  assert.match(none.err, /ops 폴더가 없습니다/);
});

// ── scripts/check-syntax.mjs ────────────────────────────────────────────────
const NO_DEF = '정의가 없습니다', INNER_ONLY = '다른 함수 안에만', MODULE_ONLY = '다른 type=module 스크립트의 최상위';
test('문법 검사: 헬퍼 범위 — 호출 자리에서 정의가 보여야 한다(2026-11 정산·홈 결함 꼴)', () => {
  errTable('check-syntax.mjs', [
    ['지역 const 를 다른 함수가 호출', [INNER_ONLY], "function f(){ const esc=s=>String(s); return esc(1); }\nfunction g(){ return esc(2); }"],
    ['최상위 정의', [], "const esc=s=>String(s);\nfunction g(){ return esc(2); }"],
    ['정의 없음', [NO_DEF], "function g(){ return toast('x'); }"],
    ['헬퍼마다 따로 센다', [NO_DEF, NO_DEF], "function g(){ return tx('k') + lang(); }"],
    ['헬퍼 4종(esc·tx·lang·toast)만 본다', [], "function g(){ return other(1) + foo(2); }"],
    ['같은 함수 안의 안쪽 블록에서 호출', [], "function f(){ const esc=s=>String(s); if(1){ for(const x of []){ esc(x); } } }"],
    ['안쪽 블록의 const 를 바깥에서 호출', [INNER_ONLY], "function f(){ if(1){ const esc=s=>String(s); } return esc(1); }"],
    ['안쪽 블록의 var·function 은 함수 전체에서 보인다', [], "function f(){ if(1){ var esc=s=>String(s); function tx(k){ return k; } } return esc(1) + tx('k'); }"],
    ['쉼표로 이은 선언·구조분해', [], "const $=(s)=>document.querySelector(s), esc=(s)=>String(s);\nconst { tx, lang: toast } = window.SZ;\nfunction g(){ return esc(1) + tx('k') + toast('x'); }"],
    ['구조분해의 키 이름은 정의가 아니다', [NO_DEF], "const { lang: language } = window.SZ;\nfunction g(){ return lang(); }"],
    ['window·globalThis 에 담은 전역', [], "function init(){ window.toast=function(m){}; globalThis.tx=k=>k; }\nfunction g(){ toast('x'); return tx('k'); }"],
    ["self.이름 = · window['이름'] = · ||= 도 전역", [], "function init(){ self.toast=function(m){}; window['tx']=k=>k; window.lang ||= () => 'ja'; }\nfunction g(){ toast('x'); lang(); return tx('k'); }"],
    ['self 를 따로 선언했으면 self.이름 = 은 전역이 아니다', [NO_DEF], "function init(){ const self = {}; self.toast=function(m){}; }\nfunction g(){ toast('x'); }"],
    ['Object.assign(window, { 줄임·메서드·화살표 })', [], "const esc=1;\nfunction init(){ Object.assign(window, { esc, toast(m){ if (m) { return 1; } }, tx: (k) => k, async lang(){ return 'ja'; } }); }\nfunction g(){ toast('x'); lang(); return tx('k'); }"],
    ['Object.assign(window, { 값 자리의 이름 })은 정의가 아니다', [NO_DEF], "function init(){ Object.assign(window, { a: esc, b: [tx] }); }\nfunction g(){ return esc(1); }"],
    ['Object.assign(다른 객체)', [NO_DEF], "function init(){ Object.assign(app, { esc(s){ return s; } }); }\nfunction g(){ return esc(1); }"],
    ['이름 붙은 함수 표현식 — = 뒤', [INNER_ONLY], "const h=function esc(s){ return String(s); };\nfunction g(){ return esc(2); }"],
    ['이름 붙은 함수 표현식 — 콜백 인자 자리', [INNER_ONLY], "list.forEach(function esc(s){ return s; });\nfunction g(){ return esc(2); }"],
    ['이름 붙은 함수 표현식 — return 뒤', [INNER_ONLY], "function mk(){ return function esc(s){ return s; }; }\nfunction g(){ return esc(2); }"],
    ['이름 붙은 함수 표현식 — return 뒤(같은 바깥 함수 안의 호출에서도 보이지 않는다)', [INNER_ONLY], "function mk(){ setTimeout(() => esc(1)); return function esc(s){ return s; }; }"],
    ['이름 붙은 함수 표현식 — 객체의 값 자리', [INNER_ONLY], "const o = { a: function esc(s){ return s; } };\nfunction g(){ return esc(2); }"],
    ['이름 붙은 함수 표현식 — 자기 본문 안의 호출은 보인다', [], "const h=function esc(s, n){ return n ? esc(s, n - 1) : s; };"],
    ['i++ 줄바꿈 뒤의 function 은 선언이다', [], "let i = 0\ni++\nfunction esc(s){ return s; }\nfunction g(){ return esc(1); }"],
    ['주석·문자열 안의 호출은 호출이 아니다', [], "// esc(1)\nconst s='toast(1)'; const t=`${1} lang()`;"],
    ['템플릿의 ${ } 안은 호출이다', [NO_DEF], "const t=`${esc(1)}`;"],
    ['객체의 메서드 정의·메서드 호출은 헬퍼가 아니다', [], "const o={ esc(s){ return s; }, tx(k){ return k; } };\nfunction g(o){ return o.esc(1) + o?.tx('k'); }"],
    ['같은 화면 다른 <script> 의 최상위 정의', [], page('function esc(s){ return String(s); }', 'function g(){ return esc(1); }')],
    ['다른 <script> 의 함수 안 정의', [INNER_ONLY], page('function boot(){ function esc(s){ return String(s); } }', 'function g(){ return esc(1); }')],
    ['모듈 스크립트의 최상위 정의는 그 스크립트 밖에서 보이지 않는다', [MODULE_ONLY], page('<script type="module">\nconst esc = (s) => String(s);\n</script>', 'function g(){ return esc(1); }')],
    ['모듈 스크립트 안에서는 자기 최상위·import 이름이 보인다', [], page('<script type="module">\nimport { esc } from "./a.js";\nconst tx = (k) => k;\nfunction g(){ return esc(1) + tx("k"); }\n</script>')],
    ['주석 처리된 <script> 의 정의는 정의가 아니다', [NO_DEF], page('<!-- <script>function esc(s){ return s; }</script> -->', 'function g(){ return esc(1); }')],
    ['로컬 <script src> 파일의 최상위 정의', [], page('<script src="../assets/h-top.js"></script>', 'function g(){ return esc(1); }')],
    ['로컬 <script src> 파일의 함수 안 정의', [NO_DEF], page('<script src="../assets/h-inner.js"></script>', 'function g(){ return esc(1); }')],
    ['공용 파일이 (function (global) { global.이름 = … })(window) 로 내보낸 전역', [], page('<script src="../assets/h-iife.js"></script>', 'function g(){ return esc(1) + tx("k"); }')],
    ['IIFE 의 인자가 전역 객체가 아니면 전역이 아니다', [NO_DEF], page('<script src="../assets/h-iife2.js"></script>', 'function g(){ return esc(1); }')],
    ['const w = window; w.이름 = …', [], "const w = window;\nfunction init(){ w.esc = (s) => String(s); }\nfunction g(){ return esc(1); }"],
    ['const w = 다른 객체; w.이름 = … 은 전역이 아니다', [NO_DEF], "const w = app;\nfunction init(){ w.esc = (s) => String(s); }\nfunction g(){ return esc(1); }"],
    ['문법은 맞지만 뼈대가 읽지 못하는 화면 — 통과가 아니라 오류', ['헬퍼 범위를 따지지 못했습니다'], "var q = {} / 2;\nfunction g(){ return 1; }"],
  ].map(([name, want, body]) => [name, want, body.startsWith('<!doctype') ? body : page(body)]), {
    'ops/assets/h-top.js': 'function esc(s){ return String(s); }\n',
    'ops/assets/h-inner.js': 'function boot(){ function esc(s){ return String(s); } }\n',
    'ops/assets/h-iife.js': '(function (global) {\n  global.esc = function(s){ return String(s); };\n  function tx(k){ return k; }\n  global.tx = tx;\n})(window);\n',
    'ops/assets/h-iife2.js': '(function (global) {\n  global.esc = function(s){ return String(s); };\n})(app);\n',
  });
});
test('문법 검사: 문법 오류 — 인라인·모듈·스크립트 파일, 실행되지 않는 블록은 보지 않는다', () => {
  const r = errTable('check-syntax.mjs', [
    ['인라인 문법 오류', ['(script #0)'], page('function f(){ return ; \n')],
    ['둘째 스크립트의 문법 오류', ['(script #1)'], page('var a = 1;', 'var b = ;')],
    ['모듈 — 올바른 import·최상위 await', [], page('<script type="module">\nimport x from "./a.js";\nconst y = await x();\n</script>')],
    ['모듈 — 문법 오류', ['(script #0, module)'], page('<script type="module">\nimport x from "./a.js"; export const y = ;\n</script>')],
    ['data-src 는 src 가 아니다', ['(script #0)'], page('<script data-note="src=1" data-src="x.js">\nvar a = ;\n</script>')],
    ['data-type 은 type 이 아니다', ['(script #0)'], page('<script data-type="main">\nvar a = ;\n</script>')],
    ['옛 type(text/javascript) 스크립트', ['(script #0)'], page('<script type="text/javascript">\nvar a = ;\n</script>')],
    ['JSON·템플릿 블록은 스크립트가 아니다', [], page('<script type="application/json">{"a": }</script>', '<script type="text/template"><b>{{ a </b></script>')],
    ['src 가 있는 태그의 본문은 실행되지 않는다', [], page('<script src="https://example.com/a.js">var a = ;</script>')],
    ['닫히지 않은 <script>', ['닫히지 않았습니다'], '<!doctype html><html><body><script>\nvar a = 1;\n</body></html>\n'],
    ['UTF-16 으로 저장한 화면', ['NUL 글자'], Buffer.from('\ufeff' + page('var a = 1;'), 'utf16le')],
    ['EUC-KR 로 저장한 화면', ['UTF-8 이 아닌 글자'], Buffer.concat([Buffer.from('<!doctype html><html><body><p>'), Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]), Buffer.from('</p><script>var a = 1;</script></body></html>\n')])],
    ['src 가 있는 <script/> 가 뒤의 스크립트를 삼킨다', ['삼켰습니다'], '<!doctype html><html><body>\n<script src="../assets/plain-ok.js"/>\n<script>\ndocument.title = "x";\n</script>\n</body></html>\n'],
    ['src 가 있는 <script> 를 제대로 닫았다', [], page('<script src="../assets/plain-ok.js"></script>', 'document.title = "x";')],
    ['문법 오류 줄에 화면의 줄 번호', [':5 (script #0)'], page('var a = 1;\n\nvar b = ;')],
    ['스크립트 파일 — 올바른 일반 스크립트', [], 'var ok = 1;\n', 'ops/assets/plain-ok.js'],
    ['스크립트 파일 — 문법 오류', ['plain-bad.js: '], 'var a = ;\n', 'ops/assets/plain-bad.js'],
    ['스크립트 파일 — ESM 문법 오류', ['esm-bad.js: '], 'import x from "./y.js";\nexport const a = ;\n', 'ops/assets/esm-bad.js'],
    ['.mjs 파일 — 문법 오류(ops 밖도 본다)', ['x.mjs: '], 'import x from "./y.js";\nexport const a = ;\n', 'tools/x.mjs'],
    ['.mjs 파일 — 올바른 ESM', [], 'import x from "./y.js";\nexport const a = 1;\n', 'tools/ok.mjs'],
    ['모듈로 싣는 화면이 있는 ESM .js', [], 'import x from "./y.js";\nexport const a = 1;\n', 'ops/assets/esm.js'],
  ]);
  assert.equal(r.status, 1);
  assert.match(r.err, /✗ 문법 오류 10건/);
  assert.match(r.err, /✗ 읽지 못한 화면 4건/);
  assert.match(r.of('ops/assets/plain-bad.js')[0], /줄 1 — /, '스크립트 파일의 오류에도 줄 번호');
  assert.match(r.of('tools/x.mjs')[0], /줄 2 — /, '.mjs 파일의 오류에도 줄 번호');
});
test('문법 검사: import/export 가 든 .js 는 모듈로 싣는 화면이 있을 때만 통과한다', () => {
  const esm = 'import x from "./y.js";\nexport const a = 1;\n';
  const none = runIn('check-syntax.mjs', { 'ops/assets/esm.js': esm, 'ops/hub/c.html': page('var a = 1;') });
  assert.equal(none.status, 1);
  assert.match(none.of('ops/assets/esm.js').join('\n'), /type=module 로 싣는 화면이 없습니다/);
  const loaded = runIn('check-syntax.mjs', { 'ops/assets/esm.js': esm, 'ops/hub/c.html': page('<script type="module" src="../assets/esm.js"></script>') });
  assert.equal(loaded.status, 0, loaded.err);
  /* 일반 <script src> 로 싣는 화면이 있으면, 다른 화면에 모듈 스크립트가 있어도 오류다(브라우저가 파일 전체를 거부한다) */
  const classic = runIn('check-syntax.mjs', { 'ops/assets/esm.js': esm, 'ops/hub/c.html': page('<script src="../assets/esm.js"></script>'), 'ops/hub/d.html': page('<script type="module">\nconst a = 1;\n</script>') });
  assert.equal(classic.status, 1);
  assert.match(classic.of('ops/assets/esm.js').join('\n'), /일반 <script src> 로 싣는 화면이 있는데 모듈 문법/);
  const both = runIn('check-syntax.mjs', { 'ops/assets/esm.js': esm, 'ops/hub/c.html': page('<script src="../assets/esm.js"></script>'), 'ops/hub/d.html': page('<script type="module" src="../assets/esm.js"></script>') });
  assert.equal(both.status, 1, '한 화면이라도 일반 스크립트로 실으면 오류다');
  /* type=module 로만 싣는 파일은 모듈 문법으로 본다 — import/export 없이 최상위 await 만 있어도, strict 가 아닌 문법(with)은 오류 */
  const mod = runIn('check-syntax.mjs', {
    'ops/assets/boot.js': 'const cfg = await fetch("/x").then((r) => r.json());\n',
    'ops/assets/min.js': 'const a=1;export{a};\n',
    'ops/assets/old.js': 'with (Math) { var x = PI; }\n',
    'ops/hub/c.html': page('<script type="module" src="../assets/boot.js"></script>', '<script type="module" src="../assets/min.js"></script>', '<script type="module" src="../assets/old.js"></script>'),
  });
  assert.deepEqual(mod.flagged, ['ops/assets/old.js'], mod.err);
});
test('문법 검사: on*= 핸들러 — 브라우저가 읽는 값으로 문법을 본다', () => {
  const r = errTable('check-syntax.mjs', [
    ['닫히지 않은 괄호', ['onclick="go(1"'], page('<button onclick="go(1">x</button>')],
    ['올바른 핸들러(문자 참조·return 문)', [], page('<button onclick="go(\'a\'); if(a &lt; b) go(); if(a &lt b) go(); return go(&#39;c&#39;, &#x27;d&#x27;)" once="a b">x</button>')],
    ['모르는 문자 참조는 글자 그대로', [], page('<button onclick="go(\'&hellip;&zzz;\')">x</button>')],
    ['문자 참조를 풀면 문법 오류', ['onclick="go(&quot;a)"'], page('<button onclick="go(&quot;a)">x</button>')],
    ['따옴표 없는 값', ['onclick="go(1"'], page('<button onclick=go(1)>x</button><button onclick=go(1>y</button>')],
    ['작은따옴표 값', ['onclick='], page("<button onclick='go(\"a\"'>x</button>")],
    ['대문자 속성 이름', ['ONCLICK="go(1"'], page('<button ONCLICK="go(1">x</button>')],
    ['다른 이벤트(onchange·oninput)', ['onchange=', 'oninput='], page('<input onchange="go(1" oninput="go(2">')],
    ['핸들러의 await 는 문법 오류다(일반 함수로 컴파일된다)', ['onclick="await go(1)"'], page('<a onclick="await go(1)">y</a>')],
    ['이벤트가 아닌 on… 속성·data-on… 은 핸들러가 아니다', [], page('<button once="a b" onfoo="go(1" data-onclick="go(1">x</button>')],
    ['textarea·title 안의 글자는 태그가 아니다', [], page('<textarea><b onclick="go(1"></textarea><title><i onclick="go(1"></title>')],
    ['주석 안의 태그는 보지 않는다', [], page('<!-- <b onclick="go(1"> -->')],
  ]);
  assert.match(r.err, /✗ on\*= 핸들러 오류 8건/);
  assert.match(r.out, /검사하지 않은 on… 속성 3곳\(알려진 이벤트 이름이 아님\): once · onfoo/);
});
test('문법 검사: 색 폴백 — var(--이름, 색) 은 ops 아래 어디서든 잡는다', () => {
  const r = errTable('check-syntax.mjs', [
    ['HEX · 줄바꿈+대문자 · 색 이름 · rgb', ['var(--accent,#123456)', 'VAR(--x, #abc)', 'var(--x, red)', 'var(--x,rgb(1,2,3))'], css('.a{color:var(--accent,#123456)} .b{color:VAR(--x,\n  #abc)} .c{color:var(--x, red)} .d{color:var(--x,rgb(1,2,3))}')],
    ['hsl · 주석 뒤의 색 · white · transparent · currentColor', ['hsl(10 20% 30%)', 'var(--x, #abc)', 'var(--x,white)', 'var(--x,transparent)', 'var(--x,currentColor)'], css('.a{color:var(--x,hsl(10 20% 30%))} .b{color:var(--x, /* 설명 */ #abc)} .c{color:var(--x,white)} .d{color:var(--x,transparent)} .e{color:var(--x,currentColor)}')],
    ['여러 값에 섞인 색', ['var(--bd, 1px solid #ccc)'], css('.a{border:var(--bd, 1px solid #ccc)}')],
    ['중첩 var 는 색이 든 안쪽만 한 번', ['var(--y,#123)', 'var(--line,#ccc)'], css('.a{color:var(--x,var(--y,#123))} .b{color:var(--x,var(--y))} .c{border:var(--bd,1px solid var(--line,#ccc))}')],
    ['색이 아닌 기본값', [], css(':root{--accent:#647548} .a{color:var(--accent);font-size:calc(1px*var(--fs,1));font-family:var(--mono,monospace);width:var(--w,12px);margin:var(--m,0 auto);content:var(--c,"#fff")}')],
    ['CSS 주석 안의 예시', [], css('/* .a{color:var(--x,#123456)} */ .b{color:var(--x)}')],
    ['url( ) 안의 글자 · 수학 함수 tan( ) 은 색이 아니다(url 밖의 색은 잡는다)', ['url(a.png) red'], css('.a{background:var(--bg, url(#fade))} .b{background:var(--bg, url(img/red.png))} .c{width:calc(1px * var(--t, tan(30deg)))} .d{background:var(--bg, url(a.png) red)}')],
    ['스크립트 주석 안의 예시', [], page('// 규칙: var(--accent,#3d5424) 처럼 쓰지 않는다\nvar a = 1;')],
    ['스크립트 문자열 안의 색 폴백', ['var(--x,#123456)'], page("el.style.color = 'var(--x,#123456)';")],
    ['.htm', ['var(--x,#123456)'], css('.a{color:var(--x,#123456)}'), 'ops/hub/a.htm'],
    ['.css', ['var(--x,#123456)'], '.a{color:var(--x,#123456)}\n', 'ops/assets/a.css'],
    ['.js', ['var(--x, #abcdef)'], "var c = 'var(--x, #abcdef)';\n", 'ops/assets/b.js'],
    ['.mjs', ['var(--x,#123456)'], "export const c = 'var(--x,#123456)';\n", 'ops/assets/a.mjs'],
    ['모듈 문법 .js 의 주석 안 예시', [], "// 규칙: var(--accent,#3d5424) 처럼 쓰지 않는다\nimport x from './y.js';\nexport const a = 1;\n", 'ops/assets/m.js'],
    ['(위 파일을 모듈로 싣는 화면)', [], page('<script type="module" src="../assets/m.js"></script>'), 'ops/hub/loads-m.html'],
    ['ops 밖의 파일은 보지 않는다', [], css('.a{color:var(--x,#123456)}'), 'other/a.html'],
  ]);
  assert.match(r.err, /✗ 색\(HEX 등\) 폴백 18건/);
});
test('문법 검사: 주석에 먹힌 속성 · 깨끗한 트리 · ops 폴더 없음', () => {
  const r = errTable('check-syntax.mjs', [
    ['여러 줄 객체 첫 줄의 //주석이 닫는 중괄호를 삼킴', ['주석 안에 속성으로 보이는 글자'], page('let state={ a:1,  // 설명 }\n  b:2 };')],
    ['주석이 윗줄에 있으면 괜찮다', [], page('// 설명\nlet state={ a:1,\n  b:2 };')],
    ['문자열 안의 // 는 주석이 아니다', [], page("let state={ a:'http://x', b:2,\n  c:3 };")],
    ['설명 주석의 TODO: · NOTE: · step1: 은 삼킨 것이 아니다', [], page("const CFG = {   // TODO: 서버에서 받기\n  a: 1,\n  b: 2\n};\nlet B = [   // step1: 등록 순서\n  1, 2 ];\nvar C = {   // 상태: 로딩/완료 · https://example.com/a 참고\n  c: 3 };")],
    ['주석이 뒤 속성을 삼킴( 이름: 값, 꼴 )', ['주석 안에 속성으로 보이는 글자'], page("let state={ a:1, grp:null,  // 설명  team:null, cart:[],\n  x:1 };")],
    ['주석이 뒤 속성을 삼킴 — 닫는 괄호 없이 이름: 값, 만', ['주석 안에 속성으로 보이는 글자'], page("let state={ a:1,  // 설명  team:null, grp:null,\n  x:1 };")],
  ]);
  assert.match(r.err, /✗ 주석에 먹힌 속성 3건/);
  const ok = runIn('check-syntax.mjs', { 'ops/hub/a.html': page("const esc=s=>String(s);\nfunction g(){ return esc(1); }", '<button onclick="g()">x</button>'), 'ops/assets/a.js': 'var x = 1;\n' });
  assert.equal(ok.status, 0, ok.err);
  assert.match(ok.out, /HTML 1개 · 인라인 스크립트 1개 · 스크립트 파일 1개/);
  assert.match(ok.out, /on\*= 핸들러 1곳/);
  const none = runIn('check-syntax.mjs', { 'hub/c.html': page('var a = 1;') });
  assert.equal(none.status, 1);
  assert.match(none.err, /ops 폴더가 없습니다/);
});

// ── scripts/check-tracked.mjs ───────────────────────────────────────────────
/* 지어낸 값 — 비밀값의 「꼴」만 맞춘다(이 파일에는 이어 붙이기 전의 토막만 있다) */
const alnum = (n) => 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'.repeat(8).slice(0, n);
const hex = (n) => 'abcdef0123456789'.repeat(8).slice(0, n);
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) => [b64u({ alg: 'HS256', typ: 'JWT' }), b64u({ iss: 'supabase', role }), 'c2lnbmF0dXJlLXBsYWNlaG9sZGVy'].join('.');
const FAKE_KEY = 'sb_' + 'secret_' + alnum(32);
const PG = 'postgres' + 'ql://';
test('추적 파일 검사: 올리면 안 되는 이름', () => {
  const NAME = '저장소에 두지 않습니다';
  const r = errTable('check-tracked.mjs', [
    ['xlsx', ['.xlsx 파일'], 'x', 'data/list.xlsx'],
    ['대문자 확장자', ['.csv 파일'], 'x', 'data/members.CSV'],
    ['pdf', ['.pdf 파일'], 'x', 'docs/manual.pdf'],
    ['이름 가운데 토막(백업)', ['이름 가운데에 .xlsx 토막'], 'x', 'a.xlsx.bak'],
    ['끝의 ~', ['.csv 파일'], 'x', 'b.csv~'],
    ['끝의 점', ['.pdf 파일'], 'x', 'c.PDF.'],
    ['문서로 보이는 이름도 토막을 본다', ['이름 가운데에 .pdf 토막'], 'x', 'README.pdf.md'],
    ['빈칸이 든 이름', ['.xlsx 파일'], 'x', 'data/예약 리스트.xlsx'],
    ['빈칸이 든 이름 2', ['.csv 파일'], 'x', 'data/list copy.csv'],
    ['겹친 압축 확장자', ['.bz2 파일'], 'x', 'd.tar.bz2'],
    ['압축', ['.gz 파일'], 'x', 'archive.tar.gz'],
    ['DB 파일', ['.sqlite3 파일'], 'x', 'b.sqlite3'],
    ['덤프', ['.dump 파일'], 'x', 'c.dump'],
    ['.env.local', ['환경 변수 파일'], 'A=1\n', '.env.local'],
    ['.envrc', ['환경 변수 파일'], 'export A=1\n', '.envrc'],
    ['.dev.vars', ['환경 변수 파일'], 'A=1\n', 'sub/.dev.vars'],
    ['prod.env', ['환경 변수 파일'], 'A=1\n', 'prod.env'],
    ['prod.env.bak', ['환경 변수 파일'], 'A=1\n', 'prod.env.bak'],
    ['.env 폴더 안의 파일', ['환경 변수 폴더'], 'x\n', '.env/a.txt'],
    ['SSH 개인키 파일', ['SSH 개인키'], 'x', 'keys/id_rsa'],
    ['.netrc', ['접속 정보 파일(.netrc)'], 'machine a\n', '.netrc'],
    ['.pgpass', ['접속 정보 파일(.pgpass)'], 'a\n', 'sub/.pgpass'],
    ['env 를 설명하는 문서는 아니다', [], '# 설명\n', 'x.env.md'],
    ['이름으로 막지 않는 것(pptx·png·json·sql)', [], 'x', 'ok/deck.pptx'],
    ['이름으로 막지 않는 것 2', [], 'x', 'ok/photo.png'],
    ['이름으로 막지 않는 것 3', [], 'select 1;\n', 'ok/query.sql'],
    ['이름에 낱말이 들었을 뿐', [], 'x', 'ok/pdf.md'],
    ['node_modules 는 걷지 않는다', [], 'x', 'node_modules/x/a.csv'],
  ]);
  assert.equal(r.status, 1);
  assert.ok(r.lines.filter((l) => l.includes(NAME)).length === 22, '이름 오류 22건');
  assert.match(r.err, /✗ 올리면 안 되는 파일·비밀값 22건/);
  assert.match(r.err, /ALLOW 에 경로와 이유를 적습니다\(이름 검사만 건너뜁니다\)/);
  assert.doesNotMatch(r.err, /본문 검사는 ALLOW 로 건너뛸 수 없습니다/, '이름 문제만 있으면 본문 안내는 내지 않는다');
});
test('추적 파일 검사: 비밀값 꼴 — 값은 출력하지 않고, 자리표시자는 넘어간다', () => {
  const r = errTable('check-tracked.mjs', [
    ['sb_secret_ 키', ['secret.js:1 — 비밀값 꼴: Supabase secret key'], `const k = '${FAKE_KEY}';\n`, 'src/secret.js'],
    ['둘째 줄의 키', ['line2.js:2 — 비밀값 꼴: Supabase secret key'], `// 설명\nconst k = '${FAKE_KEY}';\n`, 'src/line2.js'],
    ['UTF-16 으로 저장한 글 안의 키', ['Supabase secret key'], Buffer.from('\ufeff' + `k = ${FAKE_KEY}\n`, 'utf16le'), 'src/utf16.txt'],
    ['이진 파일 안의 키', ['Supabase secret key'], Buffer.concat([Buffer.from([0, 1, 2, 3, 0, 0]), Buffer.from(FAKE_KEY), Buffer.from([0, 9])]), 'src/a.bin'],
    ['Supabase 접근 토큰', ['Supabase 접근 토큰(sbp_)'], 'token = ' + 'sb' + 'p_' + hex(40) + '\n', 'src/sbp.txt'],
    ['Supabase 접근 토큰(oauth)', ['Supabase 접근 토큰(sbp_)'], 'token = ' + 'sb' + 'p_oauth_' + hex(40) + '\n', 'src/sbp2.txt'],
    ['service_role JWT', ['service_role JWT'], `const t = '${jwt('service_role')}';\n`, 'src/service.js'],
    ['service_role JWT — 표준 base64', ['service_role JWT'], "const t='" + [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64'), Buffer.from(JSON.stringify({ iss: 'supabase', role: 'service_role', pad: '??>>' })).toString('base64'), 'c2lnbmF0dXJlLXBsYWNlaG9sZGVy'].join('.') + "';\n", 'src/service2.js'],
    ['개인키 블록', ['개인키 블록'], '-----BEGIN ' + 'RSA PRIVATE KEY-----\nabc\n', 'src/pem.txt'],
    ['개인키 블록(OPENSSH)', ['개인키 블록'], '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----\n', 'src/pem2.txt'],
    ['GitHub 토큰(ghp_)', ['GitHub 토큰'], 'gh' + 'p_' + alnum(36) + '\n', 'src/gh.txt'],
    ['GitHub 토큰(github_pat_)', ['GitHub 토큰'], 'github' + '_pat_' + alnum(22) + '_' + alnum(59) + '\n', 'src/gh2.txt'],
    ['npm 토큰', ['npm 토큰'], 'np' + 'm_' + alnum(36) + '\n', 'src/npm.txt'],
    ['.npmrc 의 토큰', ['npm 토큰'], '//registry.npmjs.org/:_auth' + 'Token=' + alnum(30) + '\n', '.npmrc'],
    ['DeepL 키', ['DeepL 키'], 'key=' + '12345678-90ab-cdef-1234-567890abcdef' + ':fx\n', 'src/deepl.txt'],
    ['비밀번호가 든 DB 주소', ['비밀번호가 든 DB 접속 주소'], PG + 'postgres:Sup3rS3cretPw@db.example.com:5432/postgres\n', 'src/db.txt'],
    ['$ 로 시작하는 진짜 비밀번호', ['비밀번호가 든 DB 접속 주소'], PG + 'u:$tr0ngPw9@db.example.com/x\n', 'src/db2.txt'],
    ['로컬이 아닌 호스트의 기본 비밀번호', ['비밀번호가 든 DB 접속 주소'], PG + 'postgres:postgres@db.example.com/x\n', 'src/db3.txt'],
    ['anon JWT 는 공개값', [], `const t = '${jwt('anon')}';\n`, 'ok/anon.js'],
    ['낱말만 적은 문장·자리표시자', [], '규칙: sb_secret_ 로 시작하는 키는 넣지 않는다. 예: ' + PG + 'postgres:[YOUR-PASSWORD]@db.example.com\n', 'ok/words.md'],
    ['같은 글자만 이어 적은 예시', [], 'sb_' + 'secret_' + 'x'.repeat(30) + '\n', 'ok/placeholder.md'],
    ['같은 글자만 이어 적은 토큰 예시(sbp_ · ghp_ · npm_ · DeepL)', [], 'sb' + 'p_' + '0'.repeat(40) + '\n' + 'gh' + 'p_' + 'x'.repeat(36) + '\n' + 'np' + 'm_' + 'X'.repeat(36) + '\n' + 'key=' + '00000000-0000-0000-0000-000000000000' + ':fx\n', 'ok/token-example.md'],
    ['DB 주소 — 환경 변수·로컬 기본 계정', [], PG + 'u:${DB_PASS}@db.example.com/x\n' + PG + 'u:$DB_PASS@db.example.com/x\n' + PG + 'postgres:postgres@127.0.0.1:54322/postgres\n', 'ok/db.md'],
    ['.npmrc 의 환경 변수 참조', [], '//registry.npmjs.org/:_auth' + 'Token=${NPM_TOKEN}\n', 'ok/.npmrc'],
    ['UUID 는 DeepL 키가 아니다', [], 'id=12345678-90ab-cdef-1234-567890abcdef\n', 'ok/uuid.txt'],
    ['공개키 블록은 아니다', [], '-----BEGIN PUBLIC KEY-----\n', 'ok/pub.txt'],
  ]);
  assert.equal(r.status, 1);
  assert.match(r.err, /✗ 올리면 안 되는 파일·비밀값 18건/);
  assert.ok(!r.err.includes(FAKE_KEY) && !r.out.includes(FAKE_KEY), '비밀값 자체는 출력하지 않는다');
  assert.match(r.out, /폴더를 걸었습니다/);
  assert.match(r.err, /본문 검사는 ALLOW 로 건너뛸 수 없습니다/);
  assert.doesNotMatch(r.err, /이름 검사만 건너뜁니다/, '본문 문제만 있으면 ALLOW 안내는 내지 않는다');
});
test('추적 파일 검사: git 저장소에서는 추적 파일·추적 전 파일·색인에 올라간 내용을 본다', (t) => {
  if (spawnSync('git', ['--version']).status !== 0) return t.skip('git 이 없는 환경');
  const dir = mkdtempSync(join(tmpdir(), 'szgit-'));
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  try {
    const files = {
      '.gitignore': 'ignored.csv\n',
      'tracked.txt': 'ok\n',
      'tracked.xlsx': 'x',
      'staged.txt': `k = ${FAKE_KEY}\n`,
      'gone.txt': `k = ${FAKE_KEY}\n`,
      'ignored.csv': 'x',
      'untracked.pdf': 'x',
      'untracked.txt': 'ok\n',
      'sub/inner.csv': 'x',
    };
    writeTree(dir, files);
    assert.equal(git('init', '-q').status, 0);
    assert.equal(git('add', '-f', '.gitignore', 'tracked.txt', 'tracked.xlsx', 'staged.txt', 'gone.txt').status, 0);
    writeFileSync(join(dir, 'staged.txt'), '지웠다\n');      /* 작업 폴더에서는 지웠지만 색인에는 비밀값이 올라가 있다 */
    rmSync(join(dir, 'gone.txt'));                           /* 파일을 지웠지만(git rm 은 안 했다) 색인에는 남아 있다 */
    const r = report(spawnSync(process.execPath, [SCRIPT('check-tracked.mjs')], { cwd: dir, encoding: 'utf8' }), files);
    assert.equal(r.status, 1);
    assert.match(r.out, /추적 파일 5개 · 추적 전 파일 3개/);
    assert.deepEqual(r.flagged, ['gone.txt', 'staged.txt', 'sub/inner.csv', 'tracked.xlsx', 'untracked.pdf']);
    assert.match(r.of('staged.txt')[0], /색인에 올라간 내용 — 작업 폴더의 파일과 다릅니다/);
    assert.match(r.of('gone.txt')[0], /색인에 올라간 내용 — 작업 폴더에는 없는 파일입니다/);
    assert.match(r.of('untracked.pdf')[0], /아직 추적 전/);
    assert.doesNotMatch(r.of('tracked.xlsx')[0], /아직 추적 전/);
    assert.ok(!r.err.includes(FAKE_KEY));
    /* 저장소의 맨 위가 아닌 폴더에서 돌리면 git 목록 대신 그 폴더를 걷는다(.gitignore 를 따르지 않는다) */
    const sub = report(spawnSync(process.execPath, [SCRIPT('check-tracked.mjs')], { cwd: join(dir, 'sub'), encoding: 'utf8' }), { 'inner.csv': 'x' });
    assert.equal(sub.status, 1);
    assert.match(sub.out, /폴더를 걸었습니다/);
    assert.deepEqual(sub.flagged, ['inner.csv']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('추적 파일 검사: UTF-8 이 아닌 파일 이름 · git 이 거부한 폴더 — 건너뛰지 않고 알린다', (t) => {
  /* 다른 PC 에서 푼 압축의 한글 이름(CP949 바이트) — 글자로 바꾸면 깨져서 그 이름으로는 열 수 없다 */
  const badName = Buffer.concat([Buffer.from([0xb8, 0xde, 0xb8, 0xf0]), Buffer.from('.txt')]);
  const dir = mkdtempSync(join(tmpdir(), 'szenc-'));
  const bad = Buffer.concat([Buffer.from(dir + '/'), badName]);
  const run = () => spawnSync(process.execPath, [SCRIPT('check-tracked.mjs')], { cwd: dir, encoding: 'utf8' });
  try {
    try { writeFileSync(bad, `k = ${FAKE_KEY}\n`); } catch { return t.skip('이 파일 시스템은 UTF-8 이 아닌 이름을 받지 않는다'); }
    writeFileSync(join(dir, 'a.txt'), 'ok\n');
    const walked = run();
    assert.equal(walked.status, 1, walked.stdout);
    assert.match(walked.stderr, /파일 이름이 UTF-8 이 아닙니다/);
    assert.match(walked.stderr, /✗ 올리면 안 되는 파일·비밀값 1건/);
    if (spawnSync('git', ['--version']).status === 0) {
      const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
      assert.equal(git('init', '-q').status, 0);
      assert.equal(git('add', '-A').status, 0);
      const tracked = run();
      assert.equal(tracked.status, 1, tracked.stdout);
      assert.match(tracked.stdout, /추적 파일 2개/);
      assert.match(tracked.stderr, /파일 이름이 UTF-8 이 아닙니다/);
      /* .git 이 깨져 git 이 거부하면(저장소가 아닌 것과는 다르다) 폴더를 걷고, 그 까닭을 적는다 */
      rmSync(join(dir, '.git'), { recursive: true, force: true });
      writeFileSync(join(dir, '.git'), 'broken\n');
      const refused = run();
      assert.match(refused.stdout, /git 목록을 읽지 못해 — /);
      assert.match(refused.stdout, /\.gitignore 로 무시되는 파일도 봅니다/);
      rmSync(join(dir, '.git'), { force: true });
    }
  } finally { try { unlinkSync(bad); } catch { /* 없으면 그만 */ } rmSync(dir, { recursive: true, force: true }); }
});
test('추적 파일 검사: 깨끗한 폴더는 통과한다', () => {
  const r = runIn('check-tracked.mjs', { 'a.html': '<p>x</p>\n', 'b/c.js': 'var x = 1;\n' });
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /폴더의 파일 2개/);
});

// ── npm run verify ↔ CI ─────────────────────────────────────────────────────
/* 오류 줄이 많을 때 — 받는 쪽(CI 의 파이프)이 늦게 읽어도 끝의 요약 줄까지 나온다.
   process.exit() 로 끝내면 파이프에 못 들어간 줄이 버려진다(스크립트는 exitCode 만 정하고 끝까지 쓴다). */
function runSlowReader(script, dir) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [SCRIPT(script)], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
    let buf = '', reading = false;
    const start = () => { if (reading) return; reading = true; c.stderr.setEncoding('utf8'); c.stderr.on('data', (d) => { buf += d; }); };
    c.on('exit', start);                 /* 이미 끝났으면 파이프에 남은 것만 읽힌다 */
    const timer = setTimeout(start, 1000);      /* 끝까지 쓰려고 기다리는 스크립트는 이때부터 읽어 준다 */
    c.on('close', (code) => { clearTimeout(timer); resolve({ code, lines: buf.split('\n').filter(Boolean) }); });
  });
}
test('검사 스크립트: 오류가 많아도 파이프로 나가는 줄이 잘리지 않는다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'szpipe-'));
  try {
    const N = 3000;
    let js = 'async function f(){\n', cssText = '';
    for (let i = 0; i < N; i++) { js += `  const r${i} = await supa.from('bookings').select('a');\n`; cssText += `.a${i}{color:var(--c${i}, #abc)} /* ${'가'.repeat(60)} */\n`; }
    const files = { 'ops/hub/x.html': page(js + '}'), 'ops/assets/a.css': cssText };
    for (let i = 0; i < N; i++) files[`data/${'긴-이름-'.repeat(6)}${i}.csv`] = 'x';
    writeTree(dir, files);
    const w = await runSlowReader('check-wait.mjs', dir);
    assert.equal(w.code, 1);
    assert.equal(w.lines.length, N + 1, '대기 검사의 오류 줄 + 요약 줄');
    assert.match(w.lines[w.lines.length - 1], new RegExp(`^✗ 대기 누락 ${N}건`));
    const s = await runSlowReader('check-syntax.mjs', dir);
    assert.equal(s.code, 1);
    assert.match(s.lines[s.lines.length - 1], new RegExp(`^✗ 색\\(HEX 등\\) 폴백 ${N}건`));
    assert.equal(s.lines.filter((l) => l.startsWith('✗ ops/assets/a.css:')).length, N);
    const tr = await runSlowReader('check-tracked.mjs', dir);
    assert.equal(tr.code, 1);
    assert.equal(tr.lines.filter((l) => l.includes('.csv 파일')).length, N);
    assert.match(tr.lines[tr.lines.length - 1], /ALLOW 에 경로와 이유를 적습니다/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CI 는 npm run verify 가 도는 검사를 같은 명령으로 빠짐없이 돈다', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const live = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const runs = live.filter((l) => /^(?:- )?run:/.test(l)).map((l) => l.replace(/^(?:- )?run:\s*/, ''));
  const steps = pkg.scripts.verify.split('&&').map((s) => s.trim()).filter(Boolean);
  assert.equal(steps.filter((s) => /^node scripts\/[\w-]+\.mjs$/.test(s)).length, 4, 'verify = 정적 검사 4종');
  assert.equal(steps[steps.length - 1], 'node --test', 'verify 의 마지막은 단위 테스트');
  assert.equal(pkg.scripts.test, 'node --test', 'npm test 와 verify 의 단위 테스트는 같은 명령');
  assert.deepEqual([...runs].sort(), [...steps].sort(), 'CI 의 run 줄(주석 제외) = verify 의 단계(글자 그대로)');
  assert.ok(!live.some((l) => /^continue-on-error:|^if:/.test(l)), 'CI 단계에 continue-on-error·if 를 두지 않는다(실패를 삼키지 않는다)');
  assert.deepEqual(live.slice(live.indexOf('on:') + 1, live.indexOf('jobs:')), ['push:', 'pull_request:'], 'CI 는 모든 push·PR 에서 돈다(가지·경로로 좁히지 않는다)');
  assert.ok(!live.some((l) => /^(?:working-directory|defaults|shell|timeout-minutes):/.test(l)), 'CI 단계는 저장소의 맨 위에서 기본 설정으로 돈다');
  assert.equal(live.filter((l) => /^runs-on:/.test(l)).length, 1, 'CI 의 job 은 하나다');
});
test('.gitignore 의 목록은 추적 파일 검사의 이름 목록과 같다', () => {
  const src = readFileSync(SCRIPT('check-tracked.mjs'), 'utf8');
  const set = /const BAD_EXT = new Set\(\[([\s\S]*?)\]\);/.exec(src);
  assert.ok(set, 'check-tracked.mjs 에서 BAD_EXT 를 찾지 못했습니다');
  const exts = [...set[1].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  assert.deepEqual(ignore.filter((l) => /^\*\.[a-z0-9]+$/.test(l) && l !== '*.env').map((l) => l.slice(2)).sort(), exts, '.gitignore 의 *.확장자 줄 = BAD_EXT');
  for (const name of ['.env', '.env.*', '*.env', '.envrc', '.dev.vars', '.netrc', '.pgpass', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'node_modules/']) assert.ok(ignore.includes(name), `.gitignore 에 ${name} 줄이 없습니다`);
});
