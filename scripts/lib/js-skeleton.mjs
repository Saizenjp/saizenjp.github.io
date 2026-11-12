/* ============================================================================
 * js-skeleton.mjs — 스크립트 원문을 한 번 훑어 「코드 뼈대」를 만든다(검사 스크립트 공용, 노드 빌트인만)
 * ----------------------------------------------------------------------------
 *  쓰는 곳: check-syntax.mjs(헬퍼 정의 범위) · check-wait.mjs(조회 체인·주석·문자열 구분)
 *  skeleton(src) 이 돌려주는 것(원문과 길이가 같다):
 *    text   뼈대 — 주석은 빈칸, 문자열·템플릿 본문·정규식 본문은 뜻 없는 글자(따옴표·`${ }` 는 남긴다)
 *    kind   글자마다의 종류 — CODE(0) · STR(1, 따옴표·백틱 포함) · COMMENT(2) · REGEX(3)
 *           템플릿의 `${ … }` 안은 코드다(여닫는 중괄호 포함. `$` 한 글자만 STR)
 *    blk · parent · isFn   글자마다 그 자리를 감싼 블록 번호, 블록의 바깥 블록, 함수 본문인지
 *  읽지 못하면 { ok:false, why } — 부르는 쪽이 「검사하지 못함」으로 알린다(조용히 통과시키지 않는다).
 *  읽지 못하면 실패한 자리도 준다 — at(글자 번호) 또는 line(줄). failLine(결과, 원문) 이 줄 번호로 바꾼다.
 *  문법은 맞는데 읽지 못하는 꼴(알려진 것): 닫는 중괄호 바로 뒤의 나눗셈 — 값으로 끝난 { }( var q = {} / 2 · function(){ … } / 2 ).
 *    닫는 중괄호 뒤의 / 는 정규식으로 읽는다(문장 블록 뒤의 정규식이 훨씬 흔하다). 그 줄은 틀리게 읽고 넘어가지 않고
 *    「정규식이 닫히지 않음」 또는 V8 확인 실패로 끝난다 → 값을 괄호로 감싸거나 변수로 빼서 적는다.
 *    같은 식으로 끝나는 드문 꼴: return 바로 뒤에 이름이 of 인 변수의 나눗셈( return of / 2 ).
 *    읽는 꼴(2026-11 보강): 숫자 끝의 소수점( 1. / 3 ) · 이름이 of 인 변수( var x = of / 2 ) · for await ( … ) 뒤의 정규식
 *    · export default /re/ · 줄 끝으로서의 U+2028·U+2029 · JS 가 빈칸으로 읽는 글자(NBSP · 전각 빈칸 U+3000 · BOM · \v · \f — 이름 글자가 아니다).
 *    조용히 틀리게 읽는 드문 꼴(알려진 것): for ((x) of /re/ …) · a+++/re/ · 줄 끝에서 끝난 let y · var y · debugger 다음 줄 머리의 /re/
 *    · U+2028 뒤 줄 머리의 「-->」. 이름이 await·yield 인 변수의 나눗셈, typeof·void·in·new 뒤 of 의 나눗셈은 「읽지 못함」으로 끝난다.
 *    실물 대조(2026-11): 저장소의 스크립트 52개와 바깥 라이브러리 파일 5,137개에서 종류가 어긋난 글자 0(acorn 토큰과 대조).
 *  그 밖: blankHtmlComments(html) · tagEnd(html, 자리) · scriptsOf(html) · scriptKind(여는 태그) · checkModuleSyntax(code)
 * ========================================================================== */
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

