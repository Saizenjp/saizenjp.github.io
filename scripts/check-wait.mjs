#!/usr/bin/env node
/*
  대기 예약 누락 검사 — 「대기」 예약이 현장·인쇄·청구·통계에 새어 들어가지 않는지.

  왜 있나: 엠클릭 구분 「대기」는 메리트투어가 만실이어도 받아 두는 예약이고,
  **출국 전까지 정리되는** 예약이라 현장에 오지 않는다. 그런데 2026-09 검수에서
  現地精算表(B2B 청구)·경영 통계·프론트 데스크·인쇄물 등 15페이지 25곳이
  그대로 세고 있었다(10월 B2B 청구에도 대기 팀이 얹혀 있었다). 손으로 고치면 한 곳은 빠진다 —
  그래서 bookings 를 읽는 자리마다 대기를 빼는 필터가 있는지 기계가 본다.

  대상: ops/ 아래의 .html(인라인 스크립트)과 .js(공용 스크립트). .mjs·.ts(엣지 함수)·.htm 과 ops 밖의 파일은 보지 않는다.
        표는 bookings 와 partner_bookings(자회사 상품 원장, 159).
  실행: node scripts/check-wait.mjs          (검사한 자리를 다 보려면 뒤에 --list)

  읽는 방법: 스크립트를 한 번 훑어 글자마다 코드·문자열·주석을 가린 뒤(scripts/lib/js-skeleton.mjs) 본다.
            주석 안의 예시 코드, 설명서 문장 안의 낱말은 조회가 아니다.
            읽지 못한 것은 통과가 아니라 오류다 — 뼈대를 만들지 못한 스크립트, 닫는 태그가 없는 <script>,
            NUL 이 든 파일(UTF-16 으로 저장한 화면). 브라우저가 실행하는 인라인 스크립트만 본다
            (type 없음·module·옛 JS MIME. JSON·importmap·템플릿 블록과 src 가 있는 태그의 본문은 아니다).

  찾는 자리
   ① 표 이름 글자('bookings' · "partner_bookings" · `bookings` · `${접두}bookings`)가 든 호출
        글자는 값으로 읽는다 — 이스케이프('book\u0069ngs')는 풀고, 글자끼리 이어 붙인 것('book'+'ings')은 이어서 본다.
        from('bookings') · from(조건 ? 'partner_bookings' : 'bookings')            → 직접 조회
        pagedIn('bookings', …) · loadAll(supa, 'bookings', …) 처럼 표 이름을 넘기는 호출 → 헬퍼 호출
        (.eq('entity','bookings') 처럼 조회 조건 메서드의 값으로 온 글자는 조회가 아니다)
   ② 호출 밖의 표 이름 글자 — const T='bookings' · {table:'bookings'} · ['bookings', …] · '/rest/v1/bookings?…'
        · REST + 'bookings?select=…' (기준 주소 변수 뒤에 붙는, 표 이름으로 시작해 ? 로 이어지는 글자)
        변수·객체·배열에 담은 표 이름은 이 검사가 따라가지 못한다. 그래서 담은 자리에 사유 주석을 요구한다.
   ③ 임베드 — select 문자열 안의 bookings!inner(…) · bookings(…) · b:bookings!left(…) · "bookings"!inner(…) (빈칸·여러 줄 포함)
        임베드로 보는 꼴: 표 이름 앞이 목록의 경계(글자 머리 · 쉼표 · 콜론 · 여는 괄호)이고, 괄호 안이 열 목록 꼴
        (낱말·쉼표·수식어뿐 — 「imported bookings (via step1)」 같은 문장은 아니다).
        수식어가 보간·변수에 있는 꼴( `…, bookings${X}(…)` · '…, bookings' + X + '(…)' )은 inner 인지 알 수 없어 사유 주석으로만 통과한다.
        .select( ) 가 아닌 호출에 넘긴 select 문자열( loadAll(supa,'guests','…bookings!inner(…)') )도 사유 주석으로만 통과한다.
        중첩 임베드( guest_members!inner(id, bookings!inner(…)) )는 필터로 통과하지 않는다 — 전체 경로 필터는 이 검사가 읽지 못하고,
        표 이름만 적은 'bookings.status' 는 안쪽 임베드를 가리키지 못한다. 사유 주석으로 적는다.
   ④ ③을 변수에 담아 둔 select — const GSEL='…bookings!inner(…)' 를 쓰는 모든 자리
        · 보이는 범위: const·let·var 로 선언한 것은 그 함수 안(최상위면 그 화면의 모든 스크립트),
          선언 없이 담은 것·window.이름 은 전역(공용 스크립트에 있으면 모든 화면). 다른 변수로 옮긴 것( sel = GSEL )도 따라간다.
        · 이름이 같은 매개변수·지역 변수( function load(table, cols){ … } )는 그 변수가 아니다. 값 없는 선언( let sel; )은 쓰는 자리가 아니다.
          가리는 범위는 그 함수·화살표의 본문까지다 — 이미 닫힌 앞 줄의 화살표, 객체·배열의 앞 원소인 화살표, 매개변수 기본값 식에 나온 이름은 가리지 않는다.
        · 호출 밖에서 쓰면( return sel · [a, sel] · 조건 ? a : sel · 조건 ? 'x,' + sel : b ) 더 따라가지 못한다 → 그 자리에 사유 주석을 요구한다.
          클래스 필드·객체 속성에 담은 select 는 담은 자리에서 사유 주석을 요구한다.

  판정 — 그 조회의 「메서드 체인」 하나만 본다( supa.from('bookings').select(…).lte(…) 처럼 점으로 이어진 호출들 )
   · 필터: .neq('status','대기')            — 직접 조회
           .neq('bookings.status','대기')   — 임베드(!inner 일 때만. inner 가 아니면 부모 행은 걸러지지 않는다)
     필터는 그 체인의 맨 바깥 호출이어야 한다 — 인자 안의 다른 조회( .in('event_seq', (await 다른조회.neq('status','대기')).data) )나
     콜백 안의 .neq 는 이 조회의 필터가 아니다. 인자 사이에 주석이 끼어도 필터로 읽는다.
     헬퍼 호출은 필터로 통과하지 않는다 — 헬퍼가 넘겨받은 필터를 실제로 쓰는지 이 검사는 모른다(인자를 무시하는 헬퍼가 많다). 사유 주석으로 적는다.
     '대기' 글자가 있다는 것만으로는 통과하지 않는다(.eq('status','대기') 는 대기만 읽는 것이다).
     다른 꼴(.not(…) · .or(…) · .eq('status','확정') · 나중에 붙이는 q=q.neq(…) · 받은 뒤 화면에서 거름)은 사유 주석으로 적는다.
   · 사유 주석: 블록 주석  대기 포함: 이유  /  대기 제외: 이유  /  대기 무관: 이유  (앞뒤에 주석 기호)
       포함 = 일부러 읽는다 · 제외 = 다른 방법으로 뺀다(화면에서 거름, 앞 조회가 이미 뺀 목록) · 무관 = 조회가 아니다
       자리: 체인 안(인자 사이 포함) 또는 체인이 끝난 바로 뒤 같은 줄(닫는 괄호 뒤 포함).
       윗줄의 주석, ; 뒤의 주석, 아랫줄의 주석, .then( 뒤의 주석은 세지 않는다.
   · 체인의 끝: 점으로 이어지지 않는 첫 글자( ; , ) : || 등 ). .then( · .catch( · .finally( 앞, 줄이 바뀐 뒤의 괄호 앞에서도 끝난다 —
       삼항의 다른 가지, || 뒤의 다른 조회, 콜백 안의 다른 조회에 있는 필터는 이 조회의 필터가 아니다.

  쓰기는 대상이 아니다: from(…) 바로 뒤가 insert·upsert·update·delete 면 쓰기다(뒤에 select 가 붙어도 쓴 행을 돌려받는 것).
   표 이름을 넘기는 헬퍼 호출은 쓰기인지 따지지 않는다 — 쓰기 전용이면 그 호출에 「대기 무관: 쓰기」 주석을 적는다.

  허용(대기를 봐야 하는 자리)
   · step1.html   — 엠클릭 원본을 그대로 적재한다(대기도 저장해야 확정으로 바뀔 때 잡힌다)
   · room.html    — 방배정은 확정 전 대기 팀을 챙기는 자리(「대기예약」 배지, 자동배정 제외)
   · audit.html   — 검수는 전체를 본다
   · 등록 현황 — 데이터가 들어왔는지 보는 것이라 대기도 센다. 아래 꼴일 때만(판정 = 「허용 문장」):
       from(…).select('session_ym') 하나만 읽고, 붙은 호출이 order·range·limit 이거나 session_ym 에 거는 조건뿐
       (다른 열을 읽거나 다른 조건이 붙으면 「그날 팀 수」 같은 숫자가 된다 → 필터나 사유 주석).
       임베드는 select('…, bookings!inner(session_ym)', {head:true}) 로 건수만 묻고 조건이 bookings.session_ym 에만 걸린 것.
       둘 다 「그 자리에서 끝나는 조회」여야 한다 — 바로 await 하거나, .then( 으로 바로 받거나, Promise.all([ … ]) 의 원소.
       변수에 담아 둔 조회( const q = …select('session_ym'); … q.eq('dep_date', 오늘) )는 뒤에서 조건이 붙을 수 있어 허용이 아니다.
   · 연결·열 확인 — from(…).select(…, {head:true}) 뒤에 limit 말고 아무것도 붙지 않고, 그 자리에서 await 하며,
     받은 값에서 error 말고는 꺼내 쓰지 않는 조회(행도 건수도 쓰지 않는다):
       const { error } = await …  ·  const r = await … 뒤에 r 을 r.error 로만 쓴다  ·  (await …).error  ·  값을 받지 않는 await …;
     조건이 붙은 건수 조회, { count }·{ data }·...rest 로 받는 조회, r.count 를 쓰는 조회, 변수에 담아 둔 조회,
     return·호출 인자·속성( state.x = await … )으로 넘긴 조회, await ….then(r => r.count) 는 숫자로 쓰일 수 있으므로 필터나 사유 주석이 있어야 한다.

  이 검사가 보지 못하는 것
   · 변수로 조립한 표 이름( T1+T2 · [..].join('') · 'book,ings'.split(',').join('') · String.fromCharCode(…) ),
     함수 매개변수로 받은 select 문자열
     (글자끼리 이어 붙인 것과 「변수 + 표 이름 글자」는 본다. from 을 다른 이름에 담아 부르면 「표 이름을 넘기는 호출」로 잡혀 사유 주석을 요구한다)
   · 조건에 따라 필터를 붙이는 코드(체인의 맨 바깥 호출에 필터가 있으면 통과한다),
     괄호로 묶은 조회에 붙인 필터( (supa.from('bookings').select('a')).neq(…) — 사유 주석으로 적는다)
   · 표 이름 글자가 없는 임베드 — FK 열 이름·제약 이름만으로 적은 것( bk:event_seq(dep_date, …) )
   · 연쇄 대입으로 옮긴 select 변수( a = b = GSEL ), 사유 주석이 안쪽 헬퍼 호출에 붙었는데 바깥 조회까지 통과시키는 꼴
     (사유 주석은 체인 안 어디에 있어도 그 체인의 사유로 읽는다 — 사람이 적은 것이라 그대로 믿는다)
   · 문법은 맞지만 뼈대가 따라가지 못하는 드문 꼴( } 바로 뒤의 나눗셈 등)이 든 스크립트 — 조용히 넘어가지 않고 「읽지 못함」 오류로 알린다
   · .mjs·.ts·.htm, ops 밖의 파일
   · RPC·뷰 안의 SQL, 엣지 함수(.ts). 대기 예약에 방·청구·계산서·카트가 붙은 것은
     검수 화면(data_audit)의 wait_leak 항목이 본다.
*/
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { skeleton, blankHtmlComments, scriptsOf, failLine, CODE, STR, COMMENT } from './lib/js-skeleton.mjs';

