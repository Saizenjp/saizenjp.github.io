/* ============================================================================
 * saizen-core.js — 순수 도메인 로직 공유 모듈 (테스트 가능 단위)
 * ----------------------------------------------------------------------------
 *  · 여러 페이지가 중복 구현하던 순수 함수를 한 곳으로 모은다(단일 진실원).
 *    여기서만 고치면 room·pos 등 전 페이지에 반영된다.
 *  · 브라우저(전역 SZCore) + Node(module.exports) 양쪽에서 로드된다(UMD).
 *  · DOM·Supabase·localStorage 의존 없음 → node:test 단위 테스트 대상.
 *  ⚠ 이 파일은 saizen-ops.js 와 별개(도메인 순수 로직 전용).
 * ========================================================================== */
;(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SZCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── 회원 판정 (3컬럼 OR · 회원 우선) ─────────────────────────────────────
  //  고객등급(T)·회원권구분(V)·회원구분(U) 셋 중 하나라도 회원신호면 회원.
  //  초기 회원등록 오류로 컬럼이 어긋난 케이스 대비(Min 결정).

  // 한 컬럼값이 '회원'을 가리키는지: 공란 아님 + '일반'·'비회원' 미포함
  //  → 회원권·정회원·다이아몬드·EWRC… = 회원신호 / 일반고객·일반·비회원·공란 = 아님
  function looksMember(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return false;
    if (/일반|비회원/.test(s)) return false;
    return true;
  }

  // 회원 판정. 객체(member) 또는 문자열(member_grade) 모두 허용.
  function isMember(m) {
    if (m && typeof m === 'object')
      return looksMember(m.member_grade) || looksMember(m.member_class) || looksMember(m.member_div);
    return looksMember(m);
  }

  // 화면 표시용 라벨: 실제 등급(회원권구분 V) 우선 → 고객등급(T) → 회원/일반
  function gradeLabel(m) {
    var obj = (m && typeof m === 'object');
    var cls = String((obj ? m.member_class : '') || '').trim();
    if (cls && !/일반|비회원/.test(cls)) return cls;           // 다이아몬드Ⅱ·EWRCⅡ 등
    var g = String((obj ? m.member_grade : m) || '').trim();
    if (g && g !== '회원권' && !/일반|비회원/.test(g)) return g; // 레거시: T에 실제 등급
    return isMember(m) ? '회원' : '일반';
  }

  // ── 날짜 유틸 ────────────────────────────────────────────────────────────
  //  현장 운영 데이터의 버그가 가장 잦았던 영역. 한 곳에 모아 회귀 방지.

  // 유효한 Date → 'YYYY-MM-DD' (로컬 기준). 무효/비Date → ''.
  function fmtDate(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // 다양한 입력(Date·엑셀 직렬·한국어·YYYY선두·MM/DD/YYYY) → 'YYYY-MM-DD'. 실패 시 ''.
  //   엠클릭 엑셀이 SheetJS로 숫자(직렬)·문자 등 제각각으로 들어오는 걸 흡수.
  function parseFlexDate(v) {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return fmtDate(v);
    // 엑셀 직렬 날짜(숫자) — cellDates 없이 읽으면 숫자(예: 45900). UTC 기준 환산.
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      var d = new Date(Math.round((v - 25569) * 86400000));
      return d.getUTCFullYear() + '-' +
        String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(d.getUTCDate()).padStart(2, '0');
    }
    var s = String(v).trim();
    // 한국어 "2026년 8월 15일"
    var k = s.match(/(\d{4})\s*[년.\-\/]\s*(\d{1,2})\s*[월.\-\/]\s*(\d{1,2})/);
    if (k) return k[1] + '-' + k[2].padStart(2, '0') + '-' + k[3].padStart(2, '0');
    // YYYY 선두 (YYYY-MM-DD / YYYY/M/D / YYYYMMDD)
    var m = s.match(/(\d{4})[\-\/\.]?(\d{1,2})[\-\/\.]?(\d{1,2})/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    // MM/DD/YYYY · M/D/YYYY (월 선두 — 연도가 뒤)
    var mdy = s.match(/^(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{4})$/);
    if (mdy) return mdy[3] + '-' + mdy[1].padStart(2, '0') + '-' + mdy[2].padStart(2, '0');
    return '';
  }

  // 'YYYY-MM-DD…' 문자열 → 로컬 Date(시간대 밀림 방지). 빈값/무효 → Invalid Date.
  function parseLocalDate(s) {
    if (!s) return new Date(NaN);
    if (s instanceof Date) return s;
    var p = String(s).slice(0, 10).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  // 체류 구간 [dep1,arr1) 와 [dep2,arr2) 가 하룻밤이라도 겹치는지(정원 체크 기반).
  //   'YYYY-MM-DD' 문자열은 사전식 비교로 안전. 퇴실=arr(미점유)이라 경계는 비포함.
  function overlaps(dep1, arr1, dep2, arr2) {
    return dep1 < arr2 && dep2 < arr1;
  }

  // 박수 = 도착(arr) − 출발(dep). 음수 방지.
  function nightsBetween(dep, arr) {
    var a = parseLocalDate(dep), b = parseLocalDate(arr);
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, Math.round((b - a) / 864e5));
  }

  // ── B2B(메리트↔사이젠 선계약) 정산 ──────────────────────────────────────
  //  ⚠ 현장 추가요금(추가라운드·미니바 등)과 별개. settle_merit·exec_stats 가 같은 식.
  //  숙소별 1인1박 단가. 미등록(빈값·미매칭)=0 → 호출부가 '단가 미등록' 경고/기본값 처리.
  function accomRate(accom) {
    var s = String(accom == null ? '' : accom);
    if (/쿠주|久住|구주|장기숙박|별장전용/.test(s)) return 14000;
    if (/간지/.test(s)) return 16000;
    if (/시즈|료칸/.test(s)) return 17000;
    if (/야마나미|돔하우스|별장|소보|아소/.test(s)) return 14000;
    return 0;
  }
  // 숙박비 = 인원×박수×단가 / 송영비 = 인원×6,000. {rate,lodge,transport,total}.
  function b2bFees(pax, nights, accom) {
    var p = Number(pax) || 0, n = Number(nights) || 0, rate = accomRate(accom);
    var lodge = p * n * rate, transport = p * 6000;
    return { rate: rate, lodge: lodge, transport: transport, total: lodge + transport };
  }
  // 상품명 → 숙박지(canonical accom). ⚠ 판정 순서 중요:
  //  "야마나미CC"는 골프장(코스)이라 거의 모든 상품명에 들어감. 숙박지는 별개이므로
  //  쿠주힐즈(장기숙박형 별장전용)·간지호텔·시즈를 먼저 보고, 야마나미는 폴백.
  //  예) "야마나미CC 골프 투어 \"장기숙박형 별장전용\"" → 숙박지=쿠주힐즈(골프만 야마나미CC).
  function accomFromProduct(name) {
    var s = String(name == null ? '' : name);
    if (/쿠주힐즈|구주힐즈|久住|장기\s*숙박|별장전용/.test(s)) return '쿠주힐즈';
    if (/간지/.test(s)) return '간지호텔';
    if (/시즈노야도|료칸/.test(s)) return '시즈노야도 료칸';
    if (/야마나미|돔하우스|관내별장|소보별장|아소별장/.test(s)) return '야마나미리조트';
    return '';
  }

  // ── 출발지 공항 판정 (釜山 PUS / 仁川 ICN) ──────────────────────────────────
  //  여러 페이지가 제각각(김해 누락·항공편 미고려)이던 것을 단일화.
  //   · 항공편 코드 우선: ZE(에어부산)→PUS / TW(티웨이)→ICN
  //   · 없으면 출발지 문자열: 부산·김해·PUS·BUS·PNS = PUS, 그 외 ICN
  function originPort(origin, flight) {
    var f = String(flight == null ? '' : flight).toUpperCase().replace(/\s/g, '');
    if (f.indexOf('ZE') === 0) return 'PUS';
    if (f.indexOf('TW') === 0) return 'ICN';
    var o = String(origin == null ? '' : origin), u = o.toUpperCase();
    if (o.indexOf('부산') >= 0 || o.indexOf('김해') >= 0 || u === 'PUS' || u === 'BUS' || u === 'PNS') return 'PUS';
    return 'ICN';
  }
  function isPus(origin, flight) { return originPort(origin, flight) === 'PUS'; }

  // ── 청소 효율 박수→층 배정 규칙 (야마나미 호텔동, 실제 층 zone 3~12) ─────
  //  같은 층 = 같은 박수(퇴실일)로 맞춰 청소를 한 번에.
  //   · 3·4박 → 9·6·3층 / 7박 → 11·10·7·4층 (지정층 고정)
  //   · 그 외 박수 → 유동층 12·8·5 중 '비었거나 같은 박수만 있는' 층(혼합 금지)
  var FLOOR_FIXED = { 3: [9, 6, 3], 4: [9, 6, 3], 7: [11, 10, 7, 4] };
  var FLOOR_FLEX = [12, 8, 5];
  // nights 팀이 들어갈 수 있는 층(우선순위 순). getNightSet(floor)=그 층의 현재 박수들(Set|배열).
  function allowedFloors(nights, getNightSet) {
    if (FLOOR_FIXED[nights]) return FLOOR_FIXED[nights].slice();
    return FLOOR_FLEX.filter(function (f) {
      var raw = (getNightSet ? getNightSet(f) : null) || [];
      var set = (raw instanceof Set) ? raw : new Set(raw);
      return set.size === 0 || (set.size === 1 && set.has(nights));
    });
  }

  // ── 조기 퇴실(개인 actual_dep) 식수 차감 ────────────────────────────────
  //  그 끼니에 이미 떠난 인원 수. 朝(b)=퇴실일 아침은 포함(actual_dep<date) /
  //  昼·夕(l·d)=퇴실일 아침에 떠남(actual_dep<=date). 날짜는 'YYYY-MM-DD' 사전식 비교.
  function mealGoneCount(actualDeps, date, meal) {
    if (!actualDeps || !actualDeps.length) return 0;
    return actualDeps.filter(function (ad) {
      return meal === 'b' ? (ad < date) : (ad <= date);
    }).length;
  }

  // ── 식수 규칙 (朝/昼/夕, 숙소 그룹별) ───────────────────────────────────────
  //  /app/ 와 dinner.html 에 중복됐던 핵심 규칙의 단일 진실원.
  //  OFFSITE(간지·시즈)=요일 규칙 / 그 외(야마나미·쿠주)=체류 규칙.
  var MEAL_OFFSITE = ['간지호텔', '시즈노야도 료칸'];
  var MEAL_OFFSITE_SET = new Set(MEAL_OFFSITE);
  function mealOffsite(accom) { return MEAL_OFFSITE_SET.has(accom); }
  // team={accom,dep,arr,isPus(귀국 PUS 여부)}, date='YYYY-MM-DD'
  //  → {breakfast:bool, lunchKind:''|'arr'|'cont', dinner:bool}. (pax·제외·조기퇴실·업그레이드는 호출부)
  function mealPlan(team, date) {
    var accom = team.accom, dep = team.dep, arr = team.arr, isPus = !!team.isPus;
    var wd = parseLocalDate(date).getDay();
    var isWTS = (wd === 3 || wd === 4 || wd === 0);   // 수·목·일
    var isSatSun = (wd === 6 || wd === 0);            // 토·일
    var off = MEAL_OFFSITE_SET.has(accom);
    var isIn = (dep === date), isOut = (arr === date), isMid = (dep < date && arr > date);
    var breakfast = off ? (isOut && isWTS) : (dep < date && arr >= date);
    var lunchKind = '';
    if (!off) {
      if (isMid) lunchKind = 'cont';
      else if (isIn && !isPus) lunchKind = 'arr';
      else if (isOut && isPus) lunchKind = 'cont';
    } else {
      if (isIn && isWTS && !isPus) lunchKind = 'arr';
      else if (isIn && isSatSun && accom === '간지호텔') lunchKind = 'arr';
      else if (isOut && isWTS && isPus) lunchKind = 'cont';
    }
    var dinner = (dep <= date && arr > date);
    return { breakfast: breakfast, lunchKind: lunchKind, dinner: dinner };
  }

  // ── 한글 이름 → 가타카나 요미카타(후리가나) ── 표준 한일 음역 규칙(베스트에포트, 약 85~90%).
  //   초성 자음행 + 중성 모음 합성 + 종성 받침. 비한글 문자는 그대로 통과.
  var _KANA_ROW = {
    k:['カ','キ','ク','ケ','コ'], n:['ナ','ニ','ヌ','ネ','ノ'], t:['タ','チ','ツ','テ','ト'],
    r:['ラ','リ','ル','レ','ロ'], m:['マ','ミ','ム','メ','モ'], p:['パ','ピ','プ','ペ','ポ'],
    s:['サ','シ','ス','セ','ソ'], '':['ア','イ','ウ','エ','オ'],
    j:['ジャ','ジ','ジュ','ジェ','ジョ'], ch:['チャ','チ','チュ','チェ','チョ'], h:['ハ','ヒ','フ','ヘ','ホ']
  };
  var _CHO_ROW = ['k','k','n','t','t','r','m','p','p','s','s','','j','j','ch','k','t','p','h'];
  // 중성 21: [타입(0평/1y/2w), 서브] · 평=모음인덱스(0a1i2u3e4o) · y/w=서브문자
  var _JUNG = [[0,0],[0,3],[1,'a'],[1,'e'],[0,4],[0,3],[1,'o'],[1,'e'],[0,4],[2,'a'],[2,'e'],[2,'e'],[1,'o'],[0,2],[2,'o'],[2,'e'],[2,'i'],[1,'u'],[0,2],[0,1],[0,1]];
  var _Y = {a:'ャ',u:'ュ',o:'ョ',e:'ェ'}, _YV = {a:'ヤ',u:'ユ',o:'ヨ',e:'イェ'};
  var _W = {a:'ァ',i:'ィ',u:'ゥ',e:'ェ',o:'ォ'}, _WV = {a:'ワ',i:'ウィ',u:'ウ',e:'ウェ',o:'ウォ'};
  var _JONG = ['','ク','ク','ク','ン','ン','ン','ッ','ル','ク','ム','ル','ル','ル','ル','ル','ム','プ','プ','ッ','ッ','ン','ッ','ッ','ク','ッ','プ','ッ'];
  function hangulToKana(str) {
    if (!str) return '';
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i) - 0xAC00;
      if (c < 0 || c >= 11172) { out += str.charAt(i); continue; }
      var cho = Math.floor(c / 588), jung = Math.floor((c % 588) / 28), jong = c % 28;
      var row = _CHO_ROW[cho], base = _KANA_ROW[row], jv = _JUNG[jung], syl;
      if (jv[0] === 0) syl = base[jv[1]];
      else if (jv[0] === 1) syl = (row === '') ? _YV[jv[1]] : base[1] + _Y[jv[1]];
      else syl = (row === '') ? _WV[jv[1]] : base[2] + _W[jv[1]];
      out += syl + _JONG[jong];
    }
    return out;
  }
  // 한글 성명을 성/명으로 분리(복성 포함). {sur, given} 의 가타카나 반환.
  var _COMPOUND_SUR = ['황보','남궁','선우','독고','제갈','사공','서문','동방','어금','망절'];
  function nameYomi(nameKr) {
    var s = String(nameKr || '').trim();
    if (!s) return { sur: '', given: '' };
    var surLen = 1;
    for (var i = 0; i < _COMPOUND_SUR.length; i++) { if (s.indexOf(_COMPOUND_SUR[i]) === 0) { surLen = 2; break; } }
    return { sur: hangulToKana(s.slice(0, surLen)), given: hangulToKana(s.slice(surLen)) };
  }

  // ── 영문 로마자 → 가타카나 요미카타 ── 한글 발음이 아니라 **여권 영문 철자대로** 후리가나를 단다.
  //   (예: 강병욱 KANG BYONG UK → カン・ビョン・ウク. 한글기반 ピョン(칸푱)이 아니라 영문 유성음 b→ビョン)
  //   유성 자음행(g/b/d/j) 사용이 핵심. 음절경계는 토큰(공백) 단위로 보존해 변환.
  var _EN_ROW = {
    k:['カ','キ','ク','ケ','コ'], g:['ガ','ギ','グ','ゲ','ゴ'],
    n:['ナ','ニ','ヌ','ネ','ノ'], d:['ダ','ディ','ドゥ','デ','ド'], t:['タ','ティ','トゥ','テ','ト'],
    r:['ラ','リ','ル','レ','ロ'], l:['ラ','リ','ル','レ','ロ'], m:['マ','ミ','ム','メ','モ'],
    b:['バ','ビ','ブ','ベ','ボ'], p:['パ','ピ','プ','ペ','ポ'], s:['サ','シ','ス','セ','ソ'],
    h:['ハ','ヒ','フ','ヘ','ホ'], j:['ジャ','ジ','ジュ','ジェ','ジョ'],
    ch:['チャ','チ','チュ','チェ','チョ'], sh:['シャ','シ','シュ','シェ','ショ'],
    f:['ファ','フィ','フ','フェ','フォ'], z:['ザ','ジ','ズ','ゼ','ゾ'],
    '':['ア','イ','ウ','エ','オ']
  };
  var _EN_CODA = { ng:'ン', n:'ン', m:'ム', k:'ク', g:'グ', l:'ル', r:'ル', p:'プ', b:'ブ', t:'ト', s:'ス', ch:'チ', h:'' };
  // 모음/이중모음 (긴 것부터). [철자, 활음(''/y/w), 핵모음idx(0a·1i·2u·3e·4o)]
  var _VOW = [
    ['yeo','y',4],['yae','y',3],['weo','w',4],['wae','w',3],['you','y',4],['yoo','y',2],
    ['eo','',4],['eu','',2],['ae','',3],['oe','w',3],['ui','w',1],['oo','',2],['ou','',4],['ee','',1],['uu','',2],
    ['ya','y',0],['yu','y',2],['ye','y',3],['yo','y',4],['yi','y',1],
    ['wa','w',0],['wo','w',4],['wi','w',1],['we','w',3],
    ['a','',0],['e','',3],['i','',1],['o','',4],['u','',2],
    ['y','y',1],['w','w',2]
  ];
  // 흔한 성씨의 관용 표기(영문 철자대로면 어색해지는 것만 소수 보정)
  var _SUR_EN = { park:'パク', lee:'イ', rhee:'イ', yi:'イ', oh:'オ', woo:'ウ', ahn:'アン',
                  noh:'ノ', roh:'ノ', choi:'チェ', suh:'ソ', yoo:'ユ' };
  function _romajiTok(tok) {
    var s = String(tok || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return '';
    var DBL = { kk:'k', gg:'g', tt:'t', dd:'d', pp:'p', bb:'b', ss:'s', jj:'j', ll:'l' };
    function isNuc(c) { return !!c && 'aeiouyw'.indexOf(c) >= 0; }
    function matchVowel(p) {
      for (var k = 0; k < _VOW.length; k++) { var v = _VOW[k]; if (s.substr(p, v[0].length) === v[0]) return { glide:v[1], idx:v[2], next:p + v[0].length }; }
      return null;
    }
    function compose(onset, glide, idx) {
      var base = _EN_ROW[onset] || _EN_ROW[''];
      if (glide === 'y') { var yc = ({0:'a',1:'i',2:'u',3:'e',4:'o'})[idx]; return onset === '' ? (_YV[yc] || base[idx]) : (base[1] + (_Y[yc] || '')); }
      if (glide === 'w') { var wc = ({0:'a',1:'i',2:'u',3:'e',4:'o'})[idx]; return onset === '' ? (_WV[wc] || base[idx]) : (base[2] + (_W[wc] || '')); }
      return base[idx];
    }
    var i = 0, out = '', N = s.length;
    while (i < N) {
      var c = s.charAt(i), two = s.substr(i, 2);
      var isCons = (_EN_ROW[two] && two !== '') || DBL[two] || ('kgndtrlmbpshjfczv'.indexOf(c) >= 0);
      if (isCons) {
        var onsetKey, adv;
        if (_EN_ROW[two] && two !== '') { onsetKey = two; adv = 2; }
        else if (DBL[two]) { onsetKey = DBL[two]; adv = 2; }
        else { onsetKey = (c === 'c' ? 'k' : c === 'v' ? 'b' : c); adv = 1; }
        var after = i + adv;
        if (after < N && isNuc(s.charAt(after))) {
          var v = matchVowel(after);
          if (v) { var ok = (_EN_ROW[onsetKey] !== undefined) ? onsetKey : ''; out += compose(ok, v.glide, v.idx); i = v.next; continue; }
        }
        if (c === 'n' && s.charAt(i + 1) === 'g' && !isNuc(s.charAt(i + 2))) { out += 'ン'; i += 2; continue; }   // 종성 ng
        out += (_EN_CODA[onsetKey] !== undefined ? _EN_CODA[onsetKey] : (_EN_CODA[c] || '')); i += adv; continue;
      }
      if (isNuc(c)) { var v2 = matchVowel(i); if (v2) { out += compose('', v2.glide, v2.idx); i = v2.next; continue; } }
      i++;
    }
    return out;
  }
  function romajiToKana(str) {
    return String(str || '').trim().split(/\s+/).map(_romajiTok).join('');
  }
  // 팀 대표 태그 표시용 — 개인 순번 숫자만 제거하고 숙소 분류 문자(Y/K/G/S 등)는 유지.
  //   "DAあ-1Y" → "DAあ-Y" · "GFな-12K" → "GFな-K" · 접미 없는 코드(FAあ)는 그대로.
  //   ※레스토랑 명표·항공커버처럼 대표만 나오는 출력에서 "-1" 이 무의미해 숫자만 뺀다.
  function tagStripSeq(tag) {
    return String(tag == null ? '' : tag).replace(/-(\d+)([A-Za-z]*)$/, function (m, n, s) { return s ? '-' + s : ''; });
  }

  // 영문 성명 → {sur, given} 가타카나(성=첫 토큰·관용보정, 명=나머지 토큰 각각 변환 후 결합)
  function nameYomiEn(nameEn) {
    var s = String(nameEn || '').trim();
    if (!s) return { sur: '', given: '' };
    var parts = s.split(/\s+/);
    var surTok = parts[0].toLowerCase().replace(/[^a-z]/g, '');
    var sur = _SUR_EN[surTok] || _romajiTok(parts[0]);
    var given = parts.slice(1).map(_romajiTok).join('');
    return { sur: sur, given: given };
  }

  return {
    looksMember: looksMember,
    isMember: isMember,
    gradeLabel: gradeLabel,
    fmtDate: fmtDate,
    parseFlexDate: parseFlexDate,
    parseLocalDate: parseLocalDate,
    overlaps: overlaps,
    nightsBetween: nightsBetween,
    accomRate: accomRate,
    b2bFees: b2bFees,
    accomFromProduct: accomFromProduct,
    originPort: originPort,
    isPus: isPus,
    FLOOR_FIXED: FLOOR_FIXED,
    FLOOR_FLEX: FLOOR_FLEX,
    allowedFloors: allowedFloors,
    mealGoneCount: mealGoneCount,
    MEAL_OFFSITE: MEAL_OFFSITE,
    mealOffsite: mealOffsite,
    mealPlan: mealPlan,
    hangulToKana: hangulToKana,
    nameYomi: nameYomi,
    romajiToKana: romajiToKana,
    nameYomiEn: nameYomiEn,
    tagStripSeq: tagStripSeq
  };
});