/* HTML → <script> 밖의 주석을 빈칸으로 바꾼 글(길이·줄 수 유지).
   주석 처리된 <script> 는 스크립트가 아니고, 주석 안의 「<script」 글자가 뒤의 진짜 </script> 까지를 삼키지도 않는다.
   · 주석의 끝은 브라우저와 같게 읽는다 — 「-->」·「--!>」, 그리고 빈 주석 「<!-->」·「<!--->」 는 그 자리에서 끝난다
     (끝을 더 멀리 잡으면 그 사이의 진짜 <script> 가 주석으로 지워져 검사에서 빠진다).
   · <script>·<style>·<textarea>·<title>·<xmp>·<iframe>·<noembed>·<noframes>·<noscript> 안의 「<!--」 는 주석이 아니라 글자다
     — 그 요소는 닫는 태그까지 그대로 둔다(스크립트를 켠 브라우저는 <noscript> 의 내용도 글자로 읽는다).
   · 태그 안(속성 값)의 「<!--」 도 주석이 아니다( <input placeholder="<!-- 로 시작"> ) — 태그는 속성 값의 따옴표까지 읽어 건너뛴다.
   · 알려진 한계: <script 글자를 찾는 일(scriptsOf)은 태그를 가리지 않는다 — 속성 값·<textarea>·<template>·SVG 안에 적힌
     「<script>」 글자도 스크립트의 시작으로 읽는다. 그런 화면은 대개 검사를 「더」 받거나 문법 오류로 알려진다
     (Chromium 의 문서 파서와 대조: 저장소의 화면 70개에서 실행되는 인라인 스크립트 48개가 글자 단위로 같다).
     조용히 빠지는 꼴(알려진 것 — 이 저장소 0곳): 태그 밖 글자로 적힌 `<script type="application/json">` 이 뒤의 진짜 스크립트를
     데이터 블록으로 삼키는 것 · 여는 태그의 다른 속성 값 안에 「 type=」·「 src=」 글자가 든 것( <script title="see src=x"> —
     type·src 는 여는 태그 글자 전체에서 찾는다) · `<![CDATA[ <!-- ]]>` 같은 가짜 주석 안의 「<!--」 뒤 스크립트. */
/* 「<」 자리에서 시작하는 태그의 끝(「>」 다음 자리). 태그가 아니면 -1. 속성 값의 따옴표를 브라우저처럼 읽는다 —
   값 안의 「>」·「<!--」 는 태그의 일부다( placeholder="<!-- 로 시작" ). */
const WS = /[\t\n\f\r ]/;
export function tagEnd(html, lt) {
  let j = lt + 1;
  if (html[j] === '/') j++;
  if (!/[a-zA-Z]/.test(html[j] || '')) return -1;
  while (j < html.length && !WS.test(html[j]) && html[j] !== '/' && html[j] !== '>') j++;      /* 태그 이름 */
  for (;;) {
    while (j < html.length && (WS.test(html[j]) || html[j] === '/')) j++;
    if (j >= html.length) return html.length;
    if (html[j] === '>') return j + 1;
    if (html[j] === '=') j++;                                                                   /* 이름이 = 로 시작하는 꼴 */
    while (j < html.length && !WS.test(html[j]) && html[j] !== '/' && html[j] !== '>' && html[j] !== '=') j++;   /* 속성 이름 */
    while (j < html.length && WS.test(html[j])) j++;
    if (html[j] !== '=') continue;
    j++;
    while (j < html.length && WS.test(html[j])) j++;
    const q = html[j];
    if (q === '"' || q === "'") { const e = html.indexOf(q, j + 1); if (e < 0) return html.length; j = e + 1; }
    else while (j < html.length && !WS.test(html[j]) && html[j] !== '>') j++;                   /* 따옴표 없는 값 */
  }
}
export function blankHtmlComments(html) {
  let out = '', i = 0, p = 0;      /* i = 아직 옮기지 않은 자리 · p = 훑는 자리 */
  while (p < html.length) {
    const lt = html.indexOf('<', p);
    if (lt < 0) break;
    if (html.startsWith('<!--', lt)) {
      const c = lt;
      let end;
      if (html.startsWith('>', c + 4)) end = c + 5;
      else if (html.startsWith('->', c + 4)) end = c + 6;
      else { const reClose = /--!?>/g; reClose.lastIndex = c + 4; const e = reClose.exec(html); end = e ? e.index + e[0].length : html.length; }
      out += html.slice(i, c) + html.slice(c, end).replace(/[^\n]/g, ' '); i = p = end;
      continue;
    }
    const te = tagEnd(html, lt);
    if (te < 0) { p = lt + 1; continue; }
    const raw = /^<(script|style|textarea|title|xmp|iframe|noembed|noframes|noscript)(?![^\t\n\f\r \/>])/i.exec(html.slice(lt, lt + 12));
    if (raw) {                     /* 글자 그대로인 요소 — 닫는 태그까지 그대로 둔다 */
      const reEnd = new RegExp('</' + raw[1] + '\\s*>', 'gi');
      reEnd.lastIndex = te;
      const e = reEnd.exec(html);
      p = e ? e.index + e[0].length : html.length;
      continue;
    }
    p = te;
  }
  return out + html.slice(i);
}