const ROOT = process.cwd();
const LIST = process.argv.includes('--list');
const DUMP = !!process.env.DUMP;   /* 시험 도구용 — 자리마다 판정을 한 줄씩 낸다 */
const ALLOW_FILE = new Set(['ops/hub/step1.html', 'ops/hub/room.html', 'ops/hub/audit.html']);
const WRITE_VERB = new Set(['insert', 'upsert', 'update', 'delete']);
/* 이름( 꼴이지만 호출이 아닌 것 — 문장 머리(그 안의 글자는 호출 인자가 아니다) / 식 앞의 예약어(괄호는 묶음일 뿐) */
const STOP_KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'with']);
const HOP_KW = new Set(['await', 'return', 'typeof', 'void', 'yield', 'throw', 'case', 'in', 'of', 'new', 'delete', 'else', 'do']);
/* 조회 조건 메서드 — .eq('열','bookings') 처럼 표 이름 글자가 뒤 인자(값)로 온 것은 다른 표를 거르는 값이지 조회 대상이 아니다 */
const FILTER_METHOD = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'overlaps', 'match', 'not', 'or', 'filter']);
const PROBE_OK = new Set(['from', 'select', 'limit']);
const LIMIT = 200000;   /* 괄호 짝을 찾는 최대 글자 수(긴 배열 인자도 읽게 넉넉히) — 넘으면 통과시키지 않고 오류로 알린다 */
const TABLE = '(?:partner_)?bookings';
const NOTE_FORMS = '/* 대기 포함: 이유 */ · /* 대기 제외: 이유 */ · /* 대기 무관: 이유 */';
const WHERE_NOTE = '조회 안이나 조회가 끝난 바로 뒤 같은 줄( ; 보다 앞)';
const HINT = `→ .neq('status','대기') 를 그 조회에 붙이세요. 일부러 읽거나 다른 방법으로 빼면 ${WHERE_NOTE}에 /* 대기 포함: 이유 */ 또는 /* 대기 제외: 이유 */ (예: …select('*') /* 대기 포함: 이유 */;)`;
/* 임베드 자리의 안내 — 그 임베드의 표 이름·별칭으로 적는다(partner_bookings 임베드에 'bookings.status' 는 통하지 않는다) */
const hintEmbed = (em) => (em.nested ? `→ 다른 임베드 안에 든 임베드입니다. 필터는 전체 경로( 바깥임베드.${em.alias || em.table}.status )로 걸어야 하고 이 검사는 그 필터를 읽지 못합니다. ${WHERE_NOTE}에 ${NOTE_FORMS} 가운데 하나를 적으세요` : em.inner
  ? `→ .neq('${em.alias || em.table}.status','대기') 를 그 조회에 붙이세요. 일부러 읽거나 다른 방법으로 빼면 ${WHERE_NOTE}에 /* 대기 포함: 이유 */ 또는 /* 대기 제외: 이유 */, 조회가 아닌 글자(설명·로그)면 /* 대기 무관: 이유 */`
  : `→ inner 가 아닌 임베드는 필터를 걸어도 부모 행이 걸러지지 않습니다. ${em.table}!inner( … ) 로 바꾸고 .neq('${em.alias || em.table}.status','대기') 를 붙이거나, ${WHERE_NOTE}에 ${NOTE_FORMS} 가운데 하나를 적으세요`);
const HINT_HELPER = `→ 헬퍼 안에서 필터가 걸리는지는 이 검사가 보지 못합니다. ${WHERE_NOTE}에 사유를 적으세요 — 헬퍼가 넘긴 필터를 적용하거나 앞 조회가 이미 대기를 뺀 목록이면 /* 대기 제외: 이유 */, 일부러 읽으면 /* 대기 포함: 이유 */, 조회가 아니거나 쓰기면 /* 대기 무관: 이유 */`;
const HINT_LIT = `→ 표 이름을 조회 호출에 직접 적거나, 그 글자 바로 뒤 같은 줄( ; 보다 앞)에 ${NOTE_FORMS} 가운데 하나를 적으세요(변수·객체·배열에 담은 표 이름은 이 검사가 따라가지 못합니다)`;
const HINT_SEL = `→ select 문자열을 .select( ) 가 아닌 호출에 넘겼습니다. 그 호출 안에서 필터가 걸리는지는 이 검사가 보지 못합니다. ${WHERE_NOTE}에 ${NOTE_FORMS} 가운데 하나를 적으세요`;
const ROWS_OK = new Set(['from', 'select', 'order', 'range', 'limit']);

const TPL_RE = new RegExp('^' + TABLE + '$');
const REST_RE = new RegExp('(?:/rest/v1/|^[\'"`]?)(' + TABLE + ')(?:(?<=/rest/v1/' + TABLE + ')(?![\\w$])|\\?)');
/* 임베드 — 앞이 select 목록의 경계(문자열 머리 · 쉼표 · 콜론 · 여는 괄호 · 전개)이고, 표 이름 뒤에 !수식어가 0개 이상, 그 뒤가 여는 괄호.
   「imported bookings (via …)」 같은 문장 속 낱말은 앞이 경계가 아니라서 걸리지 않는다. */
const EMBED_RE = new RegExp('(^|[,:(]|\\.\\.\\.)(\\s*)"?(' + TABLE + ')"?\\s*((?:!\\s*[A-Za-z_]\\w*\\s*)*)\\(', 'g');
/* 템플릿 조각이 표 이름에서 보간으로 넘어가는 꼴 — `event_seq, bookings${수식어}(…)` */
const EMBED_TAIL_RE = new RegExp('(^|[,:(]|\\.\\.\\.)(\\s*)"?(' + TABLE + ')"?\\s*(?:!\\s*[A-Za-z_]\\w*\\s*)*(?:!\\s*)?[$\'"`]$');
/* 임베드 괄호 안이 열 목록 꼴인가 — 낱말(한글 열 이름 포함)·쉼표·수식어뿐이고, 「낱말 빈칸 낱말」(문장)이 없다.
   「passengers (name_kr)」 처럼 이름과 괄호 사이의 빈칸은 열 목록이다(supabase-js 는 select 의 빈칸을 지운다). */
