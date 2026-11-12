/* ============================================================================
 * check-syntax.mjs — 화면(HTML)과 스크립트 파일의 정적 검사(실행하지 않는다)
 * ----------------------------------------------------------------------------
 *  ① 문법       전 HTML 의 인라인(src 없는) <script> + 저장소의 .js·.mjs·.cjs 파일
 *               .js 는 싣는 방식으로 본다 — type=module 로만 싣는 파일은 모듈 문법(최상위 await·한 줄로 줄인 export 포함, strict),
 *               일반 <script src> 로 싣는 화면이 하나라도 있으면 일반 문법(모듈 문법이 들어 있으면 오류 — 브라우저가 파일 전체를 거부한다).
 *               오류 줄에는 화면(파일)의 줄 번호를 붙인다.
 *  ② 헬퍼 범위   esc·tx·lang·toast 를 부르는 자리에서 그 정의가 보이는가
 *               전역 정의로 보는 것: 최상위 선언 · window/globalThis/self.이름 = · Object.assign(window, { … })
 *               · 전역 객체의 다른 이름( (function (global) { global.이름 = … })(window) 의 첫 매개변수 · const w = window )
 *                 — 그 이름이 보이는 블록 안의 대입만 센다. 인자는 전역 객체 그 자체여야 한다( window.SZ · this.SZ · windowManager 는 아니다.
 *                 this 는 일반 스크립트 최상위의 IIFE 일 때만). 그 블록에서 같은 이름을 다시 선언·대입·매개변수로 받으면 별칭이 아니다.
 *                 막는 꼴(올바른데 오류): 화살표 IIFE · !function(g){}(window) · var a = 1, w = window · 다른 <script> 의 const w = window
 *                 · 같은 스크립트의 다른 함수가 같은 이름의 매개변수를 가진 const w = window → window.이름 = 으로 적는다.
 *  ③ 주석       여러 줄 객체 첫 줄의 //주석이 뒤 속성을 삼키지 않는가( 닫는 괄호 · 「이름: 값, 이름:」 또는 「이름: 값,」 으로 끝나는 글이
 *               주석 안에 있을 때 — 값에 빈칸이 들어도( new Set() · a + b ) 본다. 「TODO: 임시, 나중에 지운다」·「상태: 로딩/완료」·
 *               「참고 https://…, 표 2」 같은 설명은 아니다. 콜론 없는 줄임 속성이 삼켜진 것은 보지 못한다)
 *  ④ on*=       정적 HTML 의 인라인 핸들러(onclick 등) 값이 문법에 맞는가
 *  ⑤ HEX 폴백   ops 아래의 화면·CSS·스크립트에 var(--이름,#hex) 같은 색 폴백이 없는가
 *  · CLAUDE.md §4 의 수동 검사("node --check")를 전 페이지 자동화한 것.
 *  · vm.Script 로 '파싱만' 한다 → DOM·전역 미정의여도 문법 오류만 잡힌다.
 *  · 외부 의존성 0(노드 빌트인만) → CI 에서 npm install 없이 즉시 실행.
 *  · 읽지 못한 것은 통과가 아니라 오류다 — 뼈대를 만들지 못한 화면, 닫히지 않은 <script>( 본문의 「<!--」 뒤 「<script」 글자 때문에
 *    브라우저가 그 </script> 에서 닫지 않는 것 포함 ), NUL 이 든 화면(UTF-16),
 *    UTF-8 이 아닌 화면(EUC-KR·Shift_JIS 로 저장), src 가 있는 <script> 가 뒤의 <script> 를 삼킨 화면
 *    ( <script src="…"/> 로 닫았거나 </script> 를 빠뜨렸다 — 브라우저는 다음 </script> 까지를 버린다).
 *  · 오류가 많아도 끝까지 쓰고 끝낸다(process.exit 로 끊지 않는다 — CI 의 파이프에서 끝의 요약 줄이 잘린다).
 *  · 보지 못하는 것: 600자를 넘는 var( ) 안의 색 폴백(긴 data: 주소 뒤) · esc?.( ) 꼴의 호출 · 이름이 catch·for 인 메서드와 static 블록 안의
 *    정의(전역으로 올려 읽는다) · 일반 <script src> 로 싣는 .mjs 의 export. 올바른데 막는 것: 동적 import( ) 로만 싣는 ESM .js(싣는 화면이
 *    없다고 알린다) · src 가 있는 <script> 본문의 주석에 「<script」 글자가 든 것. 문자열 안에 U+2028 이 있으면 그 뒤 오류의 줄 번호가 밀린다.
 *    한 줄이 수 MB 인 문자열은 ③ 에서 예외로 끝난다(통과하지는 않는다).
 *  실행:  node scripts/check-syntax.mjs   (저장소 맨 위 폴더에서 — ops 폴더가 없으면 오류로 끝낸다)
 * ========================================================================== */
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { skeleton, isId, blankHtmlComments, scriptsOf, checkModuleSyntax, checkModuleSyntaxAt, failLine, CODE, COMMENT } from './lib/js-skeleton.mjs';
import { decodeAttr } from './lib/html-entities.mjs';

const ROOT = process.cwd();
if (!existsSync(join(ROOT, 'ops'))) {      /* 다른 폴더에서 돌리면 화면 0개를 보고 ✓ 가 나온다 */
  console.error('✗ ops 폴더가 없습니다 — 저장소의 맨 위 폴더에서 실행하세요( node scripts/check-syntax.mjs ).');
  process.exit(1);
}
const SKIP = new Set(['node_modules', '.git']);
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    let st; try { st = lstatSync(p); } catch { continue; }
    if (st.isSymbolicLink()) continue;      /* 링크는 따라가지 않는다(저장소 밖을 읽지 않게) */
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const all = walk(ROOT).sort();
const files = all.filter((p) => /\.html?$/i.test(p));
/* 그 HTML 의 「JS 인 인라인 스크립트」 목록 — {code, idx(src 없는 <script> 가운데 몇 번째), line(본문 첫 줄의 파일 줄 번호)}
     · src 속성이 있는 <script> 는 인라인이 아니다(data-src 같은 다른 속성 이름은 src 가 아니다).
     · JS 가 아닌 <script> 는 건너뛴다 — 구조화 데이터(application/ld+json)·importmap·템플릿.
       JSON-LD 를 JS 로 파싱하면 `"@context":` 가 라벨로 읽혀 무조건 문법 오류가 난다.
     · ⚠ type 은 여는 태그에서만, 앞이 빈칸인 속성으로만 읽는다 — 본문까지 보면 스크립트 안의 `type="button"` 글자를
       type 속성으로 읽어 그 스크립트를 통째로 건너뛴다(2026-11 검수: 49개 중 35개가 검사되지 않고 있었다).
       data-type="…" 도 type 이 아니다. 옛 MIME 꼴(application/x-javascript 등)은 브라우저가 실행하므로 본다(lib 의 scriptKind).
     · 닫는 태그가 없는 <script> 는 unclosed(그 줄 번호)로 알린다 — 브라우저는 그 스크립트를 실행하지 않는다. */