/* <script …> 여는 태그 → 'classic' · 'module' · null(브라우저가 스크립트로 실행하지 않는 것 — JSON·importmap·템플릿).
   type 이 없거나 비었으면 classic. 옛 MIME 꼴(application/x-javascript · text/ecmascript · text/jscript …)도 브라우저는 실행한다. */
const JS_MIME = new Set(['application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript',
  'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2', 'text/javascript1.3',
  'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript']);
export function scriptKind(openTag) {
  const m = /\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(openTag);
  if (!m) return 'classic';
  const t = (m[1] ?? m[2] ?? m[3] ?? '').trim().toLowerCase();
  if (t === '') return 'classic';
  if (t === 'module') return 'module';
  return JS_MIME.has(t.split(';')[0].trim()) ? 'classic' : null;
}

/* HTML 의 <script> 를 차례로 읽는다(주석은 먼저 blankHtmlComments 로 지운 글을 넣는다) → { list, unclosed }
     list     [{ open(여는 태그 글), at(여는 태그 자리), base(본문 시작), code(본문), src(src 속성이 있는가 — 값), kind('classic'·'module'·null), idx(src 없는 것들 가운데 몇 번째) }]
     unclosed 닫는 태그가 없는 여는 태그의 자리(-1 = 없음). 브라우저는 그 스크립트를 실행하지 않고, 뒤의 내용도 스크립트 글자로 삼킨다.
     dbl      unclosed 가 「이중 이스케이프」 때문인가 — 본문의 「<!--」 뒤( 「-->」 전)에 「<script」 글자가 있으면 브라우저는
              그다음 </script> 를 닫는 태그로 읽지 않는다(인쇄 팝업 템플릿의 주석에서 「-->」 를 빠뜨리면 화면이 통째로 죽는다).
   브라우저와 같게 「여는 태그 → 그 뒤 첫 </script」 로 자른다 — 본문 안의 '<script>' 글자(인쇄 팝업을 만드는 문자열)는 새 스크립트가 아니다. */
export function scriptsOf(html) {
  const list = [];
  const reOpen = /<script\b[^>]*>/gi;
  let m, idx = 0, unclosed = -1, dbl = false;
  while ((m = reOpen.exec(html))) {
    const base = m.index + m[0].length;
    const reClose = /<\/script\s*>/gi;
    reClose.lastIndex = base;
    const c = reClose.exec(html);
    if (!c) { unclosed = m.index; break; }
    if (scriptEndState(html.slice(base, c.index)) === 2) { unclosed = m.index; dbl = true; break; }
    const sm = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[0]);
    const src = sm ? (sm[1] ?? sm[2] ?? sm[3] ?? '') : null;
    list.push({ open: m[0], at: m.index, base, code: html.slice(base, c.index), src, kind: scriptKind(m[0]), idx: src === null ? idx++ : -1 });
    reOpen.lastIndex = c.index + c[0].length;
  }
  return { list, unclosed, dbl };
}
/* <script> 본문을 HTML 표준의 상태대로 훑은 끝 상태 — 0 보통 · 1 이스케이프(「<!--」 뒤) · 2 이중 이스케이프(그 뒤에 「<script」).
   2 로 끝나면 바로 뒤의 </script> 는 닫는 태그가 아니다(표준 파서 parse5 와 3만 회 대조 — 판정 불일치 0). */
export function scriptEndState(code) {
  let st = 0, i = 0;
  const n = code.length;
  while (i < n) {
    if (st === 0) {
      const k = code.indexOf('<!--', i);
      if (k < 0) break;
      st = 1; i = k + 4;
      let j = i;
      while (code[j] === '-') j++;
      if (code[j] === '>') { st = 0; i = j + 1; }      /* 「<!-->」·「<!--->」 는 그 자리에서 끝난다 */
      continue;
    }
    if (code.startsWith('-->', i)) { st = 0; i += 3; continue; }
    if (st === 1 && /^<script[\t\n\f\r \/>]/i.test(code.slice(i, i + 8))) { st = 2; i += 7; continue; }
    if (st === 2 && /^<\/script[\t\n\f\r \/>]/i.test(code.slice(i, i + 9))) { st = 1; i += 8; continue; }
    i++;
  }
  return st;
}

