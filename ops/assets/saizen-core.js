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
    nameYomi: nameYomi
  };
});