function inlineScripts(raw) {
  const html = blankHtmlComments(raw);      /* 주석 처리된 <script> 는 스크립트가 아니다(길이·줄 수는 그대로) */
  const { list, unclosed, dbl } = scriptsOf(html);
  const scripts = [];
  let swallowed = 0;      /* src 가 있는 <script> 의 본문에 또 <script 가 있다 — 「/>」 로 닫았거나 </script> 가 빠져, 다음 </script> 까지(뒤의 스크립트)를 삼켰다 */
  for (const t of list) {
    if (t.src !== null && t.kind && /<script\b/i.test(t.code) && !swallowed) swallowed = html.slice(0, t.at).split('\n').length;
    if (t.src !== null || !t.kind || !t.code.trim()) continue;
    scripts.push({ code: t.code, idx: t.idx, module: t.kind === 'module', line: html.slice(0, t.base).split('\n').length });
  }
  return { scripts, tags: list, unclosed: unclosed < 0 ? 0 : html.slice(0, unclosed).split('\n').length, dbl, swallowed };
}
const lineOf = (s, pos) => s.line + s.code.slice(0, pos).split('\n').length - 1;

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });
const pages = files.map((f) => {
  const buf = readFileSync(f);
  let badUtf8 = false;
  try { strictUtf8.decode(buf); } catch { badUtf8 = true; }      /* EUC-KR·Shift_JIS 로 저장한 화면 — 글자가 깨진 채로 읽으면 통과처럼 보인다 */
  const html = buf.toString('utf8');
  return { f, html, badUtf8, ...inlineScripts(html) };
});