const WCH = '[\\w\\u3131-\\uD7A3]';
const COLS_RE = new RegExp('^(?:' + WCH + '|[\\s,:!*().>"-])*$');
const PROSE_RE = new RegExp('(?:' + WCH + '|\\))\\s+' + WCH);
/* 사유 주석 — 주석 기호를 뗀 글이 「대기 포함|제외|무관: 이유」 꼴(이유는 두 글자 이상) */
const NOTE_BODY_RE = /^대기\s*(?:포함|제외|무관)\s*[:：]\s*\S[\s\S]*\S/;
const isNote = (c) => NOTE_BODY_RE.test(c.replace(/^\/\*+/, '').replace(/\*+\/$/, '').trim());
/* 문자열 조각(따옴표 포함)의 값 — 온전한 글자일 때만. 'book\u0069ngs' 같은 이스케이프도 풀어서 본다 */
function strValue(tok) {
  const q = tok[0];
  if (!(q === "'" || q === '"' || q === '`') || tok.length < 2 || tok[tok.length - 1] !== q) return null;
  const v = tok.slice(1, -1);
  if (!v.includes('\\')) return v;
  return v.replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})|\\\r?\n|\\([\s\S])/g,
    (m, a, b, c, d) => (a || b || c ? String.fromCodePoint(Math.min(parseInt(a || b || c, 16), 0x10ffff))
      : d === undefined ? '' : (ESC_CHAR[d] !== undefined ? ESC_CHAR[d] : d)));
}
const ESC_CHAR = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
/* i 에서 시작하는 문자열 조각을 「값」으로 읽는다 → { tok, j(끝), continued, whole }
   · 이스케이프('book\u0069ngs')는 풀고, 글자끼리 이어 붙인 것('book'+'ings' · '/rest/v1/'+'bookings' · 'a,'+'bookings!inner(x)')은
     이어서 한 글자로 본다 — 뒤 조각까지 j 로 건너뛴다. 변수가 끼면 거기서 끊는다(끊긴 뒤 조각은 따로 읽는다)
   · continued = 템플릿의 ${…} 뒤에 이어지는 조각 · whole = 따옴표로 열고 닫은 온전한 글자 */
function readStr(R, code, K, i) {
  let j = i; while (j < code.length && K[j] === STR) j++;
  let tok = code.slice(i, j);
  const continued = i > 0 && code[i - 1] === '}' && K[i - 1] === CODE;
  const val = continued ? null : strValue(tok);
  if (val !== null) {
    let v = val, end = j;
    for (;;) {
      const plus = R.nextSig(end);
      if (!(plus < code.length && code[plus] === '+' && K[plus] === CODE && code[plus + 1] !== '+' && code[plus + 1] !== '=')) break;
      const k = R.nextSig(plus + 1);
      if (!(k < code.length) || K[k] !== STR) break;
      let e = k; while (e < code.length && K[e] === STR) e++;
      const v2 = strValue(code.slice(k, e));
      if (v2 === null) break;
      v += v2; end = e;
    }
    if (end !== j || v !== tok.slice(1, -1)) { tok = "'" + v + "'"; j = end; }
  }
  return { tok, j, continued, whole: val !== null };
}
const isWord = (c) => c !== undefined && /[\w$]/.test(c);
const isSpace = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r';
const rx = (s) => s.replace(/[$.]/g, '\\$&');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    let st; try { st = lstatSync(p); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.html') || name.endsWith('.js')) out.push(p);
  }
  return out;
}

/* 그 파일의 스크립트 조각들 — {code, base(파일 안 시작 위치)} 와, 스크립트를 지운 나머지 마크업 */
function segmentsOf(rel, text) {
  /* NUL 이 든 파일(UTF-16 으로 저장했거나 이진) — <script 글자를 찾지 못해 조용히 빈 화면이 된다. 읽지 못한 것으로 알린다 */
  if (text.includes('\0')) return { segs: [], markup: '', bad: { at: 0, why: 'NUL 글자가 든 파일입니다(UTF-16 으로 저장했거나 이진 파일) — UTF-8 로 저장하세요' } };
  if (rel.endsWith('.js')) return { segs: [{ code: text, base: 0 }], markup: '', bad: null };
  const html = blankHtmlComments(text);
  const segs = [];
  /* 브라우저가 실행하는 인라인 스크립트만 — src 가 있는 것·JSON·importmap·템플릿은 아니다 */
  const { list, unclosed } = scriptsOf(html);
  for (const t of list) if (t.src === null && t.kind && t.code.trim()) segs.push({ code: t.code, base: t.base, module: t.kind === 'module' });
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, (x) => x.replace(/[^\n]/g, ' '));
  /* 닫는 태그가 없는 <script> — 브라우저는 실행하지 않지만, 그 안의 조회를 검사하지 못한 채 통과시키지 않는다 */
  return { segs, markup, bad: unclosed >= 0 ? { at: unclosed, why: '<script> 가 닫히지 않았습니다(닫는 태그 없음)' } : null };
}