/* ESM(import/export 가 든 스크립트)의 문법만 본다 — '' 이면 통과, 아니면 오류 한 줄.
   vm.Script 는 import/export 를 읽지 못하고, `node --check 파일.js` 는 ESM 문법 오류를 놓친다 → 표준 입력으로 넘긴다. */
export function checkModuleSyntax(code) {
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: code, encoding: 'utf8' });
  if (r.status === 0) return '';
  const lines = String(r.stderr || (r.error && r.error.message) || '').split('\n');
  return (lines.find((l) => /Error/.test(l)) || '문법 오류').trim();
}
/* 같은 검사 + 오류가 난 줄(1부터, 모르면 0) */
export function checkModuleSyntaxAt(code) {
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: code, encoding: 'utf8' });
  if (r.status === 0) return null;
  const err = String(r.stderr || (r.error && r.error.message) || '');
  const ln = /\[stdin\]:(\d+)/.exec(err);
  return { why: (err.split('\n').find((l) => /Error/.test(l)) || '문법 오류').trim(), line: ln ? +ln[1] : 0 };
}

/* 뼈대가 실패한 줄(스크립트 안에서 1부터, 모르면 0) — { at } 이면 글자 번호에서, { line } 이면 그대로 */
export const failLine = (sk, src) => (sk.at !== undefined ? src.slice(0, sk.at).split('\n').length : (sk.line || 0));
export const CODE = 0, STR = 1, COMMENT = 2, REGEX = 3;
const REGEX_AFTER = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const CONTROL = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'await']);   /* 이 낱말 뒤 ( ) { 는 함수 본문이 아니다 */
const STMT_HEAD = new Set(['if', 'for', 'while', 'with']);                              /* 이 낱말의 ( ) 뒤에 오는 / 는 정규식이다 */
/* JS 가 빈칸으로 읽는 글자(WhiteSpace + 줄 끝) — NBSP·전각 빈칸(U+3000)·BOM 은 이름 글자가 아니다(입력기·붙여 넣은 코드에 섞인다) */
const UNI_SPACE = /[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/;
export const isJsSpace = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\v' || c === '\f' || (c > '\x7f' && UNI_SPACE.test(c));
export const isId = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$' || (c > '\x7f' && !UNI_SPACE.test(c));

/*  skeleton(src) — 원문과 길이가 같은 「코드 뼈대」와, 글자마다 그 자리를 감싼 블록 번호를 돌려준다.
      · 블록마다 함수 본문인지도 적는다: `) {` 인데 괄호 앞 낱말이 if·for 같은 제어문이 아니거나, `=> {` 이면 함수 본문.
      · 주석은 빈칸으로, 문자열·템플릿 본문·정규식 본문은 뜻 없는 글자로 바꾼다(따옴표·`${ }` 는 남긴다)
        → 뼈대에 남은 { } 는 전부 진짜 블록이고, 문자열·주석 속의 「esc(」 는 호출로 세지 않는다.
      · / 가 나눗셈인지 정규식인지는 앞 토큰으로 가린다(값 뒤 = 나눗셈). 드문 꼴은 틀릴 수 있어서
        만든 뼈대를 V8 에 한 번 파싱시켜 확인한다 — 정규식 자리는 「\.」 로 채워 두므로 V8 이 그 자리를
        나눗셈으로 읽으면 문법 오류가 난다. 통과하지 못하면 ok:false.
      · opts.module — type=module 스크립트(import/export 가 든다)는 뼈대 확인을 ESM 으로 한다. */
export function skeleton(src, opts = {}) {
  const n = src.length, out = new Array(n), blk = new Int32Array(n), kind = new Uint8Array(n);
  const parent = [];             /* 블록 번호 → 바깥 블록 번호(-1 = 최상위) */
  const isFn = [];               /* 블록 번호 → 함수 본문인가 */
  const tmpl = [];               /* 템플릿의 ${ 를 연 시점의 중괄호 깊이 */
  const heads = [];              /* 열린 ( 마다 그 바로 앞의 낱말(if·for·함수 이름 …, 없으면 '') */
  let i = 0, cur = -1, depth = 0, prevVal = false, why = '', kd = CODE, incPrev = false;
  let lastCh = '', last2 = '', lastWord = '', closedHead = '';   /* 직전 토큰의 끝 글자 · 그 앞 토큰 · 직전 낱말 · 방금 닫힌 괄호의 앞 낱말 */
  const put = (ch) => { out[i] = ch; blk[i] = cur; kind[i] = kd; i++; };
  const mark = (ch, word = '') => { last2 = lastCh; lastCh = ch; lastWord = word; };
  const lineHead = (p) => { for (let k = p - 1; k >= 0; k--) { if (src[k] === '\n') return true; if (kind[k] !== COMMENT && src[k] !== ' ' && src[k] !== '\t' && src[k] !== '\r') return false; } return true; };
  const tmplText = () => {       /* 템플릿 본문 — 닫는 ` 또는 ${ 까지 */
    kd = STR;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { put('x'); if (i < n) put(src[i] === '\n' ? '\n' : 'x'); continue; }
      if (c === '`') { put('`'); kd = CODE; prevVal = true; mark('`'); return true; }
      if (c === '$' && src[i + 1] === '{') { put('$'); kd = CODE; put('{'); tmpl.push(depth); prevVal = false; mark('{'); return true; }
      put(c === '\n' ? '\n' : 'x');
    }
    kd = CODE;
    why = '템플릿 문자열이 닫히지 않음';
    return false;
  };
  if (src.startsWith('#!')) { kd = COMMENT; while (i < n && src[i] !== '\n' && src[i] !== '\r') put(' '); kd = CODE; }   /* 파일 첫 줄의 #! 는 주석 */
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (isJsSpace(c)) { put(c); continue; }
    if (c === '/' && d === '/') { kd = COMMENT; while (i < n && src[i] !== '\n' && src[i] !== '\r' && src[i] !== '\u2028' && src[i] !== '\u2029') put(' '); kd = CODE; continue; }
    /* 일반 스크립트에서는 「<!--」 와 줄 머리의 「-->」 도 줄 주석이다(옛 브라우저용 감싸기 — 모듈에서는 아니다) */
    if (!opts.module && ((c === '<' && src.startsWith('!--', i + 1)) || (c === '-' && src.startsWith('->', i + 1) && lineHead(i)))) {
      kd = COMMENT; while (i < n && src[i] !== '\n' && src[i] !== '\r' && src[i] !== '\u2028' && src[i] !== '\u2029') put(' '); kd = CODE; continue;
    }
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2);
      if (e < 0) return { ok: false, why: '주석이 닫히지 않음', at: i };
      kd = COMMENT;
      while (i < e + 2) put(src[i] === '\n' ? '\n' : ' ');
      kd = CODE;
      continue;
    }
    if (c === '"' || c === "'") {
      kd = STR;
      put(c);
      for (;;) {
        if (i >= n || src[i] === '\n') { kd = CODE; return { ok: false, why: '문자열이 닫히지 않음', at: Math.min(i, n - 1) }; }
        const s = src[i];
        if (s === '\\') {      /* 줄 이음( \ + 줄바꿈 )은 그대로 둔다 — CRLF 파일이면 \ + \r + \n */
          if (src[i + 1] === '\n') { put('\\'); put('\n'); }
          else if (src[i + 1] === '\r' && src[i + 2] === '\n') { put('\\'); put('\r'); put('\n'); }
          else { put('x'); if (i < n) put('x'); }
          continue;
        }
        if (s === c) { put(c); break; }
        put('x');
      }
      kd = CODE;
      prevVal = true; mark(c);
      continue;
    }
    if (c === '`') { kd = STR; put('`'); { const t0 = i; if (!tmplText()) return { ok: false, why, at: t0 }; } continue; }
    if (c === '/' && !prevVal) {   /* 정규식 */
      let j = i + 1, cls = false;
      for (;;) {
        if (j >= n || src[j] === '\n') return { ok: false, why: '정규식이 닫히지 않음', at: i };
        const s = src[j];
        if (s === '\\') { j += 2; continue; }
        if (s === '[') cls = true; else if (s === ']') cls = false; else if (s === '/' && !cls) break;
        j++;
      }
      kd = REGEX;
      put('/');
      if ((j - i) % 2) put('.');          /* 본문 길이가 홀수면 한 글자를 먼저 */
      while (i < j) { put('\\'); put('.'); }
      put('/');
      while (i < n && isId(src[i])) put(src[i]);
      kd = CODE;
      prevVal = true; mark('/');
      continue;
    }
    if (isId(c)) {
      let j = i;
      while (j < n && isId(src[j])) j++;
      const word = src.slice(i, j);
      while (i < j) put(src[i]);
      /* 예약어 뒤의 / 는 정규식이다 — 단, 점 뒤의 낱말( t.in / t.total · a?.new / 2 )과 비공개 필드( this.#in / 2 )는 속성 이름이라 값이다( ...펼침 뒤는 아니다) */
      const prop = (lastCh === '.' && last2 !== '.') || lastCh === '#';
      const forAwait = !prop && word === 'await' && lastWord === 'for';      /* for await ( … ) 의 괄호도 for 의 괄호다 */
      /* 이름이 of 인 변수( var half = of / 2 ) — for (x of …) 의 of 는 앞이 이름·]·} 다 */
      const ofVar = word === 'of' && !(lastCh === 'a' || lastCh === ']' || lastCh === '}');
      prevVal = (prop || ofVar || !REGEX_AFTER.has(word)) && !(word === 'default' && lastWord === 'export');      /* export default /re/ */
      mark('a', prop ? '' : (forAwait ? 'for' : word));
      continue;
    }
    if (c === '{') {
      isFn.push((lastCh === ')' && !CONTROL.has(closedHead)) || (last2 === '=' && lastCh === '>'));
      parent.push(cur); put('{'); cur = parent.length - 1; depth++; prevVal = false; mark('{');
      continue;
    }
    if (c === '}') {
      if (tmpl.length && tmpl[tmpl.length - 1] === depth) { tmpl.pop(); put('}'); { const t0 = i; if (!tmplText()) return { ok: false, why, at: t0 }; } continue; }
      if (depth === 0) return { ok: false, why: '짝 없는 }', at: i };
      cur = parent[cur]; depth--; put('}'); prevVal = false; mark('}');
      continue;
    }
    if (c === '(') heads.push(lastWord);
    if (c === ')') closedHead = heads.pop() || '';
    if (c === ')' || c === ']') { put(c); prevVal = !(c === ')' && STMT_HEAD.has(closedHead)); mark(c); continue; }   /* if (ok) /re/.test(s) — 제어문의 괄호 뒤는 값이 아니라 문장 자리 */
    if ((c === '+' || c === '-') && lastCh === c && src[i - 1] === c) { put(c); prevVal = incPrev; mark(c); continue; }   /* ++ · -- 의 둘째 글자 — 뒤에 붙은 것(i++)이면 값이 이어진다 */
    if (c === '+' || c === '-') incPrev = prevVal;
    /* 숫자 끝의 소수점( 1. / 3 · 2.*x ) — 점 뒤의 / 는 나눗셈이다 */
    if (c === '.' && lastCh === 'a' && /^[0-9]/.test(lastWord) && /[0-9]/.test(src[i - 1] || '')) { put(c); prevVal = true; mark('a', lastWord); continue; }
    put(c); prevVal = false; mark(c);
  }
  if (depth || tmpl.length) return { ok: false, why: '중괄호가 닫히지 않음', at: n - 1 };
  const text = out.join('');
  if (opts.module) { const bad = checkModuleSyntaxAt(text); if (bad) return { ok: false, why: `뼈대를 V8 이 읽지 못함(${bad.why})`, line: bad.line }; }
  else {
    try { new vm.Script(text, { filename: 'skeleton-check.js' }); }
    catch (e) { const ln = /skeleton-check\.js:(\d+)/.exec(String(e.stack)); return { ok: false, why: `뼈대를 V8 이 읽지 못함(${e.message})`, line: ln ? +ln[1] : 0 }; }
  }
  return { ok: true, text, blk, parent, isFn, kind };
}