/* 화면이 싣는 저장소 안의 파일( <script src="…"> ) — 주소(http://·//·data:)는 아니다 */
function localSrc(pageFile, src) {
  const clean = String(src).split(/[?#]/)[0].trim();
  if (!clean || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean)) return null;
  const p = clean.startsWith('/') ? join(ROOT, clean) : resolve(dirname(pageFile), clean);
  return existsSync(p) ? p : null;
}
for (const pg of pages) {
  pg.ext = [];      /* [{ path, module }] — 화면에 적힌 순서 */
  for (const t of pg.tags) if (t.src !== null && t.kind) { const p = localSrc(pg.f, t.src); if (p && /\.(?:js|mjs)$/i.test(p)) pg.ext.push({ path: p, module: t.kind === 'module' }); }
}
const moduleSrc = new Set(pages.flatMap((pg) => pg.ext.filter((e) => e.module).map((e) => e.path)));
const classicSrc = new Set(pages.flatMap((pg) => pg.ext.filter((e) => !e.module).map((e) => e.path)));
const anyModule = moduleSrc.size > 0 || pages.some((pg) => pg.scripts.some((x) => x.module));

/* ── 읽지 못한 화면 ──────────────────────────────────────────────────────── */
let unreadPages = 0;
for (const pg of pages) {
  if (pg.html.includes('\u0000')) {
    unreadPages++;
    console.error(`✗ ${rel(pg.f)}: NUL 글자가 든 HTML 입니다(UTF-16 으로 저장했거나 이진 파일) — 스크립트를 읽지 못했습니다. UTF-8 로 저장하세요.`);
  } else if (pg.badUtf8) {
    unreadPages++;
    console.error(`✗ ${rel(pg.f)}: UTF-8 이 아닌 글자가 든 HTML 입니다(EUC-KR·CP949·Shift_JIS 로 저장한 것으로 보입니다) — 화면의 글자가 깨집니다. UTF-8 로 저장하세요.`);
  }
  if (pg.swallowed) {
    unreadPages++;
    console.error(`✗ ${rel(pg.f)}:${pg.swallowed} src 가 있는 <script> 가 뒤의 <script> 를 삼켰습니다 — 「/>」 로 닫았거나 </script> 가 빠졌습니다. 브라우저는 다음 </script> 까지를 이 태그의 본문으로 읽고 버립니다(그 사이의 스크립트는 실행되지 않습니다).`);
  }
  if (pg.unclosed) {
    unreadPages++;
    console.error(pg.dbl
      ? `✗ ${rel(pg.f)}:${pg.unclosed} <script> 가 닫히지 않았습니다 — 본문의 「<!--」 뒤에 「<script」 글자가 있어 브라우저가 그 </script> 를 닫는 태그로 읽지 않습니다(이 스크립트는 실행되지 않고 뒤의 스크립트도 삼킵니다). 주석을 「-->」 로 닫았는지 보고, 문자열 안의 글자는 '<!-' + '-' · '<scr' + 'ipt' 로 나누어 적으세요.`
      : `✗ ${rel(pg.f)}:${pg.unclosed} <script> 가 닫히지 않았습니다(닫는 태그 없음) — 브라우저는 이 스크립트를 실행하지 않고, 뒤의 내용도 스크립트 글자로 삼킵니다.`);
  }
}

/* V8 의 문법 오류는 stack 첫 줄이 「파일이름:줄」 이다 — 그 줄 번호(1부터, 모르면 0) */
const errLine = (e) => { const m = /:(\d+)$/.exec(String((e && e.stack) || '').split('\n')[0]); return m ? +m[1] : 0; };
/* ── ① 문법: 인라인 스크립트 ─────────────────────────────────────────────── */
let scripts = 0, errors = 0;
for (const pg of pages) {
  for (const s of pg.scripts) {
    scripts++;
    if (s.module) {        /* type=module — import/export 가 들 수 있어 vm.Script 로는 읽지 못한다 */
      const bad = checkModuleSyntaxAt(s.code);
      if (bad) { errors++; console.error(`✗ ${rel(pg.f)}${bad.line ? ':' + (s.line + bad.line - 1) : ''} (script #${s.idx}, module): ${bad.why}`); } else s.ok = true;
      continue;
    }
    try {
      new vm.Script(s.code, { filename: `${pg.f}#script${s.idx}` });
      s.ok = true;
    } catch (e) {
      errors++;
      const ln = errLine(e);
      console.error(`✗ ${rel(pg.f)}${ln ? ':' + (s.line + ln - 1) : ''} (script #${s.idx}): ${e.message}`);
    }
  }
}

/* ── ① 문법: 스크립트 파일(.js·.mjs·.cjs) ──────────────────────────────────
    인라인만 보다가 saizen-ops.js 의 문법 오류를 놓친 적이 있다
    (SO_HELP 문자열 편집 중 쉼표 하나가 빠져 전 페이지의 상단바·게이트가 죽었다).
    고정 목록이 아니라 저장소의 파일 전부를 본다 — 목록에 없던 shizunoyado/assets/site.js 가 빠져 있었다(2026-11 검수).
      .js       = 브라우저가 <script src> 로 싣는 파일 → 인라인과 같게 vm.Script 로 파싱.
                  import/export 가 든 .js(ESM)는 vm.Script 가 읽지 못하므로 그때만 ESM 으로 다시 본다 —
                  단, 그 파일을 type=module 로 싣는 화면이 있거나 저장소에 모듈 스크립트가 있을 때만이다.
                  일반 <script src> 로만 싣는 공용 파일에 export 한 줄이 들어가면 브라우저는 파일 전체를 거부한다.
      .mjs·.cjs = 노드가 돌리는 파일(scripts 의 검사 스크립트·tests 의 단위테스트). ESM 의 import/export 는
                  vm.Script 가 읽지 못하므로 `node --check` 를 자식 프로세스로 부른다(파싱만, 실행 안 함).
      .ts(엣지 함수 1개)는 보지 않는다. */
const jsFiles = all.filter((p) => /\.(js|mjs|cjs)$/i.test(p));
const MODULE_ONLY_ERR = /outside a module|Unexpected token 'export'|top level bodies of modules/;      /* 일반 스크립트로 읽어서 난 오류(모듈 문법 자체) */
for (const p of jsFiles) {
  if (/\.js$/i.test(p)) {
    const src = readFileSync(p, 'utf8');
    if (moduleSrc.has(p) && !classicSrc.has(p)) {      /* type=module 로만 싣는 파일 — 모듈 문법으로 본다(최상위 await · import.meta · 한 줄로 줄인 export · strict) */
      const bad = checkModuleSyntaxAt(src);
      if (bad) { errors++; console.error(`✗ ${rel(p)}: ${bad.line ? `줄 ${bad.line} — ` : ''}${bad.why}`); }
      continue;
    }
    try { new vm.Script(src, { filename: p }); }
    catch (e) {
      let why = e.message, ln = errLine(e);
      const asModule = checkModuleSyntaxAt(src);
      if (asModule && MODULE_ONLY_ERR.test(e.message)) { why = asModule.why; ln = asModule.line; }      /* 모듈 문법이 든 파일의 진짜 오류 — 일반 스크립트로 읽으면 늘 첫 import/export 줄에서 멈춘다 */
      else if (!asModule) {      /* 일반 스크립트로는 읽지 못하고 모듈로는 읽힌다 */
        ln = 0;
        if (classicSrc.has(p)) why = `일반 <script src> 로 싣는 화면이 있는데 모듈 문법이 들어 있습니다 — 브라우저가 파일 전체를 거부합니다(${e.message})`;
        else if (anyModule) why = '';      /* 다른 모듈이 import 하는 파일일 수 있다 */
        else why = `모듈 문법(import/export 등)이 든 .js 인데 type=module 로 싣는 화면이 없습니다 — 일반 <script src> 로 실으면 브라우저가 파일 전체를 거부합니다(${e.message})`;
      }
      if (why) { errors++; console.error(`✗ ${rel(p)}: ${ln ? `줄 ${ln} — ` : ''}${why}`); }
    }
  } else {
    const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    if (r.status !== 0) {
      errors++;
      const errText = String(r.stderr || (r.error && r.error.message) || '');
      const why = errText.split('\n').filter((l) => /Error/.test(l))[0] || '문법 오류';
      const at = /:(\d+)$/.exec(errText.split('\n')[0] || '');
      console.error(`✗ ${rel(p)}: ${at ? `줄 ${at[1]} — ` : ''}${why.trim()}`);
    }
  }
}

console.log(`검사 대상: HTML ${files.length}개 · 인라인 스크립트 ${scripts}개 · 스크립트 파일 ${jsFiles.length}개`);

/* ── ② 헬퍼 범위 검사 ───────────────────────────────────────────────────── */
//  문법 검사는 통과하지만 실행 시 ReferenceError 로 죽는 부류를 잡는다.
//  실제 사고: room.html 이 esc() 를 정의 없이 호출 → render() 가 중간에 멈추고
//  connect() 의 catch 에 걸려 화면에 「연결 실패」로 표시됨(Supabase 는 정상이었음).
/*  「정의가 파일 어딘가에 있으면 통과」로는 모자랐다(2026-11 검수) — 정의가 한 함수 안의 지역 상수뿐인데
    다른 함수가 부르는 꼴이 두 번 통과했다(정산 화면의 계산서 명세, 홈의 「지금 체류」 띠).
    그래서 호출마다 「그 자리를 감싼 중괄호 범위 안에 정의가 있는가」를 본다.
      정의로 보는 꼴: function 이름( 선언 · const/let/var 선언(쉼표로 이은 `const $=…, esc=…` 와 구조분해 포함)
                     · window.이름 = · globalThis.이름 = · self.이름 = · window['이름'] =(어디서든 전역. ||= · &&= · ??= 포함)
                     · Object.assign(window, { 이름, 이름: 값, 이름(){…} }) 의 키 이름 · 모듈 스크립트의 import 로 들여온 이름(그 스크립트 안)
                     · 그 화면이 <script src> 로 싣는 저장소 안 파일의 최상위 정의·전역 대입(공용 파일로 올린 헬퍼).
                     스크립트 안에 self 를 따로 선언했으면(var self = this) self.이름 = 은 전역 대입이 아니다.
                     객체·클래스의 메서드 `esc(s){…}` 는 정의도 호출도 아니다.
                     이름 붙은 함수 표현식(`const f = function esc(){…}`)의 이름은 그 함수 본문 안에서만 보인다.
      범위: const·let 은 정의가 든 가장 안쪽 { } 와 그 안쪽, function·var 는 정의를 감싼 함수 본문 전체
            (if·try 같은 블록은 건너 올라간다). 최상위 정의는 그 화면의 모든 인라인 스크립트에서 보인다 —
            type=module 스크립트의 최상위 정의만은 그 스크립트 안에서만 보인다.
      보지 못하는 것: 이름이 같은 매개변수(function f(tx){ tx() }), 선언 없이 담은 전역(esc = function(){}),
            호출 없이 넘기기만 하는 참조(arr.map(esc)), 주소(CDN)로 싣는 파일의 정의, 모듈이 다시 내보낸 이름.
            앞의 둘은 올바른 코드를 오류로 알릴 수 있다 — 최상위 선언으로 바꾸면 된다.
    들여쓰기로 최상위를 가리지 않는다 — 화면마다 최상위가 0칸(일반)·2칸(전체를 함수로 감싼 홈)으로 다르고,
    통과했던 지역 상수 하나는 2칸이었다. 대신 원문을 한 번 훑어 중괄호의 짝을 센다(scripts/lib/js-skeleton.mjs 의 skeleton). */
const HELPERS = ['esc', 'tx', 'lang', 'toast'];
/* 뼈대(skeleton) = scripts/lib/js-skeleton.mjs — 주석·문자열을 지우고 글자마다 감싼 블록 번호를 준다 */

/*  선언문 하나(const·let·var 뒤, from 부터)에서 선언되는 이름들을 뼈대에서 읽는다.
    쉼표로 이은 선언(`const $=…, esc=…;`)과 구조분해({ a, b } · [a, b])까지. 선언문의 끝 = 괄호 밖의 `;`,
    감싼 괄호의 닫힘, 또는 줄이 바뀌는데 앞뒤가 연산자·쉼표로 이어지지 않을 때. 애매하면 이어 읽는다(정의를 놓치지 않는 쪽). */
const SPACE = new Set([' ', '\n', '\t', '\r']);
const GLUE_BEFORE = new Set([',', '=', '+', '-', '*', '/', '%', '&', '|', '^', '?', ':', '<', '>', '!', '~', '.']);
const GLUE_AFTER = new Set(['.', ',', '?', ':', '+', '-', '*', '/', '%', '&', '|', '^', '=', '<', '>', '(', '[']);
/* 구조분해 패턴 `{ a, b: c = 기본값, ...d }` 에서 선언되는 이름만 — 기본값 식(= 뒤)과 키 이름(: 앞)은 이름이 아니다 */
function patternNames(pat) {
  let out = '', d = 0, skip = -1;
  for (const c of pat) {
    if (c === '(' || c === '[' || c === '{') d++;
    if (skip >= 0 && (c === ',' || c === '}' || c === ']') && d <= skip) skip = -1;      /* 기본값 식의 끝 */
    if (skip < 0 && c === '=') { skip = d; out += ' '; }
    else out += skip >= 0 ? ' ' : c;
    if (c === ')' || c === ']' || c === '}') d--;
  }
  return [...out.matchAll(/([A-Za-z_$][\w$]*)\s*(:)?/g)].filter((m) => !m[2]).map((m) => m[1]);
}
function declNames(text, from) {
  const names = [], n = text.length;
  let i = from, depth = 0, want = true, last = '';
  while (i < n) {
    const c = text[i];
    if (SPACE.has(c)) {
      if (c === '\n' && depth === 0 && !want && !GLUE_BEFORE.has(last)) {
        let j = i + 1;
        while (j < n && SPACE.has(text[j])) j++;
        if (!GLUE_AFTER.has(text[j])) break;
      }
      i++;
      continue;
    }
    if (want) {
      if (c === '{' || c === '[') {            /* 구조분해 — 닫힐 때까지의 패턴에서 선언되는 이름만(기본값 식·키 이름 제외) */
        let d = 0, j = i;
        do { if (text[j] === '{' || text[j] === '[') d++; else if (text[j] === '}' || text[j] === ']') d--; j++; } while (j < n && d > 0);
        names.push(...patternNames(text.slice(i, j)));
        i = j; want = false; last = '}';
        continue;
      }
      let j = i;
      while (j < n && isId(text[j])) j++;
      if (j === i) break;
      names.push(text.slice(i, j)); i = j; want = false; last = 'a';
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
    else if (depth === 0 && c === ';') break;
    else if (depth === 0 && c === ',') want = true;
    last = c; i++;
  }
  return names;
}
/* 이름( … ) 바로 뒤가 { 이면 호출이 아니라 정의다(function 이름(){} · 객체/클래스의 메서드 이름(){}) */
function isDefHead(text, open) {
  let d = 0, j = open;
  for (; j < text.length; j++) { if (text[j] === '(') d++; else if (text[j] === ')' && --d === 0) break; }
  j++;
  while (j < text.length && SPACE.has(text[j])) j++;
  return text[j] === '{';
}

/* function 이 「식」 자리에 있는가 — 앞이 = ( , : 연산자이거나 return 류 낱말이면 함수 표현식이다(async 는 한 칸 더 앞을 본다) */
const EXPR_BEFORE = new Set(['=', '(', ',', ':', '!', '+', '-', '*', '/', '%', '&', '|', '^', '?', '~', '<', '>', '[']);
const EXPR_WORD = new Set(['return', 'typeof', 'void', 'new', 'await', 'yield', 'case', 'in', 'of', 'throw', 'delete', 'instanceof']);
function isFnExpression(text, pos) {
  let j = pos - 1;
  for (let hop = 0; hop < 2; hop++) {
    let nl = false;
    while (j >= 0 && SPACE.has(text[j])) { if (text[j] === '\n') nl = true; j--; }
    if (j < 0) return false;
    if (nl && j >= 1 && (text[j] === '+' || text[j] === '-') && text[j - 1] === text[j]) return false;      /* i++ ⏎ function f(){} — 앞줄은 끝난 문장이다 */
    if (!isId(text[j])) return EXPR_BEFORE.has(text[j]);
    let k = j; while (k >= 0 && isId(text[k])) k--;
    const word = text.slice(k + 1, j + 1);
    if (word === 'async') { j = k; continue; }
    return EXPR_WORD.has(word);
  }
  return false;
}

/* 뼈대 하나에서 선언문 목록을 뽑아 둔다 */
const prep = (x) => {
  x.decls = [...x.text.matchAll(/(?:^|[^\w.$])(const|let|var)(?=[\s{[])/g)].map((m) => {
    const pos = m.index + m[0].length - m[1].length;
    return { pos, kind: m[1], names: declNames(x.text, pos + m[1].length) };
  });
  /* 그 스크립트가 self 를 따로 선언했는가 — 그러면 self.이름 = 은 전역 대입이 아니다 */
  const own = /(?:^|[^\w$.])(?:var|let|const)\s+self(?![\w$])|[(,]\s*self\s*[,)=]/.test(x.text) ? ['window', 'globalThis'] : ['window', 'globalThis', 'self'];
  /* 전역 객체에 붙인 다른 이름(별칭) — (function (global) { … })(window) · (function (root) { … }(this)) 의 첫 매개변수, const w = window.
     별칭은 「보이는 블록」 안에서만 전역 객체다: IIFE 는 그 본문, 선언은 선언한 블록(최상위면 그 스크립트 전체).
     · 인자는 전역 객체 그 자체여야 한다 — (window.SZ = window.SZ || {}) · (windowManager) · (this.SZ) 는 아니다.
       this 는 일반 스크립트의 최상위에 놓인 IIFE 일 때만(함수·메서드 안의 this, 모듈의 this 는 전역 객체가 아니다).
       typeof 꼴은 typeof window !== 'undefined' ? window : … 만(=== 로 뒤집은 것은 아니다).
     · 그 블록 안에서 같은 이름을 다시 선언·대입했거나 매개변수로 받으면 별칭으로 보지 않는다(오류 쪽으로 넘어진다). */
  const G = own.join('|');
  const GLOBAL_ARG = new RegExp('^\\s*\\)?\\s*\\(\\s*(?:(' + G + ')|(this)|typeof\\s+(' + G + ')\\s*!==?\\s*([\'"`])[^\'"`]*\\4\\s*\\?\\s*\\3\\s*:[^(),?]{1,40})\\s*[,)]');
  const redeclared = (name, a, b, skipA = -1, skipB = -1) => {      /* [a, b) 안에서 그 이름을 다시 선언·대입하거나 매개변수로 받는가([skipA, skipB) 는 별칭의 선언 자신) */
    const N = name.replace(/\$/g, '\\$');
    let seg = x.text.slice(a, b);
    if (skipA >= a && skipB <= b) seg = seg.slice(0, skipA - a) + ' '.repeat(skipB - skipA) + seg.slice(skipB - a);
    return new RegExp('(?<![\\w$.])(?:var|let|const)\\s+(?:[^;=()]*?[,{\\[]\\s*)?' + N + '(?![\\w$])').test(seg)
      || new RegExp('(?<![\\w$.])' + N + '\\s*(?:[-+*/%&|^]|\\*\\*|<<|>>>?|\\|\\||&&|\\?\\?)?=(?!=)').test(seg)
      || new RegExp('(?<![\\w$.])' + N + '\\s*(?:\\+\\+|--)|(?:\\+\\+|--)\\s*' + N + '(?![\\w$])').test(seg)
      || new RegExp('(?:function\\b[^(]*|catch\\s*)\\((?:[^()]*[,\\s{\\[.])?' + N + '(?![\\w$])[^()]*\\)').test(seg)
      || new RegExp('\\((?:[^()]*[,\\s{\\[.])?' + N + '(?![\\w$])[^()]*\\)\\s*=>').test(seg);
  };
  x.aliases = [];      /* [{ name, blk(보이는 블록 번호 — -1 은 그 스크립트 전체), viaThis }] */
  for (const m of x.text.matchAll(/\(\s*function\s*\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g)) {
    const open = x.text.indexOf('{', m.index + m[0].length - 1);
    if (open < 0) continue;
    let d = 0, j = open;
    for (; j < x.text.length; j++) { const c = x.text[j]; if (c === '{') d++; else if (c === '}' && --d === 0) break; }
    const g = GLOBAL_ARG.exec(x.text.slice(j + 1, j + 160));
    if (!g) continue;
    if (g[2] && x.blk[m.index] !== -1) continue;                   /* 함수·메서드·블록 안의 this 는 전역 객체가 아닐 수 있다 */
    if (redeclared(m[1], open + 1, j)) continue;
    x.aliases.push({ name: m[1], blk: x.blk[open + 1], viaThis: !!g[2] });
  }
  for (const m of x.text.matchAll(/(?:^|[^\w$.])(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:window|globalThis)[ \t]*(?:[;,]|\r?\n(?!\s*[.[(])|$)/g)) {
    const at = m.index + m[0].indexOf(m[1], m[0].search(/var|let|const/) + 3);
    if (redeclared(m[1], 0, x.text.length, m.index, m.index + m[0].length)) continue;      /* 다시 대입했거나( w = {} ) 같은 이름의 매개변수가 있다 */
    x.aliases.push({ name: m[1], blk: x.blk[at], viaThis: false });
  }
  x.base = own;
  x.owners = [...new Set([...own, ...x.aliases.map((a) => a.name)])].map((s) => s.replace(/\$/g, '\\$')).join('|');
  return x;
};
/* 그 자리의 이름이 전역 객체인가 — window·globalThis·self 는 어디서나, 별칭은 보이는 블록 안에서만(모듈에서 this 로 받은 별칭은 아니다) */
function ownerAt(x, name, at, isModule) {
  if (x.base.includes(name)) return true;
  for (const a of x.aliases) {
    if (a.name !== name || (a.viaThis && isModule)) continue;
    if (a.blk === -1) return true;
    for (let b = x.blk[at]; b !== undefined && b !== -1; b = x.parent[b]) if (b === a.blk) return true;
  }
  return false;
}
/* 스크립트 하나(뼈대 x · 원문 code)에서 name 의 정의를 찾는다 → { global, local:[블록 번호 — -1 은 그 스크립트의 최상위(모듈)] } */
function defsOf(x, code, isModule, name) {
  let global = false;
  const local = [];
  /* 전역 대입 — 문자열 글자(window['이름'])가 들 수 있어 원문에서 찾고, 시작 자리가 코드인지 확인한다 */
  const winRe = new RegExp(`(?:^|[^\\w$.])(${x.owners})\\s*(?:\\.\\s*${name}(?![\\w$])|\\[\\s*(['"\`])${name}\\2\\s*\\])\\s*(?:\\|\\||&&|\\?\\?)?=(?!=)`, 'g');
  for (const m of code.matchAll(winRe)) { const at = m.index + m[0].indexOf(m[1]); if (x.kind[at] === CODE && ownerAt(x, m[1], at, isModule)) global = true; }
  /* Object.assign(window, { esc, tx: (k) => k, toast(m){ … } }) — 객체의 맨 바깥 쉼표로 나눈 토막마다 첫 이름(키) */
  for (const m of x.text.matchAll(new RegExp(`Object\\s*\\.\\s*assign\\s*\\(\\s*(${x.owners})\\s*,\\s*\\{`, 'g'))) {
    if (!ownerAt(x, m[1], m.index + m[0].lastIndexOf(m[1]), isModule)) continue;
    const open = m.index + m[0].length - 1;
    const keyOf = (a, b) => (/^\s*(?:async\s+(?=[A-Za-z_$*]))?\*?\s*([A-Za-z_$][\w$]*)/.exec(x.text.slice(a, b)) || [])[1];
    let d = 0, start = open + 1;
    for (let j = open; j < x.text.length; j++) {
      const c = x.text[j];
      if (c === '{' || c === '(' || c === '[') d++;
      else if (c === '}' || c === ')' || c === ']') { if (--d === 0) { if (keyOf(start, j) === name) global = true; break; } }
      else if (c === ',' && d === 1) { if (keyOf(start, j) === name) global = true; start = j + 1; }
    }
  }
  const add = (pos, hoist) => {
    let b = x.blk[pos];
    if (hoist) while (b !== -1 && !x.isFn[b]) b = x.parent[b];   /* function·var 는 함수 범위로 올라간다 */
    if (b === -1 && !isModule) global = true; else local.push(b);
  };
  const fnRe = new RegExp(`(?:^|[^\\w.$])(function\\s*\\*?\\s*${name}\\s*\\()`, 'g');
  for (const m of x.text.matchAll(fnRe)) {
    const pos = m.index + m[0].length - m[1].length;
    if (isFnExpression(x.text, pos)) {       /* 이름 붙은 함수 표현식 — 이름은 자기 본문 안에서만 보인다 */
      let d = 0, j = m.index + m[0].length - 1;
      for (; j < x.text.length; j++) { if (x.text[j] === '(') d++; else if (x.text[j] === ')' && --d === 0) break; }
      const brace = x.text.indexOf('{', j);
      if (brace >= 0 && brace + 1 < x.text.length && x.blk[brace + 1] !== x.blk[brace]) local.push(x.blk[brace + 1]);
      continue;
    }
    add(pos, true);
  }
  for (const d of x.decls) if (d.names.includes(name)) add(d.pos, d.kind === 'var');
  if (isModule) {      /* import esc from … · import { a, esc as e } from … · import * as ns from … — 그 스크립트의 최상위 이름 */
    for (const m of x.text.matchAll(/(?:^|[^\w$.])import\s*([^'"`;()]*?)\s*from(?![\w$])/g)) {
      const clause = m[1], names = [];
      const def = /^\s*([A-Za-z_$][\w$]*)/.exec(clause); if (def) names.push(def[1]);
      const ns = /\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(clause); if (ns) names.push(ns[1]);
      const braces = /\{([^}]*)\}/.exec(clause);
      if (braces) for (const part of braces[1].split(',')) { const a = /([A-Za-z_$][\w$]*)\s*$/.exec(part.trim()); if (a) names.push(a[1]); }
      if (names.includes(name)) local.push(-1);
    }
  }
  return { global, local };
}
/* 화면이 싣는 저장소 안 파일의 뼈대(파일마다 한 번) */
const extCache = new Map();
function extSkeleton(e) {
  const key = e.path + (e.module ? '#m' : '');
  if (!extCache.has(key)) {
    const code = readFileSync(e.path, 'utf8');
    const x = skeleton(code, { module: e.module });
    extCache.set(key, x.ok ? { ...prep(x), code } : x);
  }
  return extCache.get(key);
}

let undef = 0, unread = 0;
for (const pg of pages) {
  if (!pg.scripts.length) continue;
  /* 문법 오류가 있는 스크립트는 ①이 이미 알렸다(그 화면의 헬퍼 범위는 문법을 고친 뒤에 본다) */
  if (pg.scripts.some((s) => !s.ok)) continue;
  const sk = pg.scripts.map((s) => skeleton(s.code, { module: s.module }));
  const badAt = sk.findIndex((x) => !x.ok);
  if (badAt >= 0) {
    /* 옛 기준(「정의가 어딘가 있으면 통과」)으로 물러나지 않는다 — 그 기준이 결함 두 건을 통과시켰다 */
    unread++;
    const s = pg.scripts[badAt], ln = failLine(sk[badAt], s.code);
    console.error(`✗ ${rel(pg.f)}:${ln ? s.line + ln - 1 : s.line} (script #${s.idx}) 헬퍼 범위를 따지지 못했습니다 — ${sk[badAt].why}. 문법은 맞는데 이 검사의 읽기가 그 줄을 따라가지 못했습니다 — 그 줄의 정규식·나눗셈을 변수로 나누어 적으세요.`);
    continue;
  }
  sk.forEach(prep);
  /* 화면이 싣는 저장소 안 파일 — 최상위 정의·전역 대입은 이 화면의 전역이다(모듈 파일의 최상위는 아니다) */
  const ext = pg.ext.map((e) => ({ e, x: extSkeleton(e) }));
  for (const name of HELPERS) {
    const callRe = new RegExp(`(?:^|[^\\w.$])${name}\\s*\\(`, 'g');
    let global = false, calls = 0;
    const local = [];               /* 지역 정의: {k(몇 번째 스크립트), b(블록 번호. -1 = 그 스크립트의 최상위 — 모듈 스크립트)} */
    sk.forEach((x, k) => {
      const d = defsOf(x, pg.scripts[k].code, pg.scripts[k].module, name);
      if (d.global) global = true;
      for (const b of d.local) local.push({ k, b });
    });
    for (const { e, x } of ext) if (x.ok && defsOf(x, x.code, e.module, name).global) global = true;
    const out = [];                 /* 정의가 보이지 않는 호출의 줄 번호 */
    sk.forEach((x, k) => {
      for (const m of x.text.matchAll(callRe)) {
        if (isDefHead(x.text, m.index + m[0].length - 1)) continue;
        calls++;
        if (global) continue;
        const pos = m.index + m[0].indexOf(name);
        let seen = local.some((d) => d.k === k && d.b === -1);
        for (let b = x.blk[pos]; b !== -1 && !seen; b = x.parent[b]) seen = local.some((d) => d.k === k && d.b === b);
        if (!seen) out.push(lineOf(pg.scripts[k], pos));
      }
    });
    if (!calls || !out.length) continue;
    undef++;
    const lines = `줄 ${out.slice(0, 6).join(', ')}${out.length > 6 ? ` 외 ${out.length - 6}곳` : ''}`;
    const unreadExt = ext.filter(({ x }) => !x.ok).map(({ e }) => rel(e.path));
    if (!local.length) console.error(`✗ ${rel(pg.f)}: ${name}() 를 호출하는데 정의가 없습니다 — ${lines}(실행 시 ReferenceError).${unreadExt.length ? ` 이 화면이 싣는 ${unreadExt.join(' · ')} 은(는) 읽지 못해 그 안의 정의를 보지 못했습니다.` : ''}`);
    else if (local.every((d) => d.b === -1)) console.error(`✗ ${rel(pg.f)}: ${name}() 의 정의가 다른 type=module 스크립트의 최상위에 있습니다 — ${lines} 의 호출에서는 보이지 않습니다(실행 시 ReferenceError). 모듈의 최상위 이름은 그 스크립트 밖에서 보이지 않습니다 — window.${name} = 으로 내보내거나 일반 스크립트에 두세요.`);
    else console.error(`✗ ${rel(pg.f)}: ${name}() 의 정의가 다른 함수 안에만 있습니다 — ${lines} 의 호출에서는 보이지 않습니다(실행 시 ReferenceError). 정의를 최상위로 올리세요.`);
  }
}

/* ── ③ 여러 줄 객체 리터럴 첫 줄의 //주석 검사 ───────────────────────────── */
//  문법은 멀쩡한데 **그 줄 뒤의 속성이 통째로 주석 처리**되는 부류를 잡는다.
//  실제 사고: pos.html 의 `let state={ …, grp:null,  // 설명  team:null, cart:[], … }`
//    → cart 가 사라져 renderCart 가 죽고 화면엔 「연결 실패」로만 보였다(2026-08).
//  판정: `let/const/var 이름 = {` 로 시작하는 줄에 //주석이 있고, 그 줄에서 { 가 닫히지 않았으며,
//        주석 글 안에 삼켜진 코드로 보이는 것( 이름: · 닫는 } ] )이 있으면 오류.
//        `const state = {   // 화면 상태` 처럼 설명만 적은 주석은 삼킨 것이 없다(속성은 다음 줄부터).
const SWALLOWED_PROP = /(?<![\w$])[A-Za-z_$][\w$]{0,40}\s*:(?!\/\/)[^:]*?,\s*(?:[A-Za-z_$][\w$]{0,40}\s*:(?!\/\/)|$)/;      /* 낱말 길이를 한정한다 — 긴 줄에서 2차 시간이 되지 않게 */
let midline = 0;
for (const pg of pages) {
  for (const s of pg.scripts) {
    s.code.split('\n').forEach((line, i) => {
      if (!/^\s*(const|let|var)\s+[\w$]+\s*=\s*[{[]/.test(line)) return;
      //  문자열 리터럴을 먼저 지우고 본다 — 값 안의 // 나 괄호에 속지 않게.
      const bare = line
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/`(?:[^`\\]|\\.)*`/g, '``');
      const cut = bare.indexOf('//');
      if (cut < 0) return;
      const head = bare.slice(0, cut);                 /* 주석 안의 } 는 세지 않는다 */
      const opens = (head.match(/[{[]/g) || []).length;
      const closes = (head.match(/[}\]]/g) || []).length;
      const tail = bare.slice(cut + 2);
      /* 삼켜진 코드로 보는 것: 닫는 } ] · 「이름: 값,」 뒤에 또 「이름:」 이 오거나 줄이 끝나는 글(값에 빈칸이 들어도 — new Set() · a + b · () => 1).
         「TODO: 임시, 나중에 지운다」·「참고 https://example.com/a, 표 2」·「open 10:30, close 13:30」·「key = class:rate (…)」 같은 설명은 아니다 */
      if (opens > closes && (/[}\]]/.test(tail) || SWALLOWED_PROP.test(tail))) {
        midline++;
        console.error(`✗ ${rel(pg.f)}:${s.line + i} 여러 줄 객체 첫 줄의 //주석 안에 속성으로 보이는 글자가 있습니다 — 그 줄의 뒤쪽이 통째로 주석 처리된 것일 수 있습니다(주석은 윗줄로).`);
        console.error(`   ${line.trim().slice(0, 110)}`);
      }
    });
  }
}

/* ── ④ 정적 HTML 의 on*= 핸들러 문법 검사 ─────────────────────────────────
    ①은 <script> 본문만 읽는다 — onclick="…" 속성 값은 브라우저가 누를 때 처음 컴파일하므로, 괄호 하나가
    빠져도 그 버튼을 누르기 전까지 드러나지 않는다. 속성 값을 함수 본문으로 감싸 파싱만 한다(이름이 있는지는 보지 않는다).
    보는 범위: <script>·<style>·<textarea>·<title>·주석 밖의 태그에 적힌 이벤트 속성(onclick·onchange … 알려진 이름만 —
    once="…" 같은 다른 속성은 핸들러가 아니다).
    <script> 안의 문자열·템플릿으로 만드는 핸들러는 보지 않는다 — `${…}` 가 끼거나 문자열을 이어 붙인 값은
    완성된 코드가 아니어서 오탐이 난다. */
/* 속성 값의 문자 참조(&quot; · &#39; · 세미콜론 없는 &lt …)는 lib/html-entities.mjs 의 decodeAttr 가 브라우저 규칙대로 푼다.
   표에 없는 「&b;」 는 브라우저에서도 글자 그대로다( ready=a&&b;go() 는 올바른 코드) — 오류로 올리지 않는다. */
const EVENTS = new Set(('abort afterprint animationcancel animationend animationiteration animationstart auxclick beforeinput beforematch beforeprint beforetoggle beforeunload begin blur cancel canplay canplaythrough change click close command contextlost contextmenu contextrestored copy cuechange cut dblclick drag dragend dragenter dragleave dragover dragstart drop durationchange emptied end ended error focus focusin focusout formdata fullscreenchange fullscreenerror gotpointercapture hashchange input invalid keydown keypress keyup languagechange load loadeddata loadedmetadata loadstart lostpointercapture message messageerror mousedown mouseenter mouseleave mousemove mouseout mouseover mouseup mousewheel offline online pagehide pagereveal pageshow pageswap paste pause play playing pointercancel pointerdown pointerenter pointerleave pointermove pointerout pointerover pointerrawupdate pointerup popstate progress ratechange rejectionhandled repeat reset resize scroll scrollend scrollsnapchange scrollsnapchanging search securitypolicyviolation seeked seeking select selectionchange selectstart slotchange stalled storage submit suspend timeupdate toggle touchcancel touchend touchmove touchstart transitioncancel transitionend transitionrun transitionstart unhandledrejection unload volumechange waiting webkitanimationend webkitanimationiteration webkitanimationstart webkittransitionend wheel').split(' '));
const blank = (s) => s.replace(/[^\n]/g, ' ');
let handlers = 0, badHandlers = 0;
const unknownOn = new Map();      /* 알려진 이벤트 이름이 아닌 on… 속성(값이 있는 것) — 검사하지 않았다고 알린다 */
for (const pg of pages) {
  const markup = blankHtmlComments(pg.html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, blank)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, blank)
    .replace(/<(textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, blank);      /* 그 안의 글자는 태그가 아니다 */
  for (const tag of markup.matchAll(/<[a-zA-Z][^\s<>\/]*((?:"[^"]*"|'[^']*'|[^<>"'])*)>/g)) {
    const attrsAt = tag.index + tag[0].length - 1 - tag[1].length;
    for (const a of tag[1].matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      if (!/^on[a-z]+$/i.test(a[1])) continue;
      const rawVal = a[2] ?? a[3] ?? a[4];      /* 따옴표 없는 값은 빈칸·> 앞까지(onclick=go('a')) */
      if (rawVal === undefined) continue;
      if (!EVENTS.has(a[1].slice(2).toLowerCase())) { const k = a[1].toLowerCase(); unknownOn.set(k, (unknownOn.get(k) || 0) + 1); continue; }
      const code = decodeAttr(rawVal);
      handlers++;
      try { new vm.Script(`(function(event){${code}\n})`); }
      catch (e) {
        badHandlers++;
        console.error(`✗ ${rel(pg.f)}:${pg.html.slice(0, attrsAt + a.index).split('\n').length} ${a[1]}="${rawVal.slice(0, 80)}" — ${e.message}`);
      }
    }
  }
}

/* ── ⑤ HEX 폴백 검사 ───────────────────────────────────────────────────── */
//  규칙(CLAUDE.md §8): CSS 변수만 사용, HEX 폴백 금지 — var(--accent,#3d5424) ✗ → var(--accent) ✓.
//  공용 파일은 :root 가 값을 주므로 폴백이 쓰이지 않는데, 같은 변수에 서로 다른 폴백 값이 70곳에 흩어져 있었다(2026-11 검수).
//  설명서 본문(SO_HELP·SO_HELP_TR 줄)은 보지 않는다.
/*  ops 아래 화면(.html)도 본다 — 화면 10개에 40곳이 남아 있었고, 그중 12곳은 그 화면에 정의가 없는 변수라
    폴백 색이 실제로 보이는 색이었다(변수처럼 보이지만 값은 그 줄에만 있었다). 화면에서 새 이름을 쓰려면
    그 화면 :root 에 먼저 정의한다. 색이 아닌 기본값(var(--fs,1) 같은 크기·개수)은 이 검사와 무관하다. */
/*  파일 전체를 한 번에 본다 — var( 에서 짝이 맞는 ) 까지를 뽑아 첫 쉼표 뒤(폴백)에 색이 있는지 본다.
      색 = #hex · 색 함수(rgb·hsl·hwb·lab·lch·oklab·oklch·color·color-mix) · CSS 색 이름(148개)·transparent·currentcolor.
      폴백이 다음 줄로 넘어가거나, 여러 값이 섞이거나( var(--bd, 1px solid #ccc) · var(--g, linear-gradient(#fff,#eee)) ) 잡힌다.
      폴백 안에 또 var( ) 가 있으면( var(--a, var(--b, #123)) ) 색이 든 안쪽 것만 한 번 센다.
    대상 = ops 아래의 .html·.htm·.css·.js·.mjs 전부(하위 폴더 포함).
    주석 안의 예시( 규칙: var(--accent,#3d5424) 처럼 쓰지 않는다 )는 보지 않는다 — CSS 주석·HTML 주석·스크립트 주석을 지우고 본다.
    색이 아닌 기본값(var(--fs,1) · var(--mono,monospace) · var(--gap,0 auto))은 무관하다. 일부러 두는 예외는 없다(transparent 도 폴백으로 본다).
    보지 못하는 것: 문자열을 이어 붙여 만든 폴백, ops 밖의 파일. */
const COLOR_NAMES = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent currentcolor';
const COLOR_RE = new RegExp('#[0-9a-f]{3,8}(?![\\w-])|(?<![\\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\\s*\\(|(?<![\\w-])(?:' + COLOR_NAMES.split(' ').join('|') + ')(?![\\w-]|\\s*\\()', 'i');      /* tan( 은 색 이름이 아니라 수학 함수다 */
const blankCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, blank);
/* 주석을 빈칸으로 바꾼 글(길이·줄 수 유지) — 파일 종류마다 */
function withoutComments(p, src) {
  if (/\.css$/i.test(p)) return blankCss(src);
  const blankJs = (code, module) => { let x = skeleton(code, { module }); if (!x.ok) x = skeleton(code, { module: !module }); if (!x.ok) return code; let o = ''; for (let i = 0; i < code.length; i++) o += x.kind[i] === COMMENT && code[i] !== '\n' ? ' ' : code[i]; return o; };
  if (/\.m?js$/i.test(p)) return blankJs(src, /\.mjs$/i.test(p));
  let html = blankHtmlComments(src);
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (m, a, b, c) => a + blankCss(b) + c);
  const { list } = scriptsOf(html);
  let out = '', at = 0;
  for (const t of list) { if (t.src !== null || !t.kind) continue; out += html.slice(at, t.base) + blankJs(t.code, t.kind === 'module'); at = t.base + t.code.length; }
  return out + html.slice(at);
}
/* var(--이름, 폴백) 가운데 폴백에 색이 든 것 — [{ at, text }] */
function colorFallbacks(text) {
  const out = [];
  for (const m of text.matchAll(/var\(\s*--/gi)) {
    let i = m.index + 4, d = 1, comma = -1;
    for (; i < text.length && d > 0 && i - m.index < 600; i++) {
      const c = text[i];
      if (c === '(') d++; else if (c === ')') d--; else if (c === ',' && d === 1 && comma < 0) comma = i;
    }
    if (d !== 0 || comma < 0) continue;
    let fb = text.slice(comma + 1, i - 1).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, ' ');      /* 따옴표 안의 글꼴 이름은 색이 아니다 */
    /* 폴백 안의 var( … ) 는 그 var 가 따로 잡힌다 — 바깥에서 한 번 더 세지 않는다( var(--a, var(--b, #123)) = 1건 ) */
    for (let k = fb.search(/var\(/i); k >= 0; k = fb.search(/var\(/i)) {
      let e = k + 4, dd = 1;
      for (; e < fb.length && dd > 0; e++) { if (fb[e] === '(') dd++; else if (fb[e] === ')') dd--; }
      fb = fb.slice(0, k) + ' ' + fb.slice(e);
    }
    fb = fb.replace(/url\([^)]*\)/gi, ' ');      /* url(#fade) · url(img/red.png) 의 글자는 색이 아니다 */
    if (COLOR_RE.test(fb)) out.push({ at: m.index, text: text.slice(m.index, i) });
  }
  return out;
}
const hexFiles = all.filter((p) => { const r = rel(p); return r.startsWith('ops/') && /\.(html?|css|js|mjs)$/i.test(r); });
let hexfb = 0;
for (const p of hexFiles) {
  const help = rel(p) === 'ops/assets/saizen-ops.js';
  const raw = readFileSync(p, 'utf8');
  const src = withoutComments(p, raw);
  for (const m of colorFallbacks(src)) {
    const ls = raw.lastIndexOf('\n', m.at) + 1, le = raw.indexOf('\n', m.at);
    const line = raw.slice(ls, le < 0 ? raw.length : le);
    if (help && (/^\s*'[a-z_0-9]+\.html':/.test(line) || line.startsWith('  var SO_HELP_TR = '))) continue;
    hexfb++;
    console.error(`✗ ${rel(p)}:${raw.slice(0, m.at).split('\n').length} 색 폴백 ${m.text.replace(/\s+/g, ' ').slice(0, 90)} — var(--이름) 만 씁니다.`);
  }
}

if (unknownOn.size) console.log(`· 검사하지 않은 on… 속성 ${[...unknownOn.values()].reduce((a, b) => a + b, 0)}곳(알려진 이벤트 이름이 아님): ${[...unknownOn.keys()].sort().join(' · ')}`);
if (errors || undef || unread || unreadPages || midline || badHandlers || hexfb) {
  if (errors) console.error(`\n✗ 문법 오류 ${errors}건 — 위 위치를 확인하세요.`);
  if (unreadPages) console.error(`✗ 읽지 못한 화면 ${unreadPages}건 — 검사하지 못한 것은 통과가 아닙니다.`);
  if (undef) console.error(`✗ 헬퍼 정의가 보이지 않는 호출 ${undef}건 — 위 파일에서 정의를 최상위에 두세요.`);
  if (unread) console.error(`✗ 헬퍼 범위를 따지지 못한 화면 ${unread}개 — 검사하지 못한 것은 통과가 아닙니다.`);
  if (midline) console.error(`✗ 주석에 먹힌 속성 ${midline}건 — 주석을 윗줄로 올리세요.`);
  if (badHandlers) console.error(`✗ on*= 핸들러 오류 ${badHandlers}건 — 위 속성 값을 확인하세요.`);
  if (hexfb) console.error(`✗ 색(HEX 등) 폴백 ${hexfb}건 — var(--이름) 만 씁니다(없는 이름이면 그 화면 :root 에 정의. 인쇄 팝업처럼 :root 가 없는 문서에서는 색을 직접 적는다).`);
  process.exitCode = 1;
} else console.log(`✓ 문법(인라인·스크립트 파일) · 헬퍼 범위 · 주석에 먹힌 속성 · on*= 핸들러 ${handlers}곳 · HEX 폴백(ops 아래 파일 ${hexFiles.length}개) 확인`);