/* ── 한 조각(스크립트 하나)을 읽는 도구 ─────────────────────────────────── */
function reader(code, sk) {
  const K = sk.kind, n = code.length;
  const prevSig = (i) => { while (i >= 0 && (isSpace(code[i]) || K[i] === COMMENT)) i--; return i; };
  const nextSig = (i) => { while (i < n && (isSpace(code[i]) || K[i] === COMMENT)) i++; return i; };
  const wordBack = (p) => { let k = p; while (k >= 0 && K[k] === CODE && isWord(code[k])) k--; return k + 1; };   /* p 에서 끝나는 낱말의 첫 글자 */
  /* 닫는 괄호(at) 의 짝 — 여는 괄호 위치 */
  function openOf(at) {
    let d = 0;
    for (let i = at; i >= 0 && at - i < LIMIT; i--) {
      if (K[i] !== CODE) continue;
      const c = code[i];
      if (c === ')' || c === ']' || c === '}') d++;
      else if (c === '(' || c === '[' || c === '{') { d--; if (d === 0) return i; }
    }
    return -1;
  }
  function closeOf(open) {
    let d = 0;
    for (let i = open; i < n && i - open < LIMIT; i++) {
      if (K[i] !== CODE) continue;
      const c = code[i];
      if (c === '(' || c === '[' || c === '{') d++;
      else if (c === ')' || c === ']' || c === '}') { d--; if (d === 0) return i; }
    }
    return -1;
  }
  /* pos 를 감싼 여는 괄호. 템플릿의 ${ 는 건너뛴다(그 바깥의 괄호를 본다) */
  function opener(pos) {
    let d = 0;
    for (let i = pos - 1; i >= 0 && pos - i < LIMIT; i--) {
      if (K[i] !== CODE) continue;
      const c = code[i];
      if (c === ')' || c === ']' || c === '}') d++;
      else if (c === '(' || c === '[' || c === '{') {
        if (d > 0) { d--; continue; }
        if (c === '{' && i > 0 && code[i - 1] === '$' && K[i - 1] === STR) continue;   /* `${ … }` 의 중괄호 */
        return i;
      }
    }
    return -1;
  }
  /* 표 이름·select 문자열을 감싼 「호출」 — 이름 없는 괄호 (a ? b : c) 와 await( … ) 는 지나 바깥을 본다 */
  function enclosingCall(pos) {
    let p = pos;
    for (let hop = 0; hop < 8; hop++) {
      const o = opener(p);
      if (o < 0 || code[o] !== '(') return null;
      const e = prevSig(o - 1);
      if (e >= 0 && K[e] === CODE && isWord(code[e])) {
        const at = wordBack(e), name = code.slice(at, e + 1);
        const d = prevSig(at - 1), method = d >= 0 && code[d] === '.' && K[d] === CODE;      /* .in( · .delete( 는 예약어가 아니라 메서드 */
        if (!method && STOP_KW.has(name)) return null;
        if (method || !HOP_KW.has(name)) return { open: o, name, at, method };
      }
      p = o;
    }
    return null;
  }
  /* 조회 조건의 값인가 — .eq('열','bookings') · .in('열',['bookings', …]) 처럼 조건 메서드의 둘째 인자 이후이고 첫 인자가 문자열(열 이름) */
  function inFilterValue(pos) {
    const o = opener(pos);
    const p = o >= 0 && code[o] === '[' ? o : pos;      /* 배열 한 겹은 지난다 */
    const call = enclosingCall(p);
    return !!(call && call.method && FILTER_METHOD.has(call.name) && argIndex(call.open, p) > 0 && K[nextSig(call.open + 1)] === STR);
  }
  /* 호출 여는 괄호에서 pos 까지, 괄호 밖 쉼표 수 = 몇 번째 인자인가 */
  function argIndex(open, pos) {
    let d = 0, k = 0;
    for (let i = open + 1; i < pos; i++) {
      if (K[i] !== CODE) continue;
      const c = code[i];
      if (c === '(' || c === '[' || c === '{') d++;
      else if (c === ')' || c === ']' || c === '}') d--;
      else if (c === ',' && d === 0) k++;
    }
    return k;
  }
  /* 메서드 체인의 머리 — at(호출 이름의 첫 글자)에서 뒤로 「.이름」「( … )」「[ … ]」「?.」 를 따라 올라간다 */
  function chainStart(at) {
    let i = at;
    for (let guard = 0; guard < 200; guard++) {
      let j = prevSig(i - 1);
      if (j < 0 || K[j] !== CODE || code[j] !== '.') return i;
      j--;
      if (j >= 0 && K[j] === CODE && code[j] === '?') j--;
      let p = prevSig(j);
      let head = -1;
      while (p >= 0 && K[p] === CODE && (code[p] === ')' || code[p] === ']')) {      /* 앞이 호출·첨자 — 짝이 맞는 여는 괄호까지 */
        const o = openOf(p);
        if (o < 0) return i;
        head = o;
        p = prevSig(o - 1);
        if (p >= 1 && K[p] === CODE && code[p] === '.' && code[p - 1] === '?') p = prevSig(p - 2);   /* ?.( */
      }
      if (p >= 0 && K[p] === CODE && isWord(code[p])) {
        const k = wordBack(p), word = code.slice(k, p + 1);
        const pd = prevSig(k - 1), isProp = pd >= 0 && code[pd] === '.' && K[pd] === CODE;
        if (!isProp && (HOP_KW.has(word) || STOP_KW.has(word))) return head >= 0 ? head : i;     /* await (x).from(…) — 머리는 괄호 묶음 */
        i = k; continue;
      }
      return head >= 0 ? head : i;
    }
    return i;
  }
  /* 체인의 끝 — start(머리)에서 앞으로 「.이름」「( … )」「[ … ]」 만 따라간다. calls = 호출된 메서드 이름들 */
  function chainEnd(start) {
    let i = start;
    while (i < n && K[i] === CODE && isWord(code[i])) i++;
    let end = i;
    const calls = [], list = [];      /* list = 체인의 맨 바깥 호출들 {name(이름 없는 호출·첨자 호출은 ''), open, close} */
    const push = (name, open, close) => { calls.push(name); list.push({ name, open, close }); };
    let last = '';
    for (let guard = 0; guard < 400; guard++) {
      const j = nextSig(i);
      if (j >= n || K[j] !== CODE) break;
      const c = code[j];
      if (c === '(' || c === '[') {
        if (code.slice(i, j).includes('\n')) break;      /* 줄이 바뀐 뒤의 괄호 — 다음 문장으로 본다(그 사이의 주석은 아랫줄 주석이다) */
        const close = closeOf(j);
        if (close < 0) return { end, calls, list, capped: true };
        if (c === '(' && (last || i > start)) push(last, j, close);      /* x['eq'](…) · f()(…) 는 이름 없는 호출로 적는다(머리의 묶음 괄호는 호출이 아니다) */
        last = ''; i = close + 1; end = i; continue;
      }
      if (c === '.' || (c === '?' && code[j + 1] === '.' && K[j + 1] === CODE)) {
        let k = j + (c === '?' ? 2 : 1);
        while (k < n && isSpace(code[k])) k++;
        if (c === '?' && K[k] === CODE && (code[k] === '(' || code[k] === '[')) {
          const close = closeOf(k);
          if (close < 0) return { end, calls, list, capped: true };
          if (code[k] === '(') push(last, k, close);
          last = ''; i = close + 1; end = i; continue;
        }
        let m = k;
        while (m < n && K[m] === CODE && isWord(code[m])) m++;
        if (m === k) break;
        const name = code.slice(k, m);
        if (name === 'then' || name === 'catch' || name === 'finally') break;
        last = name; i = m; end = i; continue;
      }
      break;
    }
    return { end, calls, list, capped: false };
  }
  /* 사유 주석 — 체인 안의 블록 주석 + 체인이 끝난 바로 뒤 같은 줄의 블록 주석(닫는 괄호는 지난다) */
  function notesAround(s, e) {
    const out = [];
    for (let i = s; i < e; i++) {
      if (K[i] !== COMMENT) continue;
      let j = i; while (j < e && K[j] === COMMENT) j++;
      // 블록 주석만 센다 — 줄 주석 안에 적힌 블록 주석 꼴의 글자(옛 코드를 주석으로 막아 둔 줄)는 사유가 아니다
      const run = code.slice(i, j);
      for (let k = 0; k < run.length;) {
        if (run.startsWith('//', k)) { const nl = run.indexOf('\n', k); if (nl < 0) break; k = nl + 1; continue; }
        if (run.startsWith('/*', k)) { const end = run.indexOf('*/', k + 2); if (end < 0) break; out.push(run.slice(k, end + 2)); k = end + 2; continue; }
        k++;
      }
      i = j - 1;
    }
    let nl = false, i = e;
    for (; i < n; i++) {
      if (K[i] === COMMENT) {
        let j = i; while (j < n && K[j] === COMMENT) j++;
        const txt = code.slice(i, j);
        if (!nl && txt.startsWith('/*')) out.push((/^\/\*[\s\S]*?\*\//.exec(txt) || [txt])[0]);
        if (txt.includes('\n') || !txt.startsWith('/*')) nl = true;      /* 줄 주석 뒤는 다음 줄이다 */
        i = j - 1; continue;
      }
      const c = code[i];
      if (c === '\n') { nl = true; continue; }
      if (isSpace(c)) continue;
      if (K[i] === CODE && (c === ')' || c === ']')) { nl = false; continue; }
      break;
    }
    out.end = i;      /* 주석을 찾아본 끝(시험 도구가 쓴다) */
    return out;
  }
  /* 체인 안에 「대기를 빼는 필터」가 있는가 — cols = 받아들이는 열 이름들 */
  function hasFilter(s, e, cols, ch) {
    /* 체인의 맨 바깥 호출만 본다 — 인자 안 다른 조회( .in('event_seq', (await 다른조회.neq('status','대기')).data) )의 필터는 이 조회의 필터가 아니다 */
    const lit = (k, close) => {      /* 그 자리의 글자 하나(값)와 그 뒤 자리 — 주석·빈칸은 건넌다 */
      if (k >= close || K[k] !== STR) return null;
      const r = readStr({ nextSig }, code, K, k);
      return r.whole ? { v: r.tok.slice(1, -1), next: nextSig(r.j) } : null;
    };
    for (const c of (ch && ch.list) || []) {
      if (c.name !== 'neq') continue;
      const a = lit(nextSig(c.open + 1), c.close);
      if (!a || !cols.includes(a.v) || !(code[a.next] === ',' && K[a.next] === CODE)) continue;
      const b = lit(nextSig(a.next + 1), c.close);
      if (!b || b.v !== '대기') continue;
      let t = b.next;
      if (code[t] === ',' && K[t] === CODE) t = nextSig(t + 1);
      if (t === c.close) return true;
    }
    return false;
  }
  /* 허용 문장 — 대기를 세어도 되는 조회 꼴(머리말 「허용」). ch = chainEnd 의 결과. 체인의 맨 바깥 호출만 본다(인자 안 다른 조회의 글자는 아니다) */
  function allowed(s, e, ch, kind) {
    if (!ch || !ch.list) return false;
    const top = ch.list, sels = top.filter((c) => c.name === 'select');
    if (sels.length !== 1) return false;
    const sel = sels[0];
    const firstArg = (c) => {      /* 첫 인자가 글자 하나일 때 그 값 */
      const k = nextSig(c.open + 1);
      if (k >= c.close || K[k] !== STR) return null;
      const r = readStr({ nextSig }, code, K, k);
      const after = nextSig(r.j);
      return r.whole && (after === c.close || (code[after] === ',' && K[after] === CODE)) ? r.tok.slice(1, -1) : null;
    };
    const headCount = (c) => { for (const m of code.slice(c.open, c.close).matchAll(/(?<![\w$])head\s*:\s*true(?![\w$])/g)) if (K[c.open + m.index] === CODE) return true; return false; };
    const onCol = (c, cols) => FILTER_METHOD.has(c.name) && cols.includes(firstArg(c));
    const a0 = firstArg(sel);
    if (a0 === null) return false;
    if (kind === 'direct') {
      /* 등록 현황 — session_ym 열만 읽고, 조건도 session_ym 에만 건다(다른 조건이 붙으면 「그날 팀 수」 같은 숫자가 된다) */
      if (a0 === 'session_ym' && top.every((c) => c === sel || ROWS_OK.has(c.name) || onCol(c, ['session_ym'])) && consumed(s, e)) return true;
      /* 연결·열 확인 — 건수만(head) 묻고 조건이 없으며, 그 자리에서 await 하고, 받은 건수·행을 꺼내 쓰지 않는다 */
      if (headCount(sel) && top.every((c) => PROBE_OK.has(c.name)) && probeAwaited(s, e)) return true;
    }
    if (kind === 'embed') {
      /* 등록 현황(건수) — bookings!inner(session_ym) 로 달만 걸어 head 건수를 센다(행을 받는 조회는 아니다) */
      if (headCount(sel) && /(?:^|,)\s*(?:partner_)?bookings\s*!\s*inner\s*\(\s*session_ym\s*\)\s*(?:,|$)/.test(a0)
        && top.every((c) => c === sel || c.name === 'from' || onCol(c, ['bookings.session_ym', 'partner_bookings.session_ym', 'session_ym'])) && consumed(s, e)) return true;
    }
    return false;
  }
  /* 연결 확인은 그 자리에서 기다린다 — 변수에 담아 두면 뒤에서 조건을 붙일 수 있다. { count } · { data } 로 받으면 숫자·행으로 쓰는 것이다 */
  /* 조회가 그 자리에서 끝나는가 — await 로 바로 기다리거나 .then( 으로 바로 받는다. 변수에 담아 둔 조회는 뒤에서 조건을 붙일 수 있다 */
  function consumed(s, e) {
    const p = prevSig(s - 1);
    if (p >= 4 && K[p] === CODE && code.slice(wordBack(p), p + 1) === 'await') return true;
    const k = nextSig(e);
    if (k < n && K[k] === CODE && /^\??\.\s*then\s*\(/.test(sk.text.slice(k, k + 40))) return true;
    /* Promise.all([ 조회, 조회 ]) 의 원소 — 이름이 없어 뒤에서 조건을 붙일 수 없다 */
    const o = opener(s);
    if (o >= 0 && code[o] === '[' && p >= 0 && (code[p] === '[' || code[p] === ',') && k < n && (code[k] === ',' || code[k] === ']')) {
      const c = enclosingCall(o);
      return !!(c && c.method && (c.name === 'all' || c.name === 'allSettled') && prevSig(o - 1) === c.open);
    }
    return false;
  }
  /* 연결 확인은 그 자리에서 기다리고, 받은 값에서 error 말고는 꺼내 쓰지 않는다 */
  function probeAwaited(s, e) {
    const p = prevSig(s - 1);
    if (p < 4 || K[p] !== CODE || code.slice(wordBack(p), p + 1) !== 'await') return false;
    const after = nextSig(e);
    if (after < n && K[after] === CODE && code[after] === '.') return false;                 /* await ….then(r => r.count) */
    const aw = wordBack(p), q = prevSig(aw - 1);
    if (q < 0 || K[q] !== CODE) return true;
    if (code[q] === ';' || code[q] === '{' || code[q] === '}') return true;                    /* await 조회; — 값을 받지 않는다 */
    if (code[q] === '(') {                                                                    /* (await 조회).error 만 */
      return after < n && code[after] === ')' && /^\)\s*\??\.\s*error(?![\w$])/.test(sk.text.slice(after, after + 30));
    }
    if (code[q] !== '=' || /[=!<>+\-*/%&|^]/.test(code[q - 1])) return false;                  /* return await … · f(await …) · x += … */
    const t = prevSig(q - 1);
    if (t < 0 || K[t] !== CODE) return false;
    if (code[t] === '}') {                                                                    /* const { error } = await … */
      const o = openOf(t);
      return o >= 0 && !/['"`]|\.\.\./.test(code.slice(o, t + 1)) && !/(?<![\w$])(?:count|data)(?![\w$])/.test(sk.text.slice(o, t + 1));
    }
    if (!isWord(code[t])) return false;                                                       /* [a] = await … */
    const w = wordBack(t), name = code.slice(w, t + 1), d = prevSig(w - 1);
    if (d >= 0 && code[d] === '.' && K[d] === CODE) return false;                             /* state.x = await … */
    const o = opener(w), end = o >= 0 ? closeOf(o) : n;                                       /* 그 변수가 보이는 블록 안에서 .error 로만 쓰는가 */
    const re = new RegExp('(?<![\\w$.])' + rx(name) + '(?![\\w$])(?!\\s*\\??\\.\\s*error(?![\\w$]))', 'g');
    for (const m of sk.text.slice(Math.max(o, 0), end < 0 ? n : end).matchAll(re)) if (Math.max(o, 0) + m.index !== w) return false;
    return true;
  }
  return { prevSig, nextSig, wordBack, openOf, closeOf, opener, enclosingCall, inFilterValue, chainStart, chainEnd, notesAround, hasFilter, allowed };
}

/* 문자열 조각(따옴표 포함) 안의 임베드들 — [{table, inner, alias, off(조각 안 위치)}] */
function embedsIn(tok, continued, open) {
  const lead = !continued && /^['"`]/.test(tok) ? 1 : 0;
  const body = tok.slice(lead).replace(/\\[nrt]/g, '  ');      /* 온전하지 않은 조각은 원문 그대로다 — \n·\t 이스케이프를 빈칸으로 */
  const out = [];
  for (const m of body.matchAll(EMBED_RE)) {
    /* 괄호 안이 열 목록 꼴인가 — 문장(낱말 사이가 빈칸뿐)·한글·기호가 섞이면 select 가 아니다 */
    const from = m.index + m[0].length;
    let d = 1, k = from;
    for (; k < body.length && d > 0; k++) { if (body[k] === '(') d++; else if (body[k] === ')') d--; }
    const inside = body.slice(from, d === 0 ? k - 1 : body.length).replace(/[$'"`]+$/, '');
    if (!COLS_RE.test(inside) || PROSE_RE.test(inside)) continue;
    const before = body.slice(0, m.index + m[1].length);
    const alias = m[1] === ':' ? (/([A-Za-z_]\w*)\s*$/.exec(before.slice(0, -1)) || [])[1] : '';
    const pre = body.slice(0, m.index + m[1].length), nested = (pre.match(/\(/g) || []).length > (pre.match(/\)/g) || []).length;
    out.push({ table: m[3], inner: /!\s*inner\b/.test(m[4]), alias: alias || '', nested, off: lead + m.index + m[1].length + m[2].length });
  }
  if (tok.endsWith('$') || open) {      /* 수식어·괄호가 보간·변수에 있다 — inner 인지 알 수 없으니 필터로는 통과하지 않는다 */
    const m = EMBED_TAIL_RE.exec(body);
    if (m) out.push({ table: m[3], inner: false, alias: '', off: lead + m.index + m[1].length + m[2].length });
  }
  return out;
}

/* ── 본 검사 ─────────────────────────────────────────────────────────────── */
if (!existsSync(join(ROOT, 'ops'))) {
  console.error('✗ ops 폴더가 없습니다 — 저장소의 맨 위 폴더에서 실행하세요( node scripts/check-wait.mjs ).');
  process.exit(1);
}
const files = walk(join(ROOT, 'ops')).sort();
const loaded = files.map((f) => {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  const text = readFileSync(f, 'utf8');
  const { segs, markup, bad } = segmentsOf(rel, text);
  for (const s of segs) {
    s.sk = skeleton(s.code, { module: !!s.module });
    if (!s.sk.ok && !s.module && rel.endsWith('.js') && /(?<![\w$.])(?:import|export)(?![\w$])/.test(s.code)) {      /* import/export 가 든 .js 는 ESM 으로 읽는다 */
      const m = skeleton(s.code, { module: true });
      if (m.ok) { s.sk = m; s.module = true; }
    }
  }
  return { rel, text, segs, markup, bad };
});

/* 임베드 select 를 담은 변수 — 이름 = '…bookings!inner(…)…'.
   변수가 보이는 범위: const·let·var 로 선언한 것은 그 함수 안(최상위면 그 화면의 모든 스크립트),
   선언 없이 담은 것과 window.이름 은 전역(그 화면의 모든 스크립트, 공용 스크립트에 있으면 모든 화면). */
const fnScope = (sk, pos) => { let b = sk.blk[pos]; while (b >= 0 && !sk.isFn[b]) b = sk.parent[b]; return b; };
const inScope = (sk, scope, pos) => { if (scope < 0) return true; for (let b = sk.blk[pos]; b >= 0; b = sk.parent[b]) if (b === scope) return true; return false; };
function constsOf(seg) {
  const { code, sk } = seg, K = sk.kind;
  const R = reader(code, sk);
  const defs = [], defAt = new Set(), loose = new Set();
  /* 쉼표 앞으로 그 문장의 머리까지 올라가 const·let·var 선언 목록인지 본다 — 「 READY = 1, GSEL = '…' 」 는 선언이 아니라 전역에 담는 것이다 */
  const declaredList = (commaAt) => {
    const head = (from) => /^\s*(?:const|let|var)(?![\w$])/.test(sk.text.slice(from, commaAt));
    let d = 0, k = commaAt - 1;
    for (; k >= 0 && commaAt - k < 20000; k--) {
      if (K[k] !== CODE) continue;
      const c = code[k];
      if (c === '\n' && d === 0) {
        const p = R.prevSig(k - 1);
        if (p < 0) return head(0);
        if (K[p] === CODE && /[,=+\-*/%&|^?:([{<>!~]/.test(code[p])) continue;      /* 앞줄이 쉼표·연산자로 끝난다 — 이어지는 문장 */
        return head(k + 1);
      }
      if (c === ')' || c === ']' || c === '}') d++;
      else if (c === '(' || c === '[' || c === '{') { if (d === 0) return head(k + 1); d--; }
      else if (c === ';' && d === 0) return head(k + 1);
    }
    return k < 0 ? head(0) : false;
  };
  const scopeOf = (nameAt, isProp) => {
    if (isProp) return -1;
    const d = R.prevSig(nameAt - 1);
    if (d < 0 || K[d] !== CODE) return -1;
    if (/^(?:const|let|var)$/.test(code.slice(R.wordBack(d), d + 1))) return fnScope(sk, nameAt);
    return code[d] === ',' && declaredList(d) ? fnScope(sk, nameAt) : -1;
  };
  /* 클래스 본문에 바로 적은 필드( static SEL = '…' · SEL = '…' )는 this.SEL · 클래스.SEL 로 쓰여 따라가지 못한다 → 담은 자리에서 본다 */
  const inClassBody = (pos) => { const o = R.opener(pos); return o >= 0 && code[o] === '{' && /(?:^|[^\w$.])class(?![\w$])[^;{}]*$/.test(sk.text.slice(Math.max(0, o - 300), o)); };
  for (let i = 0; i < code.length; i++) {
    if (K[i] !== STR || (i > 0 && K[i - 1] === STR)) continue;
    const { tok, j, continued } = readStr(R, code, K, i);
    const plus0 = R.nextSig(j), open0 = plus0 < code.length && code[plus0] === '+' && K[plus0] === CODE && code[plus0 + 1] !== '+';
    for (const em of embedsIn(tok, continued, open0)) {
      if (R.enclosingCall(i)) continue;                       /* 호출 안의 것은 본 검사가 그 자리에서 본다 */
      const p = R.prevSig(i - 1);
      let name = '';
      if (p >= 1 && K[p] === CODE && code[p] === '=' && !/[=!<>+\-*/%&|^]/.test(code[p - 1])) {
        const q = R.prevSig(p - 1);
        if (q >= 0 && K[q] === CODE && isWord(code[q])) {
          const r = R.wordBack(q);
          const dot = R.prevSig(r - 1);
          const isProp = dot >= 0 && code[dot] === '.' && K[dot] === CODE;
          const owner = isProp ? code.slice(R.wordBack(R.prevSig(dot - 1)), R.prevSig(dot - 1) + 1) : '';
          if ((!isProp || /^(?:window|globalThis|self)$/.test(owner)) && /^[A-Za-z_$]/.test(code.slice(r, q + 1)) && !inClassBody(r)) {
            name = code.slice(r, q + 1); defAt.add(r);
            defs.push({ name, table: em.table, inner: em.inner, alias: em.alias, scope: scopeOf(r, isProp) });
          }
        }
      }
      if (!name) loose.add(i);
    }
    i = j - 1;
  }
  /* 다른 변수로 옮긴 것( X = 이름 )도 같은 select 다 */
  for (let grew = true, guard = 0; grew && defs.length && guard < 20; guard++) {
    grew = false;
    for (const d of [...defs]) {
      const re = new RegExp('(?<![\\w$.])([A-Za-z_$][\\w$]*)\\s*=\\s*' + rx(d.name) + '(?![\\w$])\\s*(?=[;,\\n)]|$)', 'g');
      for (const m of sk.text.matchAll(re)) {
        if (K[m.index] !== CODE || defAt.has(m.index) || !inScope(sk, d.scope, m.index)) continue;
        defAt.add(m.index);
        defs.push({ name: m[1], table: d.table, inner: d.inner, alias: d.alias, scope: scopeOf(m.index, false) });
        grew = true;
      }
    }
  }
  return { defs, defAt, loose };
}
for (const f of loaded) for (const s of f.segs) if (s.sk.ok) s.consts = constsOf(s);
/* .js 파일의 전역 select 변수 — 모든 화면에서 보인다. 화면의 전역은 그 화면과, 화면이 싣는 .js 에서 보인다(어느 화면이 싣는지는 따지지 않는다) */
const globalsOf = (f) => f.segs.flatMap((s) => (s.consts ? s.consts.defs.filter((d) => d.scope < 0) : []));
const sharedGlobals = loaded.filter((f) => f.rel.endsWith('.js')).flatMap(globalsOf);
const htmlGlobals = loaded.filter((f) => !f.rel.endsWith('.js')).flatMap(globalsOf);


let nHtml = 0, nJs = 0, hits = 0, bad = 0, longs = 0, writes = 0, unread = 0;
const kinds = { direct: 0, embed: 0, helper: 0, literal: 0 };
const how = { '필터': 0, '주석': 0, '허용 문장': 0 };
const dump = (o) => { if (DUMP) console.log('@@' + JSON.stringify(o)); };

for (const file of loaded) {
  const { rel, text } = file;
  if (ALLOW_FILE.has(rel)) continue;
  if (rel.endsWith('.js')) nJs++; else nHtml++;
  const lineStart = [0];
  for (let k = text.indexOf('\n'); k >= 0; k = text.indexOf('\n', k + 1)) lineStart.push(k + 1);
  const lineAt = (pos) => { let lo = 0, hi = lineStart.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStart[mid] <= pos) lo = mid; else hi = mid - 1; } return lo + 1; };
  const sites = [];   /* { pos(파일 위치), kind, what, verdict, hint } */
  if (file.bad) {
    unread++;
    const where = `${rel}:${lineAt(file.bad.at)}`;
    console.error(`✗ ${where}  ${file.bad.why} — 그 안의 조회를 검사하지 못했습니다(읽지 못한 것은 통과가 아닙니다).`);
    dump({ where, rel, what: '(읽지 못한 파일)', kind: 'unread', verdict: 'miss' });
  }

  /* 스크립트 밖 — 인라인 핸들러(on…="…")에 표 이름이 있으면 스크립트로 옮기게 한다(체인·주석을 따질 수 없다) */
  for (const m of file.markup.matchAll(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>][^\s>]*)/gi)) {
    if (new RegExp('(?<![\\w$])' + TABLE + '(?![\\w$])').test(m[0])) sites.push({ pos: m.index + 1, kind: 'literal', what: '인라인 핸들러 ' + m[0].trim().slice(0, 40), verdict: 'miss', hint: '→ 인라인 핸들러에서 예약 표를 읽지 않습니다. 스크립트의 함수로 옮기세요' });
  }

  /* 그 화면의 모든 스크립트 + 공용 스크립트의 전역 select 변수 */
  const pageGlobals = sharedGlobals.concat(rel.endsWith('.js') ? htmlGlobals : globalsOf(file));

  for (const seg of file.segs) {
    const { code, base, sk } = seg;
    if (!sk.ok) {
      unread++;
      const fl = failLine(sk, code), at = lineAt(base) + (fl ? fl - 1 : 0);
      console.error(`✗ ${rel}:${at}  스크립트를 읽지 못해 검사하지 못했습니다(${sk.why}) — 문법 오류면 check-syntax 가 알려 줍니다. 문법이 맞는데 이 줄에서 멈추면 그 줄의 정규식·나눗셈을 변수로 나누어 적으세요.`);
      dump({ where: `${rel}:${at}`, rel, what: '(읽지 못한 스크립트)', kind: 'unread', verdict: 'miss' });
      continue;
    }
    const K = sk.kind, R = reader(code, sk);
    const seen = new Set();   /* 같은 호출을 두 번 세지 않는다(삼항의 두 표 이름) */
    const judge = (s, e, kind, what, pos, opt = {}) => {
      const ch = opt.chain, notes = R.notesAround(s, e);
      let verdict;
      if (ch && ch.capped) verdict = 'long';
      else if (!opt.strict && !opt.noFilter && R.allowed(s, e, ch, kind)) verdict = '허용 문장';
      else if (!opt.strict && !opt.noFilter && R.hasFilter(s, e, opt.cols || ['status'], ch)) verdict = '필터';
      else if (notes.some(isNote)) verdict = '주석';
      else verdict = 'miss';
      sites.push({ pos: base + pos, kind, what, verdict, hint: opt.hint, start: base + s, end: base + notes.end });
    };
    const judgeCall = (call, kind, what, pos, opt = {}) => {
      const s = R.chainStart(call.at), ch = R.chainEnd(s);
      judge(s, ch.end, kind, what, pos, { ...opt, chain: ch });
    };
    const embedOpt = (em) => ({ cols: [em.table + '.status'].concat(em.alias ? [em.alias + '.status'] : []), noFilter: !em.inner || !!em.nested });
    /* 임베드 select 가 실제로 .select( ) 의 인자인가 — pagedIn('guests', '…bookings!inner(…)', …, 필터 콜백) 처럼 다른 호출에 넘긴 것은
       그 호출이 필터를 쓰는지 알 수 없다(표 이름을 넘기는 헬퍼 호출과 같다) → 사유 주석으로만 통과한다 */
    const selectOf = (call) => { for (let c = call, hop = 0; c && hop < 4; hop++) { if (c.name === 'select' && c.method) return c; c = R.enclosingCall(c.open); } return null; };
    const judgeEmbed = (call, what, pos, em) => {
      const sc = selectOf(call);
      if (sc) judgeCall(sc, 'embed', what, pos, { ...embedOpt(em), hint: hintEmbed(em) });
      else judgeCall(call, 'embed', what, pos, { ...embedOpt(em), noFilter: true, hint: HINT_SEL });
    };

    for (let i = 0; i < code.length; i++) {
      if (K[i] !== STR || (i > 0 && K[i - 1] === STR)) continue;
      const { tok, j, continued, whole } = readStr(R, code, K, i);

      /* ①② 표 이름 글자 — 온전한 글자, 또는 템플릿에서 보간 옆에 표 이름만 남은 조각( `${P}bookings` ) */
      let table = '';
      if (whole && TPL_RE.test(tok.slice(1, -1))) table = tok.slice(1, -1);
      if (!table && (continued || tok.endsWith('$'))) {
        const core = tok.replace(/^`/, '').replace(/[`$]$/, '');
        if (TPL_RE.test(core)) table = core;
      }
      if (table) {
        if (R.inFilterValue(i)) { i = j - 1; continue; }      /* 조회 조건의 값 — 다른 표를 거르는 글자다 */
        const colon = R.prevSig(i - 1);      /* .order('dep_date', { referencedTable: 'bookings' }) — 임베드한 표의 정렬·범위 옵션이지 읽기가 아니다(임베드는 ③ 이 본다) */
        if (colon >= 1 && K[colon] === CODE && code[colon] === ':') {
          const q = R.prevSig(colon - 1);
          if (q >= 0 && K[q] === CODE && /^(?:referencedTable|foreignTable)$/.test(code.slice(R.wordBack(q), q + 1))) { i = j - 1; continue; }
        }
        const call = R.enclosingCall(i);
        if (call) {
          if (seen.has(call.open)) { i = j - 1; continue; }
          seen.add(call.open);
          if (call.name === 'from') {
            const close = R.closeOf(call.open);
            let verb = '';
            if (close >= 0) {
              let k = R.nextSig(close + 1);
              if (code[k] === '?' && code[k + 1] === '.') k++;
              if (code[k] === '.' && K[k] === CODE) { k = R.nextSig(k + 1); let m = k; while (m < code.length && K[m] === CODE && isWord(code[m])) m++; verb = code.slice(k, m); }
            }
            if (WRITE_VERB.has(verb)) { writes++; sites.push({ pos: base + i, kind: 'direct', what: `from('${table}' …)`, verdict: 'write' }); }
            else judgeCall(call, 'direct', `from('${table}' …)`, i);
          } else judgeCall(call, 'helper', `${call.name}('${table}' …)`, i, { hint: HINT_HELPER, noFilter: true });
        } else judge(i, j, 'literal', `${tok.length > 30 ? tok.slice(0, 30) + '…' : tok} 글자`, i, { strict: true, hint: HINT_LIT });
        i = j - 1; continue;
      }
      /* ② REST 주소를 직접 적은 글자 */
      const rest = REST_RE.exec(tok);
      if (rest) { judge(i, j, 'literal', `REST 주소 /rest/v1/${rest[1]}`, i, { strict: true, hint: `→ supabase-js 조회로 바꾸거나, 그 글자 바로 뒤 같은 줄( ; 보다 앞)에 ${NOTE_FORMS} 가운데 하나를 적으세요` }); i = j - 1; continue; }

      /* ③ 임베드 */
      const plus1 = R.nextSig(j), open1 = plus1 < code.length && code[plus1] === '+' && K[plus1] === CODE && code[plus1 + 1] !== '+';
      for (const em of embedsIn(tok, continued, open1)) {
        const what = `${em.alias ? em.alias + ':' : ''}${em.table}${em.inner ? '!inner' : ''}(…)`;
        const call = R.enclosingCall(i);
        if (call) judgeEmbed(call, what, i + em.off, em);
        else if (seg.consts.loose.has(i)) judge(i, j, 'literal', `select 글자 ${what}`, i + em.off, { strict: true, hint: HINT_LIT });
        /* 변수에 담은 것은 아래 ④ 가 쓰는 자리에서 본다 */
      }
      i = j - 1;
    }

    /* ④ 임베드 select 를 담은 변수를 쓰는 자리 — 그 자리에서 보이는 정의(같은 함수 안의 것 · 전역)만 본다 */
    const locals = seg.consts.defs.filter((d) => d.scope >= 0);
    /* 전역 select 변수와 이름이 같은 「다른 것」이 그 자리를 가리는가 —
         매개변수( function load(table, cols){ … select(cols) } · (a, cols) => … ) 또는 감싼 블록에 바로 적은 const·let·var 선언.
       가린다고 본 자리는 건너뛰므로 확실한 꼴만 본다(애매하면 가리지 않는 것으로 — 잡는 쪽). 매개변수 목록의 그 이름 자체도 쓰는 자리가 아니다. */
    const STMT_START = /^\s*(?:const|let|var|return|if|for|while|do|switch|try|throw|await|async|function|class|break|continue|yield)(?![\w$])/;
    const shadowed = (at, name) => {
      const idRe = new RegExp('(?<![\\w$.])' + rx(name) + '(?![\\w$])', 'g');
      /* 그 범위에 「select 를 담는 자리」가 아닌 name 이 있는가(기본값으로 select 를 받는 매개변수는 가리는 것이 아니라 정의다) */
      const has = (from, to) => { for (const m of sk.text.slice(from, to).matchAll(idRe)) { const at0 = from + m.index; if (seg.consts.defAt.has(at0)) continue; const b = R.prevSig(at0 - 1), a = R.nextSig(at0 + name.length); if (/[(,{\[.:]/.test(code[b]) && /[,)=}\]]/.test(code[a])) return true; } return false; };      /* 묶는 자리의 이름만 — 기본값 식 안의 이름( n = sel.length )은 매개변수가 아니다 */
      /* 그 범위 안에서 name 에 select 를 담는가 — 그러면 가린 변수가 곧 select 변수다( let sel = 'a'; if (x) sel = '…bookings!inner(…)' ) */
      const assignedIn = (from, to) => { for (const dp of seg.consts.defAt) if (dp > from && dp < to && code.startsWith(name, dp) && !isWord(code[dp + name.length])) return true; return false; };
      const paramsBefore = (arrowAt) => {      /* => 앞의 매개변수에 name 이 있는가 */
        const q = R.prevSig(arrowAt - 1);
        if (q < 0 || K[q] !== CODE) return false;
        if (code[q] === ')') { const op = R.openOf(q); return op >= 0 && has(op, q + 1); }
        const w = R.wordBack(q);
        return isWord(code[q]) && code.slice(w, q + 1) === name && !seg.consts.defAt.has(w);
      };
      for (let p = at, guard = 0; guard < 80; guard++) {
        const o = R.opener(p);
        /* 같은 깊이에서 앞쪽의 화살표 — (a, cols) => supa.from(a).select(cols) */
        for (let k = p - 1, d = 0; k > Math.max(o, 0) && p - k < 4000; k--) {
          if (K[k] !== CODE) continue;
          const c = code[k];
          if (c === ')' || c === ']' || c === '}') d++;
          else if (c === '(' || c === '[' || c === '{') d--;
          else if (d === 0 && c === '>' && code[k - 1] === '=' && K[k - 1] === CODE) {
            if (code[R.nextSig(k + 1)] === '{') break;      /* 블록 본문 화살표는 이미 닫혔다 — 그 뒤의 글자는 그 함수 안이 아니다 */
            if (paramsBefore(k - 1)) return !assignedIn(k, at);
          }
          else if (d === 0 && (c === ';' || c === ',')) break;      /* 식 본문 화살표는 쉼표에서 끝난다(객체·배열의 앞 원소, 선언 목록의 앞 선언) */
          else if (d === 0 && c === '\n' && STMT_START.test(sk.text.slice(k + 1, k + 40)) && !/[,=+\-*/%&|^?:([{<>!~.]/.test(code[R.prevSig(k - 1)] || ';')) break;      /* 세미콜론 없는 코드 — 앞줄이 연산자·=> 로 끝나지 않고 다음 줄이 새 문장 */
        }
        if (o < 0) return false;
        if (code[o] === '(') {      /* 매개변수 목록 안의 이름 — 닫는 괄호 뒤가 { 나 => 이고, 앞 낱말이 제어문이 아니다 */
          const cl = R.closeOf(o), nx = cl >= 0 ? R.nextSig(cl + 1) : -1;
          const w = R.prevSig(o - 1), head = w >= 0 && isWord(code[w]) ? code.slice(R.wordBack(w), w + 1) : '';
          if (p === at && nx >= 0 && K[nx] === CODE && (code[nx] === '{' || (code[nx] === '=' && code[nx + 1] === '>')) && !/^(?:if|for|while|switch|with)$/.test(head)) return true;
        }
        if (code[o] === '{' && !(o > 0 && code[o - 1] === '$' && K[o - 1] === STR)) {
          const b = sk.blk[o + 1], end = R.closeOf(o);
          if (end > o) {
            /* 그 블록에 바로 적은 선언(추적하는 select 정의는 아니다 — 그것은 locals 가 본다) */
            for (const m of sk.text.slice(o, end).matchAll(new RegExp('(?<![\\w$.])(?:const|let|var)\\s+' + rx(name) + '(?![\\w$])', 'g'))) {
              const at2 = o + m.index + m[0].length - name.length;
              if (sk.blk[at2] === b && !seg.consts.defAt.has(at2)) return !assignedIn(o, end);
            }
            {      /* 함수 본문의 매개변수 · catch (이름) 의 이름 */
              const pe = R.prevSig(o - 1);
              let hit = false;
              if (pe >= 1 && K[pe] === CODE && code[pe] === ')') {
                const op = R.openOf(pe), w = op >= 0 ? R.prevSig(op - 1) : -1;
                const isCatch = w >= 0 && K[w] === CODE && isWord(code[w]) && code.slice(R.wordBack(w), w + 1) === 'catch';
                hit = op >= 0 && (sk.isFn[b] || isCatch) && has(op, pe + 1);
              } else if (sk.isFn[b] && pe >= 1 && K[pe] === CODE && code[pe] === '>' && code[pe - 1] === '=') hit = paramsBefore(pe - 1);
              if (hit) return !assignedIn(o, end);
            }
          }
        }
        p = o;
      }
      return false;
    };
    /* let 이름; · var a, 이름; — 이름 앞이 let·var 이거나 그 선언 목록의 쉼표이고, 뒤가 ; , 줄바꿈(또는 블록 끝)인 자리 */
    const bareDecl = (at, len, nx) => {
      const endOk = nx >= code.length || (K[nx] === CODE && (code[nx] === ';' || code[nx] === ',' || code[nx] === '}')) || code.slice(at + len, nx).includes('\n');
      if (!endOk) return false;
      const p = R.prevSig(at - 1);
      if (p < 0 || K[p] !== CODE) return false;
      if (isWord(code[p])) return /^(?:let|var)$/.test(code.slice(R.wordBack(p), p + 1));
      if (code[p] !== ',') return false;
      for (let k = p - 1, d = 0; k >= 0 && at - k < 4000; k--) {      /* 쉼표 앞으로 같은 깊이의 let·var 까지 */
        if (K[k] !== CODE) continue;
        const c = code[k];
        if (c === ')' || c === ']' || c === '}') d++;
        else if (c === '(' || c === '[' || c === '{') { if (d === 0) return false; d--; }
        else if (c === ';' && d === 0) return false;
        else if (d === 0 && isWord(c) && !(k > 0 && K[k - 1] === CODE && isWord(code[k - 1]))) {
          let e = k; while (e < code.length && K[e] === CODE && isWord(code[e])) e++;
          const w = code.slice(k, e);
          if ((w === 'let' || w === 'var') && !(k > 0 && code[k - 1] === '.')) return true;
        }
      }
      return false;
    };
    for (const name of new Set(locals.concat(pageGlobals).map((d) => d.name))) {
      const re = new RegExp('(?<![\\w$.])(?:(?:window|globalThis|self)\\s*\\.\\s*)?' + rx(name) + '(?![\\w$])', 'g');
      for (const m of sk.text.matchAll(re)) {
        const at = m.index + m[0].length - name.length;
        if (K[at] !== CODE || seg.consts.defAt.has(at)) continue;
        const own = locals.filter((d) => d.name === name && inScope(sk, d.scope, at));
        const vis = own.concat(!own.length && shadowed(at, name) ? [] : pageGlobals.filter((d) => d.name === name));
        if (!vis.length) continue;
        const info = { table: vis[0].table, inner: vis.every((d) => d.inner), alias: vis[0].alias };
        const nx = R.nextSig(at + name.length);
        if (code[nx] === ':' && K[nx] === CODE) {      /* 객체의 키 · case 라벨 · 문장 라벨 — 삼항의 가운데 가지( c ? a + sel : b )는 쓰는 자리다 */
          const pk = R.prevSig(at - 1), pc = pk >= 0 ? code[pk] : ';';
          if (pc === '{' || pc === ',' || pc === ';' || pc === '}' || (isWord(pc) && code.slice(R.wordBack(pk), pk + 1) === 'case')) continue;
        }
        if (code[nx] === '=' && code[nx + 1] !== '=' && code[nx + 1] !== '>' && K[nx] === CODE) continue;   /* 다시 담는 줄 — 담는 글자를 ③ 이 본다 */
        if (bareDecl(at, name.length, nx)) continue;      /* 값 없이 선언만 한 자리( let sel; · var a, sel; ) — 쓰는 자리가 아니다 */
        const pv = R.prevSig(at - 1);
        if (pv >= 1 && K[pv] === CODE && code[pv] === '=' && !/[=!<>]/.test(code[pv - 1])) {      /* X = 이름 — 옮겨진 쪽(X)을 본다 */
          const q = R.prevSig(pv - 1);
          if (q >= 0 && isWord(code[q]) && seg.consts.defAt.has(R.wordBack(q))) continue;
        }
        const what = `select(${name}) ${info.table}${info.inner ? '!inner' : ''}(…)`;
        const call = R.enclosingCall(at);
        if (call) judgeEmbed(call, what, at, info);
        else judge(at, at + name.length, 'literal', `${name}(select 를 담은 변수)`, at, { strict: true, hint: HINT_LIT });
      }
    }
  }

  sites.sort((a, b) => a.pos - b.pos);
  for (const s of sites) {
    const where = `${rel}:${lineAt(s.pos)}`;
    dump({ where, rel, what: s.what, kind: s.kind, verdict: s.verdict, start: s.start, end: s.end });
    if (s.verdict === 'write') { if (LIST) console.log(`  쓰기(대상 아님)  ${where}  ${s.what}`); continue; }
    hits++; kinds[s.kind]++;
    if (s.verdict === 'long') {
      longs++;
      console.error(`✗ ${where}  ${s.what}  닫는 괄호를 ${LIMIT / 10000}만 자 안에서 찾지 못했습니다 — 한 호출의 인자가 그보다 길면 값을 변수로 빼 주세요(그 밖에는 괄호·따옴표 짝을 확인).`);
    } else if (s.verdict === 'miss') {
      bad++;
      const table = s.what.includes('partner_') ? 'partner_bookings' : 'bookings';
      if (s.kind === 'literal') console.error(`✗ ${where}  ${s.what}  조회 호출 밖에 있는 ${table} 표 이름입니다 ${s.hint || HINT_LIT}`);
      else if (s.kind === 'helper') console.error(`✗ ${where}  ${s.what}  ${table} 표 이름을 넘기는 호출인데 대기 예약을 뺀 표시가 없습니다 ${s.hint || HINT_HELPER}`);
      else console.error(`✗ ${where}  ${s.what}  ${table} 를 읽는데 대기 예약을 안 뺐습니다 ${s.hint || HINT}`);
    } else {
      how[s.verdict]++;
      if (LIST) console.log(`  ${s.verdict.padEnd(6)}  ${where}  ${s.what}`);
    }
  }
}

console.log(`검사 대상: bookings 읽기 ${hits}곳 (화면 HTML ${nHtml}개·공용 JS ${nJs}개 · 허용 파일 ${[...ALLOW_FILE].filter((f) => loaded.some((x) => x.rel === f)).length}개(step1·room·audit)는 보지 않음 — 직접 조회 ${kinds.direct} · 임베드 ${kinds.embed} · 헬퍼 호출 ${kinds.helper}${kinds.literal ? ` · 호출 밖의 표 이름 ${kinds.literal}` : ''}${writes ? ` · 쓰기 ${writes}곳은 대상 아님` : ''})`);
if (bad || longs || unread) {
  console.error(`✗ 대기 누락 ${bad}건${longs ? ` · 괄호 짝을 찾지 못한 곳 ${longs}건` : ''}${unread ? ` · 읽지 못한 스크립트·파일 ${unread}개` : ''}`);
  process.exitCode = 1;      /* process.exit(1) 은 파이프(CI)로 나가던 오류 줄을 끊는다 — 끝까지 쓰고 끝낸다 */
} else console.log(`✓ 대기 예약 제외 검사 통과 — 화면 HTML·공용 JS 에서 표 이름 글자와 임베드 ${hits}곳(필터 ${how['필터']} · 사유 주석 ${how['주석']} · 허용 문장 ${how['허용 문장']}). RPC·뷰 안의 SQL 은 이 검사가 보지 않습니다 — 대기 예약에 방·청구가 붙은 것은 검수 화면의 wait_leak 항목이 봅니다.`);
